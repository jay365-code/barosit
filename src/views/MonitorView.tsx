import { useEffect, useRef, useState } from "react";
import {
  loadProfile,
  PROFILE_CHANGED_EVENT,
  type UserProfile,
} from "../userProfile";
import { useCamera } from "../hooks/useCamera";
import { usePoseLoop } from "../hooks/usePoseLoop";
import { LandmarkOverlay } from "../components/LandmarkOverlay";
import { SilhouetteOverlay } from "../components/SilhouetteOverlay";
import { usePostureScore } from "../hooks/usePostureScore";
import { LandmarkSmoother } from "../pose/smoothing";
import { analyzeFrame, type AnalysisDebug, type AnalyzerState } from "../pose/analyzer";
import { DebugOverlay } from "../components/DebugOverlay";
import { ViolationTracker } from "../pose/violationTracker";
import { ViolationSmoother } from "../pose/violationSmoother";
import {
  detectStretch,
  STRETCH_LABEL,
  StretchTracker,
  type StretchKind,
} from "../pose/stretchDetector";
import {
  BreakTracker,
  BREAK_CONFIG_CHANGED_EVENT,
  loadBreakConfig,
  type BreakConfig,
  type BreakStatus,
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
  ADAPTIVE_CONFIG_CHANGED_EVENT,
  computeSensitivityModifier,
  loadAdaptiveConfig,
  type AdaptiveSensitivityConfig,
} from "../pose/adaptiveSensitivity";
import type { ScoreInputs } from "../hooks/usePostureScore";
import {
  loadThresholds,
  saveThresholds,
  THRESHOLDS_CHANGED_EVENT,
} from "../pose/thresholds";
import type { ThresholdMap } from "../pose/thresholds";
import { isPrivacyMode } from "../privacyConfig";
import {
  dispatchAlertFired,
  dispatchBreakReminder,
  dispatchCumulativeAlert,
  dispatchVariabilityAlert,
  intensityFromDuration,
} from "../alertConfig";
import { startKeepAwake } from "../keepAwake";
import { useHeartbeat, useWatchdog } from "../watchdog";
import { MAIN_SLOGAN, pickSubSlogan } from "../slogans";
import type {
  CalibrationBaseline,
  DetectionFrame,
  HandData,
  Landmark,
  Landmarks,
  MaskBuffer,
  PostureStatus,
  PostureType,
} from "../pose/types";
import {
  isMinibarVisible,
  publishWidgetState,
  setMinibarVisible,
  setWidgetVisible,
  showPostureAlert,
  switchToWidgetMode,
  updateStatus,
  type WidgetLastAlarm,
} from "../ipc";
import { platform } from "../platform";
import {
  appendEvent,
  computeDailyStats,
  loadEvents,
  startOfToday,
} from "../pose/eventLog";
import { fetchCoachingMessage } from "../llmConfig";
import { Icon } from "../components/Icon";
import { ScoreRing } from "../components/ScoreRing";
import {
  PostureFigure,
  type PostureFigureState,
} from "../components/PostureFigure";

interface Props {
  baseline: CalibrationBaseline;
  paused: boolean;
  onTogglePause: () => void;
  onRecalibrate: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  onStatusChange?: (status: PostureStatus) => void;
}

const POSTURE_LABELS: Record<PostureType, string> = {
  forward_head: "거북목",
  chin_resting: "턱 괴임",
  shoulder_tilt: "어깨 기울임",
  slouching: "등 구부정",
  monitor_too_close: "모니터 거리",
  shoulder_asymmetry: "어깨 비대칭",
  head_roll: "머리 좌우 기울임",
};

const POSTURE_FIGURE: Record<PostureType, PostureFigureState> = {
  forward_head: "forward-head",
  chin_resting: "chin-prop",
  shoulder_tilt: "shoulder-tilt",
  slouching: "slouch",
  monitor_too_close: "forward-head",
  shoulder_asymmetry: "shoulder-tilt",
  head_roll: "shoulder-tilt",
};

const COACHING_BY_TYPE: Record<PostureType, string> = {
  forward_head: "턱을 살짝 당겨볼까요",
  chin_resting: "손을 책상 위로 내려볼까요",
  shoulder_tilt: "어깨가 한쪽으로 기울었어요",
  slouching: "등을 펴고 가슴을 열어볼까요",
  monitor_too_close: "모니터에서 한 뼘 더 멀어져볼까요",
  shoulder_asymmetry: "양쪽 어깨에 고르게 힘을 빼볼까요",
  head_roll: "머리를 수직으로 세워볼까요",
};

const ABSENCE_GRACE_MS = 8000;

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}초`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}분 ${s}초`;
}

