import { useCallback, useEffect, useRef, useState } from "react";
import i18n from "../i18n";
import {
  detectFromVideo,
  initLandmarkers,
  disposeLandmarker,
  refreshLandmarkers,
} from "../pose/detector";
import { subscribeWake } from "../wakeDetector";
import { startKeepAwake, stopKeepAwake } from "../keepAwake";
import type { DetectionFrame } from "../pose/types";

// enabled 가 이 시간(ms) 이상 false 로 유지되면 모델을 해제해 메모리를 반납한다.
// 잠깐 멈췄다 재개하는 경우엔 이 grace 안에 들어와 reload 없이 즉시 복귀.
const IDLE_DISPOSE_MS = 60_000;

// 모델 init(WASM fileset + .task 다운로드) 상한. 자리비움으로 모델을 해제한 뒤
// 복귀할 때 CDN 재요청이 막힌 망(사내 방화벽 등)에서 무한 행(hang) 걸리면 ready 가
// 영영 false 로 남아 "카메라 ON·실루엣/측정 없음·에러도 없음" 으로 고착된다. 상한을
// 두어 그 경우 throw → 아래 catch 가 에러+재시도 배너를 띄워 사용자가 복구하게 한다.
const INIT_TIMEOUT_MS = 20_000;

// [세그멘터 워치독] pose 는 계속 잡히는데(사람 있음) 실루엣 mask 만 이 시간 이상
// 끊기면 세그멘터가 런타임에 죽은 것(GPU 컨텍스트 소실 등)으로 보고 모델을 재구축한다.
// 실루엣이 마지막 프레임에 얼어붙고 dot 만 따로 노는 증상의 원인-무관 자가복구.
// 실제 임계는 seg 실행 간격(intervalMs*segmentEveryN)의 8배와 이 값 중 큰 쪽 —
// segmentEveryN 이 크게 설정돼도 정상 mask 간격을 stall 로 오탐하지 않게 한다.
const MASK_STALL_MS = 4_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(
      // 메시지에 "load/network" 포함 → friendlyModelError 가 네트워크 안내로 매핑.
      () => reject(new Error(`${label}: model load timed out (network)`)),
      ms,
    );
    p.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(id);
        reject(e);
      },
    );
  });
}

export interface UsePoseLoopOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  fps?: number;
  /** segmenter를 N틱마다 실행. 기본 2. */
  segmentEveryN?: number;
  /** Face Landmarker 실행. 기본 true. */
  runFace?: boolean;
  /** Hand Landmarker 실행. 기본 true. */
  runHands?: boolean;
  /** Face Landmarker를 N틱마다 실행. 기본 1(매 틱). 스킵 틱은 detector가 직전 결과 재사용. */
  faceEveryN?: number;
  /** Hand Landmarker를 N틱마다 실행. 기본 1(매 틱). 스킵 틱은 detector가 직전 결과 재사용. */
  handsEveryN?: number;
  /**
   * 사용자가 자리에 있는지(자리비움/화면보호기 아님). 기본 true.
   * keepAwake 는 enabled && present 일 때만 켜진다 — 자리비움이면 keepAwake 를 꺼서
   * 시스템이 잠들고 화면보호기가 뜰 수 있게 한다. 감지 루프 자체는 enabled 면 계속
   * 돌아(복귀 감지용) 모델은 유지된다.
   */
  present?: boolean;
  onFrame?: (frame: DetectionFrame) => void;
}

/**
 * Pose + Face + Hand + Segmenter를 주기적으로 실행.
 * setInterval 대신 setTimeout-재귀 패턴을 사용해, 한 틱이 늦으면 다음 틱이
 * 큐잉되지 않고 단순히 늦춰진다 (백프레셔 방지 → 손/포즈 표시가 실시간에 가까움).
 */
function friendlyModelError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  // 네트워크/CDN/WASM 로드 실패는 한 줄로 묶어서 안내. 원본 메시지는 콘솔에 남기고 사용자에겐 가림.
  if (/fetch|network|load|wasm|tflite|task/i.test(raw)) {
    return i18n.t("errors:poseModelLoad");
  }
  return i18n.t("errors:poseInitFailed", { error: raw });
}

