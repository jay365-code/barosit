import { useEffect, useRef, useState } from "react";
import { detectFromVideo, initLandmarkers, disposeLandmarker } from "../pose/detector";
import { startKeepAwake, stopKeepAwake } from "../keepAwake";
import type { DetectionFrame } from "../pose/types";

// enabled 가 이 시간(ms) 이상 false 로 유지되면 모델을 해제해 메모리를 반납한다.
// 잠깐 멈췄다 재개하는 경우엔 이 grace 안에 들어와 reload 없이 즉시 복귀.
const IDLE_DISPOSE_MS = 60_000;

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
    return "자세 감지 모델을 불러올 수 없어요. 인터넷 연결을 확인하고 다시 시도해주세요.";
  }
  return `자세 감지 초기화 실패: ${raw}`;
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
        await initLandmarkers();
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
    let cancelled = false;
    let timer: number | null = null;
    let tickCount = 0;
    let lastTs = 0;

    const tick = () => {
      if (cancelled) return;
      const start = performance.now();
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        timer = window.setTimeout(tick, intervalMs);
        return;
      }
      const ts = performance.now();
      const safeTs = ts <= lastTs ? lastTs + 1 : ts;
      lastTs = safeTs;
      tickCount += 1;
      const segment =
        segmentEveryN <= 0 ? false : tickCount % segmentEveryN === 0;
      // faceEveryN/handsEveryN: N틱당 1회만 모델 실행, 나머지 틱은 detector가
      // 직전 결과를 재사용. 자세는 느린 신호라 stride 지연이 품질에 영향 없음.
      const face = runFace && (faceEveryN <= 1 || tickCount % faceEveryN === 0);
      const hands =
        runHands && (handsEveryN <= 1 || tickCount % handsEveryN === 0);
      const frame = detectFromVideo(video, safeTs, {
        segment,
        face,
        hands,
      });
      callbackRef.current?.(frame);
      const elapsed = performance.now() - start;
      const wait = Math.max(0, intervalMs - elapsed);
      timer = window.setTimeout(tick, wait);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [ready, enabled, fps, segmentEveryN, runFace, runHands, faceEveryN, handsEveryN, videoRef]);

  return { ready, error, retry };
}