export function MonitorView({
  baseline,
  paused,
  onTogglePause,
  onRecalibrate,
  onOpenSettings,
  onOpenProfile,
  onStatusChange,
}: Props) {
  const [widgetEnabled, setWidgetEnabled] = useState<boolean>(
    () => localStorage.getItem("app_mode") === "widget",
  );
  const [minibarOn, setMinibarOn] = useState<boolean>(() => isMinibarVisible());
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UserProfile>).detail;
      if (detail) setProfile(detail);
    };
    window.addEventListener(PROFILE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    const sync = () =>
      setWidgetEnabled(localStorage.getItem("app_mode") === "widget");
    const syncMinibar = () => setMinibarOn(isMinibarVisible());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "app_mode") sync();
      if (e.key === "minibar_visible") syncMinibar();
    };
    const onModeChange = () => sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener("app-mode-change", onModeChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("app-mode-change", onModeChange);
    };
  }, []);

  const lastPresentAtRef = useRef<number>(Date.now());

  const [visible, setVisible] = useState<boolean>(
    typeof document === "undefined" ? true : !document.hidden,
  );

  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    if (widgetEnabled) {
      setCameraActive(false);
      return;
    }
    if (!visible) {
      setCameraActive(false);
    } else {
      const id = setTimeout(() => {
        setCameraActive(true);
      }, 250);
      return () => clearTimeout(id);
    }
  }, [widgetEnabled, visible]);



  useEffect(() => {
    if (cameraActive) {
      lastPresentAtRef.current = Date.now();
    }
  }, [cameraActive]);

  const { videoRef, ready: cameraReady, error: cameraError } = useCamera(
    cameraActive,
  );

  const scoreInputsRef = useRef<ScoreInputs>({
    durations: [],
    secsSinceLastClear: Infinity,
    goodStreakSecs: 0,
    frozen: false,
  });
  const score = usePostureScore(scoreInputsRef);

  useEffect(() => {
    scoreInputsRef.current = {
      ...scoreInputsRef.current,
      frozen: widgetEnabled || !cameraReady || !baseline,
    };
  }, [widgetEnabled, cameraReady, baseline]);

  const [landmarks, setLandmarks] = useState<Landmarks | null>(null);
  const [faceLandmarks, setFaceLandmarks] = useState<Landmark[] | null>(null);
  const [handsData, setHandsData] = useState<HandData[]>([]);
  const [mask, setMask] = useState<MaskBuffer | null>(null);
  const [violations, setViolations] = useState<Set<PostureType>>(new Set());
  const [status, setStatus] = useState<PostureStatus>("good");
  const [, setPersonPresent] = useState<boolean>(false);
  const [privacy, setPrivacy] = useState<boolean>(isPrivacyMode());
  const [lastAlarm, setLastAlarm] = useState<WidgetLastAlarm | null>(null);

  const [maxDurationSecs, setMaxDurationSecs] = useState<number>(0);
  const [breakStatus, setBreakStatus] = useState<BreakStatus | null>(null);
  const [stretchToast, setStretchToast] = useState<{
    kind: StretchKind;
    amount: number;
    at: number;
  } | null>(null);
  const [externalScore, setExternalScore] = useState<number | null>(null);
  const [, setExternalStatus] = useState<PostureStatus | null>(null);
  const [externalViolations, setExternalViolations] = useState<PostureType[]>(
    [],
  );
  const [thresholdsState, setThresholdsState] = useState(() => loadThresholds());

  // 드로어에서 thresholds 변경 시 인라인 슬라이더도 즉시 반영
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<ThresholdMap>).detail;
      if (detail) setThresholdsState(detail);
      else setThresholdsState(loadThresholds());
    };
    window.addEventListener(THRESHOLDS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(THRESHOLDS_CHANGED_EVENT, onChanged);
  }, []);

  useEffect(() => {
    if (!widgetEnabled) {
      setExternalScore(null);
      setExternalStatus(null);
      setExternalViolations([]);
      return;
    }
    const apply = (raw: string) => {
      try {
        const s = JSON.parse(raw);
        setExternalScore(s.score);
        setExternalStatus(s.status);
        setExternalViolations(s.violations || []);
        if (s.status) onStatusChange?.(s.status);
      } catch {
        /* ignore */
      }
    };
    const init = localStorage.getItem("widget_state");
    if (init) apply(init);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "widget_state" && e.newValue) apply(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetEnabled]);

  useEffect(() => {
    const onVis = () => {
      setVisible(!document.hidden);
      // 윈도우가 다시 보이게 되었을 때 absence 타이머 리셋 — hidden 동안 누적된
      // 시간으로 즉시 paused 진입하는 것 차단.
      if (!document.hidden) lastPresentAtRef.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // WKWebView 가 윈도우 가림 시 페이지를 suspend 시키는 것을 막기 위해 무음 오디오
  // 컨텍스트 가동. 첫 사용자 제스처 후에 호출돼야 AudioContext 가 동작.
  useEffect(() => {
    startKeepAwake();
    const onInteract = () => startKeepAwake();
    window.addEventListener("pointerdown", onInteract, { once: true });
    return () => window.removeEventListener("pointerdown", onInteract);
  }, []);

  useEffect(() => {
    if (!stretchToast) return;
    const id = window.setTimeout(() => setStretchToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [stretchToast]);

  useEffect(() => {
    const handler = (e: Event) =>
      setPrivacy((e as CustomEvent<boolean>).detail);
    window.addEventListener("privacy-mode-change", handler);
    return () => window.removeEventListener("privacy-mode-change", handler);
  }, []);

  useEffect(() => {
    if (widgetEnabled) return;
    const away = !paused && status === "paused";
    const stage: 0 | 1 | 2 | 3 | 4 =
      violations.size === 0
        ? 0
        : maxDurationSecs >= 60
          ? 4
          : maxDurationSecs >= 30
            ? 3
            : maxDurationSecs >= 15
              ? 2
              : 1;
    const now = Date.now();
    let poseToSend = null as Landmarks | null;
    if (now - lastPosePublishAtRef.current > 330) {
      poseToSend = latestPoseRef.current;
      lastPosePublishAtRef.current = now;
    }
    const state = {
      status: paused ? "paused" : status,
      score,
      away,
      violations: Array.from(violations),
      lastAlarm,
      maxDurationSecs,
      stage,
      pose: poseToSend,
      breakStatus,
    };
    localStorage.setItem("widget_state", JSON.stringify(state));
    publishWidgetState(state).catch(() => undefined);
  }, [
    status,
    score,
    paused,
    violations,
    lastAlarm,
    maxDurationSecs,
    widgetEnabled,
    breakStatus,
  ]);

  const smootherRef = useRef(new LandmarkSmoother());
  const trackerRef = useRef(new ViolationTracker());
  const violationSmootherRef = useRef(new ViolationSmoother());
  const stretchTrackerRef = useRef(new StretchTracker());
  const breakTrackerRef = useRef(new BreakTracker());
  const breakConfigRef = useRef<BreakConfig>(loadBreakConfig());
  const cumulativeTrackerRef = useRef(new CumulativeLoadTracker());
  const cumulativeConfigRef = useRef<CumulativeLoadConfig>(loadCumulativeConfig());
  const variabilityTrackerRef = useRef(new VariabilityTracker());
  const variabilityConfigRef = useRef<VariabilityConfig>(loadVariabilityConfig());
  const adaptiveConfigRef = useRef<AdaptiveSensitivityConfig>({
    ...loadAdaptiveConfig(),
    sessionStartedAt: Date.now(),
  });
  const debugRef = useRef<AnalysisDebug | null>(null);
  const violationsRef = useRef<Set<PostureType>>(new Set());
  // pose loop heartbeat + watchdog — 60초+ stale 시 hard reload
  const monitorHeartbeat = useHeartbeat();
  useWatchdog("monitor-frame", monitorHeartbeat.getLastAt, {
    expectedIntervalMs: 100,
    warnThresholdMs: 30_000,
    reloadThresholdMs: 60_000,
    active: !paused && !widgetEnabled,
  });
  /** isResting 히스테리시스 + 최소 유지 시간 — 핑퐁 방지 */
  const restingRef = useRef<{ isResting: boolean; enteredAt: number }>({
    isResting: false,
    enteredAt: 0,
  });
  /** analyzer 가 프레임 간 캐리하는 내부 상태 (chin/resting hold 카운터). */
  const analyzerStateRef = useRef<AnalyzerState>({});
  const REST_MIN_HOLD_MS = 4000;

  const lastPosePublishAtRef = useRef<number>(0);
  const latestPoseRef = useRef<Landmarks | null>(null);

  useEffect(() => {
    if (paused) {
      setStatus("paused");
      updateStatus("paused").catch(() => undefined);
      onStatusChange?.("paused");
      smootherRef.current.reset();
      trackerRef.current.reset();
      violationSmootherRef.current.reset();
      stretchTrackerRef.current.reset();
      breakTrackerRef.current.reset();
      cumulativeTrackerRef.current.reset();
      variabilityTrackerRef.current.reset();
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
      onStatusChange?.("good");
    }
  }, [paused, onStatusChange]);

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

  // 누적 부하 / 변동성 / 적응형 민감도 설정 변경 즉시 반영
  useEffect(() => {
    const onCum = (e: Event) => {
      cumulativeConfigRef.current =
        (e as CustomEvent<CumulativeLoadConfig>).detail ?? loadCumulativeConfig();
    };
    const onVar = (e: Event) => {
      variabilityConfigRef.current =
        (e as CustomEvent<VariabilityConfig>).detail ?? loadVariabilityConfig();
    };
    const onAdaptive = (e: Event) => {
      const next =
        (e as CustomEvent<AdaptiveSensitivityConfig>).detail ?? loadAdaptiveConfig();
      adaptiveConfigRef.current = {
        ...next,
        sessionStartedAt: adaptiveConfigRef.current.sessionStartedAt,
      };
    };
    window.addEventListener(CUMULATIVE_CONFIG_CHANGED_EVENT, onCum);
    window.addEventListener(VARIABILITY_CONFIG_CHANGED_EVENT, onVar);
    window.addEventListener(ADAPTIVE_CONFIG_CHANGED_EVENT, onAdaptive);
    return () => {
      window.removeEventListener(CUMULATIVE_CONFIG_CHANGED_EVENT, onCum);
      window.removeEventListener(VARIABILITY_CONFIG_CHANGED_EVENT, onVar);
      window.removeEventListener(ADAPTIVE_CONFIG_CHANGED_EVENT, onAdaptive);
    };
  }, []);

  const { error: detectorError, retry: detectorRetry } = usePoseLoop({
    videoRef,
    enabled: cameraReady && !paused,
    // 윈도우가 다른 앱 뒤로 가려져도 (Tauri/macOS occlusion → document.hidden)
    // 모니터링은 계속해야 함. face/hands 는 자리비움 판정과 chin_resting 검출에
    // 필수라 항상 ON. fps 만 약간 낮추고 segmentation (실루엣 마스크) 은 어차피
    // 화면에 안 보이니 OFF.
    fps: visible ? 15 : 10,
    segmentEveryN: visible ? 3 : 0,
    runFace: true,
    runHands: true,
    onFrame: (frame: DetectionFrame) => {
      monitorHeartbeat.tick();
      if (paused) return;
      if (!frame.pose) {
        setLandmarks(null);
        const since = Date.now() - lastPresentAtRef.current;
        // BreakTracker 에 absence 신호 계속 전달 — 내부 5분 카운터가 누적되어
        // 짧은 자리비움(<5분)은 secsSeated 동결만, 5분 이상이면 자동 리셋.
        breakTrackerRef.current.push(
          Date.now(),
          false,
          false,
          false,
          breakConfigRef.current,
        );
        // 윈도우가 가려진 동안의 frame.pose=null 은 브라우저 throttling/video 일시정지
        // 영향일 가능성이 크므로 absence 판정 보류 (마지막 상태 유지).
        if (since > ABSENCE_GRACE_MS && !document.hidden) {
          if (status !== "paused") {
            setStatus("paused");
            updateStatus("paused").catch(() => undefined);
            onStatusChange?.("paused");
            trackerRef.current.reset();
            // breakTracker 는 reset 하지 않음 — 자체 5분 absence 카운터가 처리.
          }
        }
        return;
      }

      const smoothed = smootherRef.current.push(frame.pose);
      setLandmarks(smoothed);
      latestPoseRef.current = smoothed;
      setFaceLandmarks(frame.face?.landmarks ?? null);
      setHandsData(frame.hands);
      if (frame.mask) setMask(frame.mask);

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
      // 잡혀야 사람으로 인정.
      if (result.personPresent && frame.face) {
        lastPresentAtRef.current = Date.now();
      }
      // face 없이 8초 이상 = 자리비움 (의자 false positive). 점수 동결 + 분석 흐름 종료.
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
          breakConfigRef.current,
        );
        if (status !== "paused") {
          setStatus("paused");
          updateStatus("paused").catch(() => undefined);
          onStatusChange?.("paused");
          trackerRef.current.reset();
          // breakTracker 는 reset 하지 않음 — 자체 5분 absence 카운터가 처리.
        }
        scoreInputsRef.current = {
          durations: [],
          secsSinceLastClear: Infinity,
          goodStreakSecs: 0,
          frozen: true,
        };
        return;
      }

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
        !!stretchFired,
        adjustedBreakConfig,
      );
      setBreakStatus(breakResult.status);
      if (breakResult.fired) {
        dispatchBreakReminder(breakResult.fired);
      }

      // Phase 2 — 누적 부하 추적
      const cumulativeResult = cumulativeTrackerRef.current.push(
        Date.now(),
        result.violations,
        cumulativeConfigRef.current,
      );
      if (cumulativeResult.fired) {
        dispatchCumulativeAlert(cumulativeResult.fired);
      }

      // Phase 3 — 자세 변동성
      const lsLm = smoothed[11];
      const rsLm = smoothed[12];
      const noseLm = smoothed[0];
      const variabilityMetrics =
        lsLm && rsLm && noseLm
          ? {
              sy: (lsLm.y + rsLm.y) / 2,
              ny: noseLm.y,
              nz: noseLm.z,
              p: frame.face?.pitch ?? 0,
            }
          : null;
      const variabilityResult = variabilityTrackerRef.current.push(
        Date.now(),
        result.personPresent,
        result.isResting,
        variabilityMetrics,
        variabilityConfigRef.current,
      );
      if (variabilityResult.fired) {
        dispatchVariabilityAlert(variabilityResult.fired);
      }

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
        // 휴식 중에는 점수 변동 금지
        frozen: result.isResting,
      };
      const maxDur =
        activeDurations.length > 0 ? Math.max(...activeDurations) : 0;
      setMaxDurationSecs(maxDur);

      setViolations(stableViolations);
      violationsRef.current = stableViolations;
      setPersonPresent(result.personPresent);

      // 휴식 중이면 알람 트래커 리셋 — 누적 시간 초기화
      if (result.isResting) {
        trackerRef.current.reset();
      }
      const fired = result.isResting
        ? []
        : trackerRef.current.update(stableViolations, thresholds);
      if (fired.length > 0) {
        const latest = fired[fired.length - 1];
        setLastAlarm({ type: latest.type, at: Date.now() });
      }
      for (const event of fired) {
        appendEvent({
          type: event.type,
          startedAt: event.startedAt,
          durationSecs: event.durationSecs,
        });

        const todayStats = computeDailyStats(
          loadEvents(),
          startOfToday(),
          Date.now() + 1,
        );

        const intensity = intensityFromDuration(event.durationSecs);
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
          coaching_message: null,
        }).catch(() => undefined);

        fetchCoachingMessage({
          postureType: event.type,
          durationSecs: event.durationSecs,
          todayCountForType: todayStats.byType[event.type],
        })
          .then((msg) => {
            if (!msg) return;
            dispatchAlertFired({
              postureType: event.type,
              durationSecs: event.durationSecs,
              intensity,
              coachingMessage: msg,
            });
            return showPostureAlert({
              posture_type: event.type,
              duration_secs: event.durationSecs,
              severity: "bad",
              coaching_message: msg,
            });
          })
          .catch(() => undefined);
      }

      const next: PostureStatus = result.isResting
        ? "resting"
        : result.violations.size > 0
          ? trackerRef.current.hasAlertedActive()
            ? "bad"
            : "warning"
          : "good";
      if (next !== status) {
        setStatus(next);
        updateStatus(next).catch(() => undefined);
        onStatusChange?.(next);
      }
    },
  });

  // 디스플레이 상태 결정
  const displayScore =
    widgetEnabled && externalScore != null ? externalScore : score;
  const displayViolations: PostureType[] = widgetEnabled
    ? externalViolations
    : Array.from(violations);
  const sinceAbsence = Date.now() - lastPresentAtRef.current;
  const away =
    !paused && !widgetEnabled && cameraReady && sinceAbsence > ABSENCE_GRACE_MS;
  const resting = status === "resting";
  const tone: "good" | "amber" | "warn" | "dim" = paused
    ? "dim"
    : away
      ? "dim"
      : resting
        ? "dim"
        : status === "bad"
          ? "warn"
          : status === "warning"
            ? "amber"
            : "good";
  const toneColor =
    tone === "good"
      ? "var(--b-sig)"
      : tone === "amber"
        ? "var(--b-amber)"
        : tone === "warn"
          ? "var(--b-warn)"
          : "var(--b-fg-4)";
  const statusBadge = paused
    ? "일시정지"
    : away
      ? "자리비움"
      : resting
        ? "쉬는 중"
        : tone === "good"
          ? "양호"
          : tone === "amber"
            ? "주의"
            : "교정 필요";

  // 메인 카피
  const primaryViolation = displayViolations[0];
  const headline = paused
    ? "쉬고 있어요"
    : away
      ? "잠깐 자리를 비웠어요"
      : resting
        ? "잠깐 등받이에 기대어 쉬세요"
        : tone === "good"
          ? "잘 앉아 있어요"
          : tone === "amber"
            ? "조금만 더 바르게"
            : primaryViolation
              ? COACHING_BY_TYPE[primaryViolation]
              : "잠깐, 어깨를 펴볼까요";

  const subline = paused
    ? "재개하면 자세 살피기를 다시 시작합니다"
    : away
      ? "자리에 돌아오면 자동으로 다시 시작해요"
      : resting
        ? "다시 똑바로 앉으면 자동으로 다시 살펴드릴게요"
        : tone === "good"
          ? "지금은 모두 양호해요"
          : primaryViolation
          ? `${POSTURE_LABELS[primaryViolation]} · ${formatDuration(maxDurationSecs)}째 지속`
          : "자세를 부드럽게 살피고 있어요";

  // 자세 fig 매핑
  const postureFigState: PostureFigureState = primaryViolation
    ? POSTURE_FIGURE[primaryViolation]
    : "good";

  // 4 stat 카드 데이터 + 어제 대비 델타 (디자인의 +6/+18m/−4/+2 표기 매칭)
  const { todayStats, yesterdayByHour, deltas } = (() => {
    try {
      const events = loadEvents();
      const startToday = startOfToday();
      const startYesterday = startToday - 24 * 60 * 60 * 1000;
      const today = computeDailyStats(events, startToday, Date.now());
      const yesterday = computeDailyStats(events, startYesterday, startToday);
      const todayTotal = today.total;
      const yesterdayTotal = yesterday.total;
      const stretches = Number(localStorage.getItem("stretches_today") || "0");
      const stretchesYesterday = Number(
        localStorage.getItem("stretches_yesterday") || "0",
      );
      return {
        todayStats: {
          avgScore: Math.round(displayScore),
          violations: todayTotal,
          stretches,
        },
        yesterdayByHour: yesterday.byHour,
        deltas: {
          violations: todayTotal - yesterdayTotal,
          stretches: stretches - stretchesYesterday,
        },
      };
    } catch {
      return {
        todayStats: {
          avgScore: Math.round(displayScore),
          violations: 0,
          stretches: 0,
        },
        yesterdayByHour: new Array(24).fill(0) as number[],
        deltas: { violations: 0, stretches: 0 },
      };
    }
  })();

  // DEBUG 오버레이: 기본 숨김. Cmd+Shift+D (macOS) / Ctrl+Shift+D (그 외)로 토글.
  // 상태는 localStorage 에 보존 — 새로고침해도 유지. ?debug 쿼리는 1회 강제 표시.
  const [showDebug, setShowDebug] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (new URLSearchParams(window.location.search).has("debug")) return true;
    return localStorage.getItem("debug_overlay") === "1";
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setShowDebug((v) => {
          const next = !v;
          try { localStorage.setItem("debug_overlay", next ? "1" : "0"); } catch { /* noop */ }
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="b-scroll"
      style={{ height: "100%", overflowY: "auto", background: "var(--b-bg)" }}
    >
      {showDebug && (
        <DebugOverlay debugRef={debugRef} violationsRef={violationsRef} />
      )}
      <div style={{ padding: "22px 40px 20px", maxWidth: 1100, margin: "0 auto" }}>
        {/* HEADER: ScoreRing + 상태 + 빠른 액션 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 32,
            marginBottom: 32,
          }}
        >
          <ScoreRing score={displayScore} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--b-fg-4)",
                letterSpacing: "0.02em",
                marginBottom: 4,
              }}
            >
              {MAIN_SLOGAN}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span
                className="b-pulse-dot"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: toneColor,
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--b-fg-3)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {statusBadge}
              </span>
            </div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "-0.025em",
                lineHeight: 1.2,
                margin: 0,
                marginBottom: 10,
              }}
            >
              {headline}
            </h1>
            <div
              style={{
                fontSize: 14,
                color: "var(--b-fg-3)",
                lineHeight: 1.5,
              }}
            >
              {subline}
            </div>
            {(() => {
              // 연속 착석 시간 — 5분 이상부터 표시. 단계별 색상으로 회복 권유.
              const secs = breakStatus?.secsSeated ?? 0;
              if (secs < 5 * 60) return null;
              const mins = Math.floor(secs / 60);
              const stage = breakStatus?.stage ?? "none";
              const accent =
                stage === "deep"
                  ? "#2d8f7e"
                  : stage === "standup"
                    ? "#3a9d8c"
                    : stage === "micro"
                      ? "#5db49f"
                      : "var(--b-fg-4)";
              const message =
                stage === "deep"
                  ? "긴 휴식 권장 — 5분 일어나기"
                  : stage === "standup"
                    ? "한 번 일어서볼까요 (KOSHA 권고)"
                    : stage === "micro"
                      ? "어깨 으쓱·목 회전으로 환기"
                      : "곧 환기 권장";
              return (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 10,
                    padding: "6px 12px",
                    borderRadius: 999,
                    background: stage === "none" ? "transparent" : `${accent}14`,
                    border: `1px solid ${stage === "none" ? "var(--b-line)" : accent}55`,
                    fontSize: 12,
                    color: stage === "none" ? "var(--b-fg-3)" : accent,
                    fontWeight: 600,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{mins}분 연속 착석</span>
                  <span style={{ opacity: 0.7 }}>· {message}</span>
                </div>
              );
            })()}
          </div>
          {/* Quick actions */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="b-icon-btn b-tip"
              aria-label={paused ? "모니터링 재개" : "모니터링 일시정지"}
              data-tip={paused ? "모니터링 재개" : "모니터링 일시정지"}
              onClick={onTogglePause}
            >
              <Icon name={paused ? "play" : "pause"} size={15} />
            </button>
            {platform.features.multiWindow && (
              <>
                <button
                  className="b-icon-btn b-tip"
                  aria-label={minibarOn ? "미니바 숨기기" : "미니바 표시"}
                  data-tip={
                    minibarOn
                      ? "미니바 숨기기 — 플로팅 알약 끔"
                      : "미니바 표시 — 플로팅 알약 켬"
                  }
                  aria-pressed={minibarOn}
                  onClick={() => {
                    const next = !minibarOn;
                    setMinibarOn(next);
                    setMinibarVisible(next);
                    setWidgetVisible(next).catch(() => undefined);
                  }}
                  style={
                    minibarOn
                      ? {
                          color: "var(--b-sig-deep)",
                          background: "var(--b-sig-bg)",
                          borderColor: "var(--b-sig-soft)",
                        }
                      : undefined
                  }
                >
                  <Icon name={minibarOn ? "pill" : "pill-off"} size={15} />
                </button>
                <button
                  className="b-btn b-btn-ghost b-tip"
                  aria-label="메인 창을 닫고 미니바만 표시"
                  data-tip="메인 창을 닫고 미니바만 표시"
                  onClick={() => switchToWidgetMode().catch(() => undefined)}
                  disabled={!minibarOn}
                  style={{ height: 32, padding: "0 10px", fontSize: 12 }}
                >
                  <Icon name="chev-d" size={12} />
                  위젯 모드
                </button>
              </>
            )}
            <button
              className="b-icon-btn b-tip"
              aria-label="프로필 열기"
              data-tip={profile.name ? `${profile.name} · 프로필` : "프로필"}
              onClick={onOpenProfile}
              style={{ fontSize: 18, lineHeight: 1 }}
            >
              <span aria-hidden>{profile.avatar}</span>
            </button>
            <button
              className="b-icon-btn b-tip"
              aria-label="설정 열기"
              data-tip="설정 열기"
              onClick={onOpenSettings}
            >
              <Icon name="settings" size={15} />
            </button>
            {!platform.features.multiWindow && (
              <a
                href="#/landing"
                className="b-btn b-btn-ghost b-tip"
                aria-label="홈으로 (랜딩)"
                data-tip="홈으로"
                style={{
                  height: 32,
                  padding: "0 10px",
                  fontSize: 12,
                  textDecoration: "none",
                }}
              >
                홈
              </a>
            )}
          </div>
        </div>

        {/* CENTER: 카메라/실루엣 + 활성 상태 + 인라인 민감도 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "300px 1fr",
            gap: 14,
            marginBottom: 14,
          }}
        >
          {/* Camera/Silhouette card */}
          <div
            style={{
              position: "relative",
              borderRadius: 14,
              overflow: "hidden",
              background: privacy ? "var(--b-surface-2)" : "#0a0a0a",
              border: "1px solid var(--b-line)",
              aspectRatio: "4 / 3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* video (hidden under privacy / always for detection) */}
            <video
              ref={videoRef}
              muted
              playsInline
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: "scaleX(-1)",
                visibility: privacy ? "hidden" : "visible",
                zIndex: 1,
              }}
            />
            {privacy ? (
              <>
                <SilhouetteOverlay
                  pose={landmarks}
                  face={faceLandmarks}
                  hands={handsData}
                  mask={mask}
                  status={paused ? "paused" : status}
                />
                {/* posture figure 오버레이 — 실루엣 위에 살짝 */}
                {!landmarks && !paused && (
                  <div style={{ color: toneColor, position: "relative", zIndex: 3 }}>
                    <PostureFigure
                      state={postureFigState}
                      accent="currentColor"
                      warn="var(--b-warn)"
                      size={180}
                    />
                  </div>
                )}
              </>
            ) : (
              <LandmarkOverlay landmarks={landmarks} />
            )}

            {/* Privacy badge */}
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 8px",
                borderRadius: 999,
                background: privacy ? "var(--b-surface)" : "rgba(0,0,0,0.5)",
                color: privacy ? "var(--b-sig)" : "#a8d4c4",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.04em",
                border: "1px solid",
                borderColor: privacy ? "var(--b-line)" : "rgba(168,212,196,0.3)",
                zIndex: 4,
              }}
            >
              <Icon name="shield" size={10} />
              ON-DEVICE
            </div>

            {/* Stretch toast */}
            {stretchToast && (
              <div className="stretch-toast">
                <span className="stretch-toast__icon">🌿</span>
                <span>{STRETCH_LABEL[stretchToast.kind]}</span>
                <span className="stretch-toast__bonus">
                  +{stretchToast.amount}
                </span>
              </div>
            )}

            {/* 기준 자세 다시 잡기 — 카메라 우상단 (Privacy 배지의 좌상단 대칭) */}
            <button
              onClick={onRecalibrate}
              title="기준 자세를 다시 측정합니다"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(0,0,0,0.5)",
                color: "#fff",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.02em",
                border: "1px solid rgba(255,255,255,0.18)",
                cursor: "pointer",
                zIndex: 4,
                fontFamily: "inherit",
              }}
            >
              <Icon name="target" size={11} />
              기준 다시 잡기
            </button>
          </div>

          {/* Active state / feedback panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tone === "warn" && primaryViolation && (
              <div
                style={{
                  padding: "16px 18px",
                  borderRadius: 12,
                  background: "var(--b-warn-soft)",
                  border: "1px solid var(--b-warn)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <Icon
                    name="flag"
                    size={14}
                    style={{ color: "var(--b-warn)" }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--b-warn)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    활성 위반 · {POSTURE_LABELS[primaryViolation]}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "var(--b-fg-1)",
                    marginBottom: 4,
                    letterSpacing: "-0.012em",
                  }}
                >
                  {COACHING_BY_TYPE[primaryViolation]}
                </div>
                <div
                  className="b-num"
                  style={{ fontSize: 12, color: "var(--b-fg-3)" }}
                >
                  {formatDuration(maxDurationSecs)}째 지속 중
                </div>
              </div>
            )}
            {tone === "amber" && primaryViolation && (
              <div
                style={{
                  padding: "16px 18px",
                  borderRadius: 12,
                  background: "var(--b-amber-soft)",
                  border: "1px solid var(--b-amber)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--b-amber)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--b-amber)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    주의 · {POSTURE_LABELS[primaryViolation]}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    marginBottom: 4,
                    letterSpacing: "-0.012em",
                  }}
                >
                  {COACHING_BY_TYPE[primaryViolation]}
                </div>
                <div
                  className="b-num"
                  style={{ fontSize: 12, color: "var(--b-fg-3)" }}
                >
                  {formatDuration(maxDurationSecs)}째 지속 중
                </div>
              </div>
            )}
            {tone === "good" && !paused && !away && (
              <div
                style={{
                  padding: "16px 18px",
                  borderRadius: 12,
                  background: "var(--b-sig-bg)",
                  border: "1px solid var(--b-sig-soft)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <Icon
                    name="check"
                    size={14}
                    style={{ color: "var(--b-sig)" }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--b-sig)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    지금은 모두 양호해요
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    marginBottom: 4,
                    letterSpacing: "-0.012em",
                  }}
                >
                  자세를 부드럽게 살피고 있어요
                </div>
                <div
                  className="b-num"
                  style={{ fontSize: 12, color: "var(--b-fg-3)" }}
                >
                  잘 유지 중
                </div>
              </div>
            )}
            {paused && (
              <div
                style={{
                  padding: "16px 18px",
                  borderRadius: 12,
                  background: "var(--b-surface)",
                  border: "1px solid var(--b-line)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <Icon
                    name="pause"
                    size={12}
                    style={{ color: "var(--b-fg-3)" }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--b-fg-3)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    일시정지
                  </span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                  쉬고 있어요
                </div>
                <div style={{ fontSize: 12, color: "var(--b-fg-3)" }}>
                  재개하면 자세 살피기를 다시 시작합니다
                </div>
              </div>
            )}
            {away && (
              <div
                style={{
                  padding: "16px 18px",
                  borderRadius: 12,
                  background: "var(--b-surface)",
                  border: "1px dashed var(--b-line-2)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <Icon
                    name="mug"
                    size={14}
                    style={{ color: "var(--b-fg-3)" }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--b-fg-3)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    자리비움
                  </span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                  잠깐 자리를 비웠어요
                </div>
                <div style={{ fontSize: 12, color: "var(--b-fg-3)" }}>
                  자리에 돌아오면 자동으로 다시 시작해요
                </div>
              </div>
            )}

            {/* Inline sensitivity */}
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 12,
                background: "var(--b-surface)",
                border: "1px solid var(--b-line)",
                marginTop: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--b-fg-2)",
                    letterSpacing: "0.02em",
                  }}
                >
                  민감도
                </span>
                <button
                  className="b-btn b-btn-quiet"
                  style={{ fontSize: 11, padding: "4px 8px" }}
                  onClick={onOpenSettings}
                >
                  자세히 <Icon name="chev-r" size={10} />
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 11,
                  color: "var(--b-fg-3)",
                }}
              >
                <span style={{ width: 60 }}>거북목</span>
                <span style={{ fontSize: 10, color: "var(--b-fg-4)" }}>엄격</span>
                <input
                  type="range"
                  className="b-slider"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={thresholdsState.forward_head.sensitivity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const next = {
                      ...thresholdsState,
                      forward_head: {
                        ...thresholdsState.forward_head,
                        sensitivity: v,
                      },
                    };
                    setThresholdsState(next);
                    saveThresholds(next);
                  }}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 10, color: "var(--b-fg-4)" }}>관대</span>
                <span
                  className="b-num"
                  style={{
                    width: 30,
                    textAlign: "right",
                    color: "var(--b-fg-2)",
                    fontWeight: 600,
                  }}
                >
                  {thresholdsState.forward_head.sensitivity.toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SUMMARY 4 cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
            marginBottom: 14,
          }}
        >
          {(() => {
            const fmtDelta = (n: number) =>
              n === 0 ? "0" : n > 0 ? `+${n}` : `${n}`;
            // 위반은 적을수록 좋음 → 음수가 good. 스트레칭은 많을수록 좋음 → 양수가 good.
            const cards = [
              {
                label: "평균 점수",
                value: String(todayStats.avgScore),
                delta: null as string | null,
                deltaGood: true,
              },
              {
                label: "위반 횟수",
                value: String(todayStats.violations),
                delta: fmtDelta(deltas.violations),
                deltaGood: deltas.violations <= 0,
              },
              {
                label: "스트레칭",
                value: String(todayStats.stretches),
                delta: fmtDelta(deltas.stretches),
                deltaGood: deltas.stretches >= 0,
              },
              {
                label: "지속 시간",
                value: formatDuration(maxDurationSecs || 0),
                delta: null,
                deltaGood: true,
              },
            ];
            return cards.map((c, i) => (
              <div
                key={i}
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "var(--b-surface)",
                  border: "1px solid var(--b-line)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--b-fg-3)",
                    letterSpacing: "0.04em",
                    marginBottom: 6,
                  }}
                >
                  {c.label}
                </div>
                <div
                  className="b-num"
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      letterSpacing: "-0.022em",
                    }}
                  >
                    {c.value}
                  </span>
                  {c.delta && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: c.deltaGood
                          ? "var(--b-sig)"
                          : "var(--b-warn)",
                      }}
                    >
                      {c.delta}
                    </span>
                  )}
                </div>
              </div>
            ));
          })()}
        </div>

        {/* Today section */}
        <div
          style={{
            padding: "14px 18px",
            borderRadius: 14,
            background: "var(--b-surface)",
            border: "1px solid var(--b-line)",
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>오늘의 자세</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--b-fg-3)",
                marginTop: 2,
              }}
            >
              시간대별 위반 추이
            </div>
          </div>
          <HourlyHeatmap yesterdayByHour={yesterdayByHour} />
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              fontWeight: 700,
              color: "var(--b-fg-2)",
              marginBottom: 8,
            }}
          >
            자세 종류별 빈도
          </div>
          <PostureBars />
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 8,
              fontSize: 12,
              color: "var(--b-fg-3)",
            }}
          >
            {cameraError && <span>카메라 오류: {cameraError}</span>}
            {detectorError && (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {detectorError}
                <button
                  className="b-btn b-btn-ghost"
                  onClick={detectorRetry}
                  style={{ height: 24, fontSize: 11, padding: "0 8px" }}
                >
                  다시 시도
                </button>
              </span>
            )}
          </div>

        </div>

        {/* 풋터 슬로건 — 요일/시간대 기반 로테이션 */}
        <div
          style={{
            marginTop: 8,
            textAlign: "center",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--b-fg-4)",
            letterSpacing: "0.01em",
            opacity: 0.8,
          }}
        >
          {pickSubSlogan()}
        </div>
      </div>
    </div>
  );
}