export function usePoseLoop({
  videoRef,
  enabled,
  fps = 8,
  segmentEveryN = 2,
  runFace = true,
  runHands = true,
  faceEveryN = 1,
  handsEveryN = 1,
  present = true,
  onFrame,
}: UsePoseLoopOptions): {
  ready: boolean;
  error: string | null;
  retry: () => void;
} {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const callbackRef = useRef(onFrame);
  callbackRef.current = onFrame;

  // [레버 1] 모델 로딩을 실제 감지가 켜질 때(enabled)까지 미룬다. 숨겨진 위젯 창이나
  // 일시정지 상태에서 모델 4개를 메모리에 올리지 않아 중복·불필요 상주를 막는다.
  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        await withTimeout(initLandmarkers(), INIT_TIMEOUT_MS, "initLandmarkers");
        if (cancelled) return;
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        console.error("initLandmarkers failed:", e);
        setError(friendlyModelError(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [retryToken, enabled]);

  // [레버 2] 유휴 시 모델 해제. enabled 가 IDLE_DISPOSE_MS 이상 false 면
  // disposeLandmarker 로 GPU 텍스처·WASM 버퍼를 반납. 재개 시 init effect 가
  // 다시 로딩(~1~2s). grace 덕에 잠깐 멈춤/재개에선 reload 가 안 일어난다.
  useEffect(() => {
    if (enabled) return;
    const id = window.setTimeout(() => {
      disposeLandmarker();
      setReady(false);
    }, IDLE_DISPOSE_MS);
    return () => window.clearTimeout(id);
  }, [enabled]);

  // 언마운트(창 종료/뷰 전환) 시 모델 해제 — 메모리 즉시 반납.
  useEffect(() => {
    return () => {
      disposeLandmarker();
    };
  }, []);

  // 메모리 reload 직전에 모델을 명시적으로 해제해 GPU(WebGL) 컨텍스트·WASM 버퍼를
  // 반납한다. WKWebView 는 hard reload 시 WebGL 컨텍스트를 즉시 회수하지 않아,
  // 분당 reload 가 누적되면 컨텍스트가 고갈돼 다음 init 의 createFromOptions 가
  // "null is not an object (evaluating 't.alpha')" 로 throw 한다(GPU delegate 생성 실패).
  // reload 전에 close() 로 비워 GPU 경로를 유지한다(폴백 CPU 로 떨어지지 않게).
  useEffect(() => {
    const onBeforeReload = () => disposeLandmarker();
    window.addEventListener("barosit:before-memory-reload", onBeforeReload);
    return () =>
      window.removeEventListener("barosit:before-memory-reload", onBeforeReload);
  }, []);

  // [경량 메모리 회수] useMemoryReloadGuard 가 자주(기본 90s) 발행하는 soft-refresh
  // 신호에 모델만 dispose+reinit 한다. 페이지 reload 가 아니라 화면 깜빡임이 없고,
  // MediaPipe/GPU 메모리(증가분의 대부분)를 회수한다. 재생성 중(~1~2s)에는 빈 프레임이
  // 흐르지만 detectFromVideo 의 null 가드 + SilhouetteOverlay 의 직전 mask 유지로
  // 화면은 그대로다. enabled 가 아니면(일시정지/유휴) 스킵, 중복 실행은 ref 로 차단.
  const refreshingRef = useRef(false);

  // 모델 재빌드의 단일 진입점 — soft-refresh·세그멘터 워치독·detect 에러복구·wake
  // 선제 재빌드가 모두 이걸 거친다. refreshingRef 로 중복/동시 실행을 차단하고,
  // 재빌드 중에는 tick 이 detect 를 스킵해 null↔재생성 레이스를 막는다.
  const rebuild = useCallback((reason: string, e?: unknown) => {
    if (refreshingRef.current) return;
    console.warn(`rebuilding landmarkers — ${reason}`, e ?? "");
    refreshingRef.current = true;
    refreshLandmarkers()
      .catch((err) => console.warn(`${reason} refresh failed:`, err))
      .finally(() => {
        refreshingRef.current = false;
      });
  }, []);

  // [경량 메모리 회수] useMemoryReloadGuard 가 자주(기본 90s) 발행하는 soft-refresh
  // 신호에 모델만 dispose+reinit 한다. 페이지 reload 가 아니라 화면 깜빡임이 없고,
  // MediaPipe/GPU 메모리(증가분의 대부분)를 회수한다. 재생성 중(~1~2s)에는 빈 프레임이
  // 흐르지만 detectFromVideo 의 null 가드 + SilhouetteOverlay 의 직전 mask 유지로
  // 화면은 그대로다. enabled 가 아니면(일시정지/유휴) 스킵, 중복 실행은 ref 로 차단.
  useEffect(() => {
    if (!enabled) return;
    const onSoftRefresh = () => rebuild("soft memory refresh");
    window.addEventListener("barosit:soft-memory-refresh", onSoftRefresh);
    return () =>
      window.removeEventListener("barosit:soft-memory-refresh", onSoftRefresh);
  }, [enabled, rebuild]);

  // [복귀 시 선제 재빌드 — 루트 픽스] 시스템 슬립/절전 복귀 후엔 WKWebView 의 WebGL
  // 컨텍스트가 무효화돼, GPU delegate 로 만든 landmarker 에 detectForVideo 를 부르면
  // WASM 이 "Aborted()" 로 죽는다(오류 리포트의 실제 발생 지점). 카메라는 useCamera 가
  // wake 에 복구하지만 GPU landmarker 는 죽은 컨텍스트를 그대로 들고 있으므로, 여기서도
  // wake 에 선제 재빌드해 새 컨텍스트에서 GPU→CPU 를 다시 협상한다. 복귀 첫 프레임부터
  // 정상 동작 → abort 자체가 안 난다(tick 의 catch 는 놓친 경우의 안전망).
  useEffect(() => {
    if (!enabled) return;
    return subscribeWake(() => rebuild("system wake"));
  }, [enabled, rebuild]);

  // [배터리] keepAwake(무음 오디오로 webview suspend 방지)를 enabled 에 묶는다.
  // 감지 중일 때만 깨어 있고, 일시정지/자리비움/유휴/언마운트면 즉시 중단해 시스템이
  // 잠들 수 있게 한다(맥 활성 상태 보기의 "잠자기 방지"가 항상 켜져 있던 배터리 누수
  // 해결). 모델 해제와 달리 grace 없음 — AudioContext 재시작은 싸고, 빨리 멈출수록
  // 배터리 이득. AudioContext 는 사용자 제스처 후 동작하므로 pointerdown 으로 재시도.
  useEffect(() => {
    if (!enabled || !present) return;
    startKeepAwake();
    const onInteract = () => startKeepAwake();
    window.addEventListener("pointerdown", onInteract, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onInteract);
      stopKeepAwake();
    };
  }, [enabled, present]);

  const retry = () => {
    setReady(false);
    setRetryToken((n) => n + 1);
  };

  useEffect(() => {
    if (!ready || !enabled) return;
    const intervalMs = Math.round(1000 / fps);
    // seg 실행 간격의 8배(=8회 연속 누락)와 MASK_STALL_MS 중 큰 쪽을 stall 임계로.
    const segIntervalMs = intervalMs * Math.max(1, segmentEveryN);
    const maskStallMs = Math.max(MASK_STALL_MS, segIntervalMs * 8);
    let cancelled = false;
    let timer: number | null = null;
    let tickCount = 0;
    let lastTs = 0;
    // 워치독 기준 시각 — 마지막으로 mask 를 받은 때. 루프 시작 시각으로 초기화해
    // 첫 mask 도착 전 오발동을 막는다.
    let lastMaskTs = performance.now();

    const tick = () => {
      if (cancelled) return;
      const start = performance.now();
      try {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        // 재빌드(soft-refresh/워치독/에러복구) 진행 중엔 모델이 null↔재생성 사이라
        // detect 진입 금지. 스킵해도 finally 가 다음 틱을 재예약하므로 루프는 유지.
        if (refreshingRef.current) return;

        const ts = performance.now();
        const safeTs = ts <= lastTs ? lastTs + 1 : ts;
        lastTs = safeTs;
        tickCount += 1;
        const segment =
          segmentEveryN <= 0 ? false : tickCount % segmentEveryN === 0;
        // faceEveryN/handsEveryN: N틱당 1회만 모델 실행, 나머지 틱은 detector가
        // 직전 결과를 재사용. 자세는 느린 신호라 stride 지연이 품질에 영향 없음.
        const face =
          runFace && (faceEveryN <= 1 || tickCount % faceEveryN === 0);
        const hands =
          runHands && (handsEveryN <= 1 || tickCount % handsEveryN === 0);
        const frame = detectFromVideo(video, safeTs, {
          segment,
          face,
          hands,
        });
        callbackRef.current?.(frame);

        // [세그멘터 워치독] pose 는 잡히는데 mask 만 maskStallMs 이상 끊기면 세그멘터
        // 재구축으로 자가복구. pose=null(자리비움) 이나 refresh 중(전 모델 null → pose 도
        // null)에는 발동하지 않는다. segment 틱에서만 stall 판정(스킵 틱은 원래 mask=null).
        const now = performance.now();
        if (frame.mask) {
          lastMaskTs = now;
        } else if (
          segment &&
          frame.pose &&
          now - lastMaskTs > maskStallMs &&
          !refreshingRef.current
        ) {
          lastMaskTs = now; // 재트리거 방지 — 다음 발동까지 stall 창을 다시 채워야 함
          rebuild(
            `segmenter stalled ${Math.round(now - lastMaskTs)}ms with pose present`,
          );
        }
      } catch (e) {
        // MediaPipe WASM abort("Aborted()") — GPU(WebGL) 컨텍스트 상실·복귀 레이스 등으로
        // detectForVideo 가 throw. 여기서 삼키지 않으면 (1) 예외가 setTimeout 밖으로 튀어
        // window.onerror 로 리포트되고, (2) 아래 finally 이전 코드였다면 재예약이 실행되지
        // 않아 tick 루프가 영구 정지한다(감지기 사망). 모델을 재빌드(createWithFallback 이
        // GPU 재시도 후 CPU 폴백)해 자가복구하고, finally 가 루프를 계속 살린다.
        rebuild("detect loop error", e);
      } finally {
        if (!cancelled) {
          const elapsed = performance.now() - start;
          const wait = Math.max(0, intervalMs - elapsed);
          timer = window.setTimeout(tick, wait);
        }
      }
    };
    tick();

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [ready, enabled, fps, segmentEveryN, runFace, runHands, faceEveryN, handsEveryN, videoRef, rebuild]);

  return { ready, error, retry };
}
