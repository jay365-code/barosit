import { useEffect, useRef, useState } from "react";
import { useEntitlement } from "../auth/useEntitlement";
import { useCamera } from "./useCamera";
import { usePoseLoop } from "./usePoseLoop";
import { usePerformanceProfile } from "./usePerformanceProfile";
import { usePostureScore, type ScoreInputs } from "./usePostureScore";
import { LandmarkSmoother } from "../pose/smoothing";
import { analyzeFrame, type AnalysisDebug, type AnalyzerState } from "../pose/analyzer";
import {
  ViolationTracker,
  computeMovementRelaxation,
  relaxThresholdDurations,
} from "../pose/violationTracker";
import { ViolationSmoother } from "../pose/violationSmoother";
import { loadThresholds } from "../pose/thresholds";
import { loadBaseline, determineAngle, determineAngleSticky } from "../pose/calibration";
import {
  detectStretch,
  StretchTracker,
  type StretchKind,
} from "../pose/stretchDetector";
import {
  BreakTracker,
  BREAK_CONFIG_CHANGED_EVENT,
  loadBreakConfig,
  type BreakConfig,
  type BreakFiredEvent,
} from "../pose/breakTracker";
import {
  CumulativeLoadTracker,
  CUMULATIVE_CONFIG_CHANGED_EVENT,
  loadCumulativeConfig,
  type CumulativeLoadConfig,
} from "../pose/cumulativeLoadTracker";
import {
  VariabilityTracker,
  VARIABILITY_CONFIG_CHANGED_EVENT,
  loadVariabilityConfig,
  type VariabilityConfig,
} from "../pose/variabilityTracker";
import {
  ComplianceTracker,
  DEFAULT_COMPLIANCE_CONFIG,
  computeBackoffMultiplier,
  recordDailyCompliance,
  type NudgeKind,
} from "../pose/complianceTracker";
import {
  JitaiGate,
  DEFAULT_JITAI_CONFIG,
  JITAI_INTERRUPTIBLE_YAW_RAD,
  type JitaiConfig,
} from "../pose/jitaiGate";
import {
  ADAPTIVE_CONFIG_CHANGED_EVENT,
  computeSensitivityModifier,
  loadAdaptiveConfig,
  type AdaptiveSensitivityConfig,
} from "../pose/adaptiveSensitivity";
import {
  publishWidgetState,
  showPostureAlert,
  updateStatus,
  type WidgetState,
} from "../ipc";
import {
  appendEvent,
  updateEventDuration,
} from "../pose/eventLog";
import { postureCoaching, postureAlertTitle } from "../i18n/posture";
import i18n from "../i18n";
import {
  dispatchAlertFired,
  dispatchBreakReminder,
  dispatchCumulativeAlert,
  dispatchVariabilityAlert,
  dispatchComplianceReward,
  dispatchEscalationAlert,
  dispatchForceBlur,
  loadAlertModes,
  intensityFromDuration,
} from "../alertConfig";
import { logEvent, useHeartbeat, useWatchdog } from "../watchdog";
import { subscribeWake } from "../wakeDetector";
import type {
  CalibrationBaseline,
  DetectionFrame,
  Landmarks,
  PostureStatus,
  PostureType,
} from "../pose/types";
import { triggerAutoSync } from "../lib/syncService";

const ABSENCE_GRACE_MS = 8000;
/** 강제 모드 블러 최대 지속(ms). 안 움직여도 이 시간 후 자동 해제 → 절대 갇히지 않음. */
const FORCE_BLUR_MAX_MS = 30_000;
/** 강제 모드 블러 해제 후 재발동까지의 쿨다운(ms). 도배 방지 = "5분 스누즈". */
const FORCE_BLUR_COOLDOWN_MS = 5 * 60_000;
/** 휴식·변동성 넛지 상호 쿨다운(ms). 휴식이 우선 — 최근 휴식 넛지가 있으면 변동성
 *  억제(둘 다 "움직여라"라 근접 발사 시 중복 체감·compliance 덮어쓰기 방지). */
const MUTUAL_NUDGE_COOLDOWN_MS = 5 * 60_000;

export interface MonitoringEngineState {
  cameraReady: boolean;
  cameraError: string | null;
  detectorError: string | null;
  detectorRetry: () => void;
  baseline: CalibrationBaseline | null;
  status: PostureStatus;
  score: number;
  violations: Set<PostureType>;
  stretchToast: { kind: StretchKind; amount: number; at: number } | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** 매 분석 프레임의 raw 디버그 정보. dev 모드 오버레이용. ref 라서 갱신해도 재렌더링 없음. */
  debugRef: React.RefObject<AnalysisDebug | null>;
}

/**
 * 카메라 + 포즈 감지 + 분석 + 위반 안정화 + 점수 + 알람 + 위젯 broadcast 까지
 * 모든 모니터링 파이프라인을 한 곳에서 운영. 어떤 윈도우든 enabled=true 로
 * 호출하면 그 윈도우가 모니터링 owner 가 된다.
 */