function HourlyHeatmap({ yesterdayByHour }: { yesterdayByHour: number[] }) {
  // 09:00 ~ 20:00 (12개 슬롯). 각 슬롯의 위반 수를 색·높이로 표시.
  // 데이터가 적을 때는 어제 데이터를 옅게 함께 보여 비교 가능하게.
  const stats = (() => {
    try {
      return computeDailyStats(loadEvents(), startOfToday(), Date.now());
    } catch {
      return {
        total: 0,
        byType: {
          forward_head: 0,
          chin_resting: 0,
          shoulder_tilt: 0,
          slouching: 0,
          monitor_too_close: 0,
          shoulder_asymmetry: 0,
          head_roll: 0,
        },
        byHour: new Array(24).fill(0) as number[],
      };
    }
  })();

  const START = 9;
  const END = 21;
  const SLOTS = END - START;
  const todayBuckets = Array.from({ length: SLOTS }, (_, i) =>
    stats.byHour[START + i] ?? 0,
  );
  const yesterdayBuckets = Array.from({ length: SLOTS }, (_, i) =>
    yesterdayByHour[START + i] ?? 0,
  );
  const max = Math.max(1, ...todayBuckets, ...yesterdayBuckets);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 4,
          height: 64,
          marginBottom: 10,
        }}
      >
        {todayBuckets.map((v, i) => {
          const ratio = v / max;
          const h = Math.max(8, ratio * 60);
          const yRatio = yesterdayBuckets[i] / max;
          const yh = Math.max(4, yRatio * 60);
          const color =
            ratio === 0
              ? "var(--b-sig-soft)"
              : ratio > 0.66
                ? "var(--b-warn)"
                : ratio > 0.33
                  ? "var(--b-amber)"
                  : "var(--b-sig)";
          return (
            <div
              key={i}
              style={{
                flex: 1,
                position: "relative",
                height: 60,
                display: "flex",
                alignItems: "flex-end",
                gap: 2,
              }}
              title={`${START + i}시 · 오늘 ${v}회 · 어제 ${yesterdayBuckets[i]}회`}
            >
              <div
                style={{
                  flex: 1,
                  height: h,
                  background: color,
                  opacity: 0.9,
                  borderRadius: 2,
                  transition: "height .3s ease",
                }}
              />
              {yesterdayBuckets[i] > 0 && (
                <div
                  style={{
                    width: 2,
                    height: yh,
                    background: "var(--b-fg-4)",
                    opacity: 0.5,
                    borderRadius: 1,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        className="b-num"
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--b-fg-3)",
        }}
      >
        {[9, 11, 13, 15, 17, 19].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}:00</span>
        ))}
      </div>
    </div>
  );
}

function PostureBars() {
  const stats = (() => {
    try {
      return computeDailyStats(loadEvents(), startOfToday(), Date.now());
    } catch {
      return {
        byType: {
          forward_head: 0,
          chin_resting: 0,
          shoulder_tilt: 0,
          slouching: 0,
          monitor_too_close: 0,
          shoulder_asymmetry: 0,
          head_roll: 0,
        },
      };
    }
  })();
  const items: Array<{ label: string; count: number; type: PostureType }> = [
    { label: "거북목", count: stats.byType.forward_head, type: "forward_head" },
    { label: "등 구부정", count: stats.byType.slouching, type: "slouching" },
    { label: "어깨 기울임", count: stats.byType.shoulder_tilt, type: "shoulder_tilt" },
    { label: "턱 괴임", count: stats.byType.chin_resting, type: "chin_resting" },
    { label: "모니터 거리", count: stats.byType.monitor_too_close, type: "monitor_too_close" },
    { label: "어깨 비대칭", count: stats.byType.shoulder_asymmetry, type: "shoulder_asymmetry" },
    { label: "머리 좌우 기울임", count: stats.byType.head_roll, type: "head_roll" },
  ];
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div>
      {items.map((p) => (
        <div
          key={p.type}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--b-fg-2)", width: 80 }}>
            {p.label}
          </span>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: "var(--b-surface-2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(p.count / max) * 100}%`,
                height: "100%",
                background: "var(--b-warn)",
                opacity: 0.65,
                borderRadius: 3,
                transition: "width .3s ease",
              }}
            />
          </div>
          <span
            className="b-num"
            style={{
              fontSize: 12,
              color: "var(--b-fg-3)",
              width: 24,
              textAlign: "right",
            }}
          >
            {p.count}
          </span>
        </div>
      ))}
    </div>
  );
}