export function useMonitoringEngine(opts: {
  enabled: boolean;
  paused: boolean;
  visible: boolean;
  onStatusChange?: (s: PostureStatus) => void;
}): MonitoringEngineState {
  // 엔진이 비활성이면 카메라도 안 잡음 — 다른 윈도우와 충돌 방지
  const { videoRef, ready: cameraReady, error: cameraError } = useCamera(
    opts.enabled,
  );
  const [baseline, setBaseline] = useState<CalibrationBaseline | null>(() =>
    loadBaseline(),
  );
  const [status, setStatus] = useState<PostureStatus>("good");
  const [violations, setViolations] = useState<Set<PostureType>>(new Set());
  const [stretchToast, setStretchToast] = useState<{
    kind: StretchKind;
    amount: number;
    at: number;
  } | null>(null);
  const [, setMaxDurationSecs] = useState<number>(0);

  // 구독 등급(free/pro)은 서버 검증 값을 신뢰한다(§7 E3-②) — localStorage 직접
  // 신뢰 시 위젯/백그라운드 관제가 캐시 조작으로 무단 활성화됐다. useEntitlement 가
  // 서버 user_subscriptions 를 재조회해 변조 시 자동 강등한다.
  const { plan: subPlan } = useEntitlement();

  // 5분 주기 백그라운드 자동 동기화 타이머 (모니터링 활성화 중일 때만 동작)
  useEffect(() => {
    if (!opts.enabled || opts.paused) return;

    // 세션 활성화 직후 최초 1회 즉시 동기화 실행
    triggerAutoSync();

    const intervalId = setInterval(() => {
      console.log("[useMonitoringEngine] 5-minute background auto-sync executing...");
      triggerAutoSync();
    }, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [opts.enabled, opts.paused]);

  const scoreInputsRef = useRef<ScoreInputs>({
    durations: [],
    secsSinceLastClear: Infinity,
    goodStreakSecs: 0,
    frozen: !opts.enabled,
  });
  const score = usePostureScore(scoreInputsRef);

  const smootherRef = useRef(new LandmarkSmoother());
  const trackerRef = useRef(new ViolationTracker());
  // pose loop heartbeat — watchdog 이 stale 감지용
  const heartbeat = useHeartbeat();
  // pose loop 이 active 한데 30초+ 프레임 안 들어오면 hard reload.
  // 10초+ stale 이면 warning log (진단 정보).
  useWatchdog("engine-frame", heartbeat.getLastAt, {
    expectedIntervalMs: 100, // ~10fps 이상 기대
    warnThresholdMs: 10_000,
    reloadThresholdMs: 30_000,
    active: opts.enabled && !opts.paused,
  });
  /** isResting 히스테리시스 + 최소 유지 시간 — 한번 진입하면 4초간 강제 유지 */
  const restingRef = useRef<{ isResting: boolean; enteredAt: number }>({
    isResting: false,
    enteredAt: 0,
  });
  /** analyzer 가 프레임 간 캐리하는 내부 상태 (chin/resting hold 카운터 등). */
  const analyzerStateRef = useRef<AnalyzerState>({});
  const REST_MIN_HOLD_MS = 4000;
  const violationSmootherRef = useRef(new ViolationSmoother());
  const stretchTrackerRef = useRef(new StretchTracker());
  const breakTrackerRef = useRef(new BreakTracker());
  const breakConfigRef = useRef<BreakConfig>(loadBreakConfig());
  const cumulativeTrackerRef = useRef(new CumulativeLoadTracker());
  const cumulativeConfigRef = useRef<CumulativeLoadConfig>(loadCumulativeConfig());
  const variabilityTrackerRef = useRef(new VariabilityTracker());
  const variabilityConfigRef = useRef<VariabilityConfig>(loadVariabilityConfig());
  const complianceTrackerRef = useRef(new ComplianceTracker());
  // 직전 프레임의 "움직이는 중" 신호(변동성 movementIndex ≥ 임계). breakTracker 의
  // 1분 움직임 목표에 착석 중 활발한 움직임도 기여시키기 위해 캐리(1프레임 지연 무해).
  const prevMovingNowRef = useRef(false);
  // 강제 모드 블러 lifecycle — 루프가 소유. active/시작시각/재발동 쿨다운.
  const forceBlurActiveRef = useRef(false);
  const forceBlurStartedAtRef = useRef(0);
  const forceBlurCooldownUntilRef = useRef(0);
  // 최근 휴식 넛지 발사 시각 — 변동성 알림을 억제해 중복 방지(상호 쿨다운).
  const lastBreakNudgeAtRef = useRef(0);
  const breakJitaiGateRef = useRef(new JitaiGate<BreakFiredEvent>());
  const jitaiConfigRef = useRef<JitaiConfig>({ ...DEFAULT_JITAI_CONFIG });
  const adaptiveConfigRef = useRef<AdaptiveSensitivityConfig>({
    ...loadAdaptiveConfig(),
    sessionStartedAt: Date.now(),
  });
  const lastPresentAtRef = useRef<number>(Date.now());
  const lastPosePublishAtRef = useRef<number>(0);
  // widget_state 발행 throttle — 매 프레임 stringify + localStorage.setItem 의
  // JS heap 압력을 줄이기 위해 status 변경이 없으면 ~3 FPS 로 발행.
  const lastWidgetPublishAtRef = useRef<number>(0);
  const lastPublishedStatusRef = useRef<string>("");
  const latestPoseRef = useRef<Landmarks | null>(null);
  const lastAlarmRef = useRef<{ type: PostureType; at: number } | null>(null);
  const debugRef = useRef<AnalysisDebug | null>(null);
  const violationsRef = useRef<Set<PostureType>>(new Set());
  const lastRecommendedAngleRef = useRef<"front" | "left" | "right" | null>(null);
  // Hysteresis 용 마지막 sticky angle. flap 차단 위해 진입 12° / 이탈 8° 적용.
  const lastAngleRef = useRef<"front" | "left" | "right" | null>(null);

  // 실제 검출이 안 되는 모든 경우 점수 변동 중단
  // (비활성, 일시정지, 카메라 미준비, 베이스라인 없음)
  useEffect(() => {
    scoreInputsRef.current = {
      ...scoreInputsRef.current,
      frozen: !opts.enabled || opts.paused || !cameraReady || !baseline,
    };
  }, [opts.enabled, opts.paused, cameraReady, baseline]);

  // 베이스라인이 바뀌면 localStorage 에서 다시 로드 (캘리브레이션 후)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "calibration_baseline") {
        setBaseline(loadBaseline());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 윈도우가 다시 보이게 되었을 때 absence 타이머 리셋 — hidden 동안 누적된
  // 시간으로 즉시 paused 진입하는 것 차단. 검출 재개 후 새로 카운트.
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) lastPresentAtRef.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // 슬립/덮개 닫힘/화면보호기 해제 후 깨어남(작업 재개) 감지 — absence 타이머 리셋로
  // 슬립 공백에 의한 자리비움 오판 방지. (카메라 재획득은 useCamera 가 wake 로 처리.)
  useEffect(() => subscribeWake(() => { lastPresentAtRef.current = Date.now(); }), []);

  // 모니터링 활성화 시 absence 타이머 리셋 — 자리비움 오인 방지.
  // (keepAwake 는 usePoseLoop 가 enabled 생명주기에 맞춰 시작/중단한다.)
  useEffect(() => {
    if (!opts.enabled) return;
    logEvent("engine", "useMonitoringEngine enabled", {
      visible: opts.visible,
    });
    lastPresentAtRef.current = Date.now();
    return () => {
      logEvent("engine", "useMonitoringEngine disabled");
    };
  }, [opts.enabled]);

  // 휴식 알림 설정 변경 시 즉시 반영
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<BreakConfig>).detail;
      breakConfigRef.current = detail ?? loadBreakConfig();
    };
    window.addEventListener(BREAK_CONFIG_CHANGED_EVENT, onChanged);
    return () =>
      window.removeEventListener(BREAK_CONFIG_CHANGED_EVENT, onChanged);
  }, []);

  // 누적 부하 설정 변경 시 즉시 반영
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<CumulativeLoadConfig>).detail;
      cumulativeConfigRef.current = detail ?? loadCumulativeConfig();
    };
    window.addEventListener(CUMULATIVE_CONFIG_CHANGED_EVENT, onChanged);
    return () =>
      window.removeEventListener(CUMULATIVE_CONFIG_CHANGED_EVENT, onChanged);
  }, []);

  // 변동성 설정 변경 시 즉시 반영
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<VariabilityConfig>).detail;
      variabilityConfigRef.current = detail ?? loadVariabilityConfig();
    };
    window.addEventListener(VARIABILITY_CONFIG_CHANGED_EVENT, onChanged);
    return () =>
      window.removeEventListener(VARIABILITY_CONFIG_CHANGED_EVENT, onChanged);
  }, []);

  // 적응형 민감도 설정 변경 시 즉시 반영 (sessionStartedAt 은 유지)
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<AdaptiveSensitivityConfig>).detail;
      const next = detail ?? loadAdaptiveConfig();
      adaptiveConfigRef.current = {
        ...next,
        sessionStartedAt: adaptiveConfigRef.current.sessionStartedAt,
      };
    };
    window.addEventListener(ADAPTIVE_CONFIG_CHANGED_EVENT, onChanged);
    return () =>
      window.removeEventListener(ADAPTIVE_CONFIG_CHANGED_EVENT, onChanged);
  }, []);

  // 일시정지 시 모든 추적기 리셋
  useEffect(() => {
    if (opts.paused) {
      setStatus("paused");
      updateStatus("paused").catch(() => undefined);
      opts.onStatusChange?.("paused");
      smootherRef.current.reset();
      trackerRef.current.reset();
      violationSmootherRef.current.reset();
      stretchTrackerRef.current.reset();
      breakTrackerRef.current.reset();
      cumulativeTrackerRef.current.reset();
      variabilityTrackerRef.current.reset();
      complianceTrackerRef.current.reset();
      breakJitaiGateRef.current.reset();
      setMaxDurationSecs(0);
      scoreInputsRef.current = {
        durations: [],
        secsSinceLastClear: Infinity,
        goodStreakSecs: 0,
        frozen: true,
      };
    } else {
      setStatus("good");
      updateStatus("good").catch(() => undefined);
      opts.onStatusChange?.("good");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.paused]);

  // 스트레칭 토스트 자동 사라짐
  useEffect(() => {
    if (!stretchToast) return;
    const id = window.setTimeout(() => setStretchToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [stretchToast]);

  const loopParams = usePerformanceProfile(opts.visible);
  const { error: detectorError, retry: detectorRetry } = usePoseLoop({
    videoRef,
    // 데스크톱 앱은 로그인 + PRO 전용(§7 E3, 해석 B). 위젯/백그라운드 관제는
    // 실효 플랜이 PRO 일 때만 동작한다. subPlan 캐시는 로그아웃 시 즉시 제거되고
    // (useAuth.signOut, E1) App.fetchSub 가 실효 플랜으로 정합(E2)하므로,
    // subPlan==='pro' 는 곧 "로그인한 PRO(또는 베타)" 를 의미한다.
    // (이전엔 opts.visible 바이패스로 FREE/게스트도 위젯 관제를 받던 누수가 있었음.)
    enabled: opts.enabled && cameraReady && !opts.paused && !!baseline && subPlan === "pro",
    // 윈도우가 다른 앱 뒤로 가려져도 (Tauri/macOS occlusion → document.hidden)
    // 모니터링은 계속해야 함. face/hands 는 자리비움/턱괴임 판정에 필수라 항상 ON.
    // 성능 프로필(Full/Eco)에 따라 fps·모델 실행 주기만 조절.
    fps: loopParams.fps,
    segmentEveryN: loopParams.segmentEveryN,
    runFace: true,
    runHands: true,
    faceEveryN: loopParams.faceEveryN,
    handsEveryN: loopParams.handsEveryN,
    // 자리비움(status "paused")이면 keepAwake 끔 → 시스템 슬립/화면보호기 허용.
    present: status !== "paused",
    onFrame: (frame: DetectionFrame) => {
      heartbeat.tick();
      if (!baseline || opts.paused) return;

      // 실시간 카메라 각도 감지 및 기준선 오토 스위칭 연동.
      // lastAngleRef 로 hysteresis 적용 — yaw 임계 근처 진동에 의한 flap 차단.
      if (frame.face) {
        const currentAngle = determineAngleSticky(frame.face, lastAngleRef.current);
        const storedAngle = determineAngle(baseline.face);
        lastAngleRef.current = currentAngle;

        if (currentAngle !== storedAngle) {
          const nextBaseline = loadBaseline(currentAngle);
          if (nextBaseline) {
            setBaseline(nextBaseline);
            lastRecommendedAngleRef.current = null;

            // 각도 복원 시 경고 가이드 배너를 끄기 위한 이벤트 발행
            window.dispatchEvent(
              new CustomEvent("barosit:calibration-recommended", {
                detail: { angle: null }
              })
            );
          } else {
            // 오직 새로운 각도로 진입했고, 해당 각도로 이벤트를 발행한 적이 없을 때만 1회 디스패치 (중복 노티 방지)
            if (lastRecommendedAngleRef.current !== currentAngle) {
              lastRecommendedAngleRef.current = currentAngle;
              window.dispatchEvent(
                new CustomEvent("barosit:calibration-recommended", {
                  detail: { angle: currentAngle }
                })
              );
            }
          }
        } else {
          // 각도가 다시 정렬되었거나 일치할 때는 추천 상태 초기화
          if (lastRecommendedAngleRef.current !== null) {
            lastRecommendedAngleRef.current = null;
            window.dispatchEvent(
              new CustomEvent("barosit:calibration-recommended", {
                detail: { angle: null }
              })
            );
          }
        }
      }
      if (!frame.pose) {
        const since = Date.now() - lastPresentAtRef.current;
        // BreakTracker 에 absence 신호 계속 전달 — 내부 5분 카운터가 누적되어
        // 짧은 자리비움(<5분)은 secsSeated 동결만, 5분 이상이면 자동 리셋.
        breakTrackerRef.current.push(
          Date.now(),
          false,
          false,
          false,
          false,
          breakConfigRef.current,
        );
        // 윈도우가 가려진 동안의 frame.pose=null 은 브라우저 throttling 영향일
        // 가능성이 크므로 absence 판정 보류 (마지막 상태 유지).
        if (since > ABSENCE_GRACE_MS && !document.hidden) {
          if (status !== "paused") {
            setStatus("paused");
            updateStatus("paused").catch(() => undefined);
            opts.onStatusChange?.("paused");
            trackerRef.current.reset();
            violationSmootherRef.current.reset();
            // breakTracker 는 reset 하지 않음 — 자체 5분 absence 카운터가 처리.
            setMaxDurationSecs(0);
            scoreInputsRef.current = {
              durations: [],
              secsSinceLastClear: Infinity,
              goodStreakSecs: 0,
              frozen: true,
            };
          }
        }
        return;
      }

      const smoothed = smootherRef.current.push(frame.pose);
      latestPoseRef.current = smoothed;

      // Phase 4 — 적응형 민감도. 자세 임계 × postureMultiplier (피로 시 완화),
      // 휴식 임계 × breakMultiplier (피로 시 더 일찍 발사).
      const adaptiveModifier = computeSensitivityModifier(
        adaptiveConfigRef.current,
        Date.now(),
      );
      const baseThresholds = loadThresholds();
      const thresholds = (Object.keys(baseThresholds) as PostureType[]).reduce(
        (acc, key) => {
          acc[key] = {
            ...baseThresholds[key],
            sensitivity:
              baseThresholds[key].sensitivity * adaptiveModifier.postureMultiplier,
          };
          return acc;
        },
        {} as typeof baseThresholds,
      );

      const result = analyzeFrame(
        { ...frame, pose: smoothed },
        baseline,
        thresholds,
        {
          ...analyzerStateRef.current,
          isResting: restingRef.current.isResting,
        },
      );
      analyzerStateRef.current = result.state;
      debugRef.current = result.debug ?? null;

      // 휴식 진입 시 enteredAt 기록 / 이탈 시 최소 유지 시간 강제
      const nowTs = Date.now();
      if (result.isResting && !restingRef.current.isResting) {
        restingRef.current.enteredAt = nowTs;
      } else if (
        !result.isResting &&
        restingRef.current.isResting &&
        nowTs - restingRef.current.enteredAt < REST_MIN_HOLD_MS
      ) {
        result.isResting = true;
        result.violations.clear();
      }
      restingRef.current.isResting = result.isResting;

      // 의자/등받이를 사람으로 잡는 false positive 차단 — pose + face 둘 다
      // 잡혀야 사람으로 인정. face 없으면 lastPresent 갱신 안 함 → 8초 후 paused.
      if (result.personPresent && frame.face) {
        lastPresentAtRef.current = Date.now();
      }
      // face 없이 8초 이상 경과 = 자리비움 (의자 false positive 차단). 점수 동결 + 분석 흐름 종료.
      // 단, 윈도우가 가려진 동안엔 브라우저가 video 를 일시정지하거나 setTimeout 을
      // throttling 해서 face 프레임 자체가 안 들어옴 — 이걸 자리비움으로 오인하면
      // 안 됨. document.hidden 이면 absence 판정 보류 (마지막 상태 유지).
      if (
        !document.hidden &&
        Date.now() - lastPresentAtRef.current > ABSENCE_GRACE_MS
      ) {
        // 자리비움 지속 — BreakTracker 에 false 신호 전달해 내부 5분 카운터 누적.
        breakTrackerRef.current.push(
          Date.now(),
          false,
          false,
          false,
          false,
          breakConfigRef.current,
        );
        if (status !== "paused") {
          setStatus("paused");
          updateStatus("paused").catch(() => undefined);
          opts.onStatusChange?.("paused");
          trackerRef.current.reset();
          violationSmootherRef.current.reset();
          // breakTracker 는 reset 하지 않음 — 자체 5분 absence 카운터가 처리.
          setMaxDurationSecs(0);
        }
        scoreInputsRef.current = {
          durations: [],
          secsSinceLastClear: Infinity,
          goodStreakSecs: 0,
          frozen: true,
        };
        return;
      }

      // 스트레칭
      const stretchKind = detectStretch(smoothed, frame.face, baseline);
      const stretchFired = stretchTrackerRef.current.push(stretchKind);
      if (stretchFired) {
        window.dispatchEvent(
          new CustomEvent("posture-bonus", { detail: stretchFired.amount }),
        );
        setStretchToast({
          kind: stretchFired.kind,
          amount: stretchFired.amount,
          at: Date.now(),
        });
        try {
          const nextCount = Number(localStorage.getItem("stretches_today") || "0") + stretchFired.amount;
          localStorage.setItem("stretches_today", String(nextCount));
          // 다른 창(메인 창 등)과 상태 동기화를 위해 storage 이벤트 수동 디스패치
          window.dispatchEvent(new StorageEvent("storage", {
            key: "stretches_today",
            newValue: String(nextCount),
          }));
        } catch (e) {
          console.error("Failed to increment stretches count in engine:", e);
        }
      }

      // Phase 1 + 4 결합 — 휴식 임계에 breakMultiplier 적용 (피로 시 단축)
      const adjustedBreakConfig: BreakConfig = {
        ...breakConfigRef.current,
        microMinutes:
          breakConfigRef.current.microMinutes * adaptiveModifier.breakMultiplier,
        standupMinutes:
          breakConfigRef.current.standupMinutes * adaptiveModifier.breakMultiplier,
        deepMinutes:
          breakConfigRef.current.deepMinutes * adaptiveModifier.breakMultiplier,
      };
      const breakResult = breakTrackerRef.current.push(
        Date.now(),
        result.personPresent,
        result.isResting,
        !!result.isStanding,
        !!stretchFired,
        adjustedBreakConfig,
        prevMovingNowRef.current,
      );
      if (breakResult.fired) {
        // JITAI — 즉시 발사하지 않고 방해 가능 순간까지 보류(아래 Phase 6 에서 발사).
        breakJitaiGateRef.current.hold(breakResult.fired, Date.now());
      }
      if (breakResult.completed) {
        // 1분 움직임 목표 달성 → 착석시계 리셋됨. 긍정 강화(보상 토스트+점수).
        dispatchComplianceReward(`break_${breakResult.completed}` as NudgeKind);
      }

      // Phase 2 — 누적 부하 추적. raw violations 기준 (analyzer 가 시간 게이트로
      // 이미 필터링한 결과). 30분 윈도우 누적 비율이 임계 초과 시 알림.
      const cumulativeResult = cumulativeTrackerRef.current.push(
        Date.now(),
        result.violations,
        cumulativeConfigRef.current,
      );
      if (cumulativeResult.fired) {
        dispatchCumulativeAlert(cumulativeResult.fired);
      }

      // Phase 3 — 자세 변동성. 어깨 Y / 코 Y·Z / face pitch 표준편차로 정체 감지.
      // 휴식·자리비움 끼면 윈도우 재시작.
      const ls = smoothed[11]; // LEFT_SHOULDER
      const rs = smoothed[12]; // RIGHT_SHOULDER
      const noseLm = smoothed[0]; // NOSE
      const variabilityMetrics =
        ls && rs && noseLm
          ? {
              sy: (ls.y + rs.y) / 2,
              ny: noseLm.y,
              nz: noseLm.z,
              p: frame.face?.pitch ?? 0,
            }
          : null;
      // 적응형 백오프 — 연속 무시가 쌓이면 변동성 알림 쿨다운을 늘려 빈도를 낮춘다.
      const backoff = computeBackoffMultiplier(
        complianceTrackerRef.current.status(),
      );
      const adjustedVariabilityConfig: VariabilityConfig = {
        ...variabilityConfigRef.current,
        cooldownMinutes: variabilityConfigRef.current.cooldownMinutes * backoff,
      };
      const variabilityResult = variabilityTrackerRef.current.push(
        Date.now(),
        result.personPresent,
        result.isResting,
        variabilityMetrics,
        adjustedVariabilityConfig,
      );
      if (variabilityResult.fired) {
        // 상호 쿨다운 — 휴식 넛지가 대기 중이거나 최근에 떴으면 변동성 억제(휴식 우선).
        // 둘 다 "움직여라"라 근접 발사 시 중복 잔소리·compliance 덮어쓰기를 막는다.
        const breakActive =
          breakJitaiGateRef.current.isPending ||
          Date.now() - lastBreakNudgeAtRef.current < MUTUAL_NUDGE_COOLDOWN_MS;
        if (!breakActive) {
          dispatchVariabilityAlert(variabilityResult.fired);
          complianceTrackerRef.current.notifyFired("variability", Date.now());
        }
      }

      // Phase 6 — JITAI: 보류된 휴식 알림을 방해 가능 순간(고개 돌림·움직임)에 발사.
      // 사용자가 이미 휴식을 취했으면 보류 폐기. 좋은 순간이 없어도 maxHold 후 발사.
      const movedNow =
        variabilityResult.status.movementIndex >=
        variabilityConfigRef.current.threshold;
      // 다음 프레임 breakTracker 목표 누적에 쓰도록 캐리.
      prevMovingNowRef.current = movedNow;
      const tookBreakNow =
        !!stretchFired ||
        !!result.isStanding ||
        result.isResting ||
        !result.personPresent;
      if (tookBreakNow) {
        breakJitaiGateRef.current.reset();
      } else if (breakJitaiGateRef.current.isPending) {
        const yawDelta =
          frame.face && baseline?.face
            ? Math.abs(frame.face.yaw - baseline.face.yaw)
            : 0;
        const interruptible =
          yawDelta > JITAI_INTERRUPTIBLE_YAW_RAD || movedNow;
        const releasedBreak = breakJitaiGateRef.current.push(
          Date.now(),
          { interruptible },
          jitaiConfigRef.current,
        );
        if (releasedBreak) {
          dispatchBreakReminder(releasedBreak);
          complianceTrackerRef.current.notifyFired(
            `break_${releasedBreak.stage}` as NudgeKind,
            Date.now(),
          );
          lastBreakNudgeAtRef.current = Date.now();
        }
      }

      // Phase 5 — 알림 준수 추적. 발사된 알림 후 응답 윈도우 내 행동으로 준수/미준수
      // 확정. 준수 시 긍정 강화(점수 보너스), 둘 다 일일 집계.
      const complianceResult = complianceTrackerRef.current.push(
        Date.now(),
        {
          tookBreak:
            !!stretchFired ||
            !!result.isStanding ||
            result.isResting ||
            !result.personPresent,
          movedSlightly:
            variabilityResult.status.movementIndex >=
            variabilityConfigRef.current.threshold,
        },
        DEFAULT_COMPLIANCE_CONFIG,
      );
      if (complianceResult.resolved) {
        const { kind, complied } = complianceResult.resolved;
        recordDailyCompliance(complied, Date.now());
        if (complied) {
          // 휴식 알림(break_*) 보상은 1분 목표 달성(breakResult.completed)에서 지급 →
          // 순간 반응엔 중복 보상 금지. 변동성 알림만 즉시 보상.
          if (kind === "variability") dispatchComplianceReward(kind);
        } else {
          // 무시됨. 강제 모드(옵트인)면 화면 블러 에스컬레이션(휴식·변동성 둘 다),
          // 아니면 기존 집중모드 카드(휴식만).
          const modes = loadAlertModes();
          if (
            modes.forceMode &&
            !forceBlurActiveRef.current &&
            Date.now() >= forceBlurCooldownUntilRef.current
          ) {
            forceBlurActiveRef.current = true;
            forceBlurStartedAtRef.current = Date.now();
            dispatchForceBlur(true);
          } else if (kind.startsWith("break_") && modes.focusMode) {
            dispatchEscalationAlert(kind);
          }
        }
      }

      // 강제 모드 블러 해제 — 움직이면 즉시, 안 움직여도 최대 시간 후 자동 해제
      // (절대 갇히지 않음). 해제 후 재발동 쿨다운으로 도배 방지.
      if (forceBlurActiveRef.current) {
        const elapsed = Date.now() - forceBlurStartedAtRef.current;
        if (tookBreakNow || movedNow || elapsed > FORCE_BLUR_MAX_MS) {
          forceBlurActiveRef.current = false;
          forceBlurCooldownUntilRef.current = Date.now() + FORCE_BLUR_COOLDOWN_MS;
          dispatchForceBlur(false);
        }
      }

      // 위반 안정화
      const smoothedViolations = violationSmootherRef.current.push(
        result.violations,
      );
      const stableViolations = smoothedViolations.stable;
      const activeDurations = Array.from(stableViolations).map(
        (t) => smoothedViolations.durations[t],
      );
      scoreInputsRef.current = {
        durations: activeDurations,
        secsSinceLastClear: smoothedViolations.secsSinceLastClear,
        goodStreakSecs: smoothedViolations.goodStreakSecs,
        // 휴식 중에는 점수 변동 금지 (의도된 등받이 기대기)
        frozen: result.isResting,
      };
      const maxDur =
        activeDurations.length > 0 ? Math.max(...activeDurations) : 0;
      setMaxDurationSecs(maxDur);

      setViolations(stableViolations);
      violationsRef.current = stableViolations;

      // 알람 트래킹 — 휴식 중이면 트래커 리셋해서 누적 시간 0부터 다시
      if (result.isResting) {
        trackerRef.current.reset();
      }
      // 움직임 인지 완화 — 활발히 움직이는(변동성 높은) 사용자는 위반 알람 임계를
      // 늘려 "자세 바꾸는 중 잠깐 나쁜 모양"을 봐준다. 한 자세에 눌러앉으면(움직임↓)
      // movementIndex 가 떨어져 정상 임계로 복귀.
      const relaxedThresholds = relaxThresholdDurations(
        thresholds,
        computeMovementRelaxation(
          variabilityResult.status.movementIndex,
          variabilityConfigRef.current.threshold,
        ),
      );
      const fired = result.isResting
        ? []
        : trackerRef.current.update(stableViolations, relaxedThresholds);

      const cleared = trackerRef.current.getAndClearRecentCleared();
      for (const event of cleared) {
        updateEventDuration(event.id, event.durationSecs);
      }
      if (fired.length > 0) {
        const latest = fired[fired.length - 1];
        lastAlarmRef.current = { type: latest.type, at: Date.now() };
      }
      for (const event of fired) {
        appendEvent({
          type: event.type,
          startedAt: event.startedAt,
          durationSecs: event.durationSecs,
        });
        const intensity = intensityFromDuration(event.durationSecs);
        // 정적 다국어 코칭 (AI 생성 코칭 대체) — 알림 본문에 즉시 사용.
        // 오버레이는 coachingMessage=null이면 coaching:tip 키로 자체 폴백한다.
        dispatchAlertFired({
          postureType: event.type,
          durationSecs: event.durationSecs,
          intensity,
          coachingMessage: null,
        });
        showPostureAlert({
          posture_type: event.type,
          duration_secs: event.durationSecs,
          severity: "bad",
          coaching_message: postureCoaching(event.type),
          title: postureAlertTitle(event.type),
          body_fallback: i18n.t("notifications:fallbackBody", { sec: event.durationSecs }),
        }).catch(() => undefined);
      }

      // 상태 갱신
      const next: PostureStatus = result.isResting
        ? "resting"
        : result.isStanding
          ? "standing"
          : stableViolations.size > 0
            ? trackerRef.current.hasAlertedActive()
              ? "bad"
              : "warning"
            : "good";
      if (next !== status) {
        setStatus(next);
        updateStatus(next).catch(() => undefined);
        opts.onStatusChange?.(next);
      }

      // 위젯 broadcast
      const away = false; // 활성 분석 중이므로 자리비움 아님
      const stage: WidgetState["stage"] =
        stableViolations.size === 0
          ? 0
          : maxDur >= 60
            ? 4
            : maxDur >= 30
              ? 3
              : maxDur >= 15
                ? 2
                : 1;
      // 포즈는 ~3 FPS 로 throttle
      const now = Date.now();
      let poseToSend: Landmarks | null = null;
      if (now - lastPosePublishAtRef.current > 330) {
        poseToSend = latestPoseRef.current;
        lastPosePublishAtRef.current = now;
      }
      const widgetState: WidgetState = {
        status: opts.paused ? "paused" : next,
        score,
        away,
        violations: Array.from(stableViolations),
        lastAlarm: lastAlarmRef.current,
        maxDurationSecs: maxDur,
        stage,
        pose: poseToSend,
        breakStatus: breakResult.status,
      };
      // status 가 바뀌면 즉시 발행 (위젯 상태 변화 지연 방지),
      // 그 외엔 333ms throttle (3 FPS) — pose throttle 주기와 일치.
      if (
        widgetState.status !== lastPublishedStatusRef.current ||
        now - lastWidgetPublishAtRef.current > 330
      ) {
        lastWidgetPublishAtRef.current = now;
        lastPublishedStatusRef.current = widgetState.status;
        localStorage.setItem("widget_state", JSON.stringify(widgetState));
        publishWidgetState(widgetState).catch(() => undefined);
      }
    },
  });

  const statusRef = useRef<PostureStatus>(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const scoreRef = useRef<number>(score);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  // 오늘 총 사용 시간, 좋은 자세 시간, 점수 누적 타이머 (옵션 A)
  useEffect(() => {
    if (!opts.enabled || opts.paused) return;

    const id = window.setInterval(() => {
      // 자리비움(paused) 상태가 아닐 때만 카운팅
      if (statusRef.current === "paused") return;

      try {
        // 1. 총 사용 시간 누적
        const currentActive = Number(localStorage.getItem("active_duration_today") || "0");
        const nextActive = currentActive + 1;
        localStorage.setItem("active_duration_today", String(nextActive));

        // 1.5. 시간대별 착석 시간 누적
        const currentHour = new Date().getHours();
        const activeByHourRaw = localStorage.getItem("active_duration_by_hour");
        let activeByHour = new Array(24).fill(0);
        try {
          if (activeByHourRaw) {
            const parsed = JSON.parse(activeByHourRaw);
            if (Array.isArray(parsed) && parsed.length === 24) {
              activeByHour = parsed;
            }
          }
        } catch {
          // ignore
        }
        activeByHour[currentHour] = (activeByHour[currentHour] || 0) + 1;
        localStorage.setItem("active_duration_by_hour", JSON.stringify(activeByHour));

        // 2. 점수 누적합 가산
        const currentScoreSum = Number(localStorage.getItem("score_sum_today") || "0");
        const nextScoreSum = currentScoreSum + scoreRef.current;
        localStorage.setItem("score_sum_today", String(nextScoreSum));

        // 3. 좋은 자세 시간 누적 (위반이 없을 때)
        const currentGood = Number(localStorage.getItem("good_duration_today") || "0");
        let nextGood = currentGood;
        const goodByHourRaw = localStorage.getItem("good_duration_by_hour");
        let goodByHour = new Array(24).fill(0);
        try {
          if (goodByHourRaw) {
            const parsed = JSON.parse(goodByHourRaw);
            if (Array.isArray(parsed) && parsed.length === 24) {
              goodByHour = parsed;
            }
          }
        } catch {
          // ignore
        }

        if (violationsRef.current.size === 0) {
          nextGood = currentGood + 1;
          localStorage.setItem("good_duration_today", String(nextGood));

          goodByHour[currentHour] = (goodByHour[currentHour] || 0) + 1;
          localStorage.setItem("good_duration_by_hour", JSON.stringify(goodByHour));
        }

        // 다중 윈도우 동기화를 위한 스토리지 이벤트 디스패치
        window.dispatchEvent(new StorageEvent("storage", {
          key: "active_duration_today",
          newValue: String(nextActive),
        }));
        window.dispatchEvent(new StorageEvent("storage", {
          key: "active_duration_by_hour",
          newValue: JSON.stringify(activeByHour),
        }));
        window.dispatchEvent(new StorageEvent("storage", {
          key: "score_sum_today",
          newValue: String(nextScoreSum),
        }));
        if (violationsRef.current.size === 0) {
          window.dispatchEvent(new StorageEvent("storage", {
            key: "good_duration_today",
            newValue: String(nextGood),
          }));
          window.dispatchEvent(new StorageEvent("storage", {
            key: "good_duration_by_hour",
            newValue: JSON.stringify(goodByHour),
          }));
        }
      } catch (e) {
        console.error("Failed to accumulate monitoring stats in engine:", e);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [opts.enabled, opts.paused]);

  return {
    cameraReady,
    cameraError,
    detectorError,
    detectorRetry,
    baseline,
    status,
    score,
    violations,
    stretchToast,
    videoRef,
    debugRef,
  };
}
