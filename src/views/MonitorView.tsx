import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import {
  loadProfile,
  PROFILE_CHANGED_EVENT,
  type UserProfile,
} from "../userProfile";
import { useAuth } from "../auth/useAuth";
import { useEntitlement } from "../auth/useEntitlement";
import { isMonitoringEntitled } from "../lib/entitlement";
import { extractSocialAvatarUrl, pickInitial, supabase } from "../auth/supabase";
import { loadBaseline, determineAngle, determineAngleSticky } from "../pose/calibration";
import { useCamera } from "../hooks/useCamera";
import { usePoseLoop } from "../hooks/usePoseLoop";
import { usePerformanceProfile } from "../hooks/usePerformanceProfile";
import { subscribeWake } from "../wakeDetector";
import { useIdleSuspend } from "../hooks/useIdleSuspend";
import { LandmarkOverlay } from "../components/LandmarkOverlay";
import { SilhouetteOverlay } from "../components/SilhouetteOverlay";
import { usePostureScore } from "../hooks/usePostureScore";
import { LandmarkSmoother } from "../pose/smoothing";
import { captureMonitorSnapshot, saveSnapshot } from "../lib/viewportSnapshot";
import { analyzeFrame, type AnalysisDebug, type AnalyzerState } from "../pose/analyzer";
import { DebugOverlay } from "../components/DebugOverlay";
import {
  ViolationTracker,
  computeMovementRelaxation,
  relaxThresholdDurations,
} from "../pose/violationTracker";
import { ViolationSmoother } from "../pose/violationSmoother";
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
  type BreakStatus,
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
  dispatchComplianceReward,
  dispatchEscalationAlert,
  dispatchForceBlur,
  loadAlertModes,
  intensityFromDuration,
} from "../alertConfig";
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
import { platform, IS_WEB } from "../platform";
import { isBetaFree } from "../launchMode";
import {
  appendEvent,
  computeDailyStats,
  loadEvents,
  startOfToday,
  updateEventDuration,
} from "../pose/eventLog";
import { triggerAutoSync } from "../lib/syncService";
import { postureCoaching, postureAlertTitle } from "../i18n/posture";
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
  onOpenPricing: () => void;
  onStatusChange?: (status: PostureStatus) => void;
  detailedReportOpen?: boolean;
  setDetailedReportOpen?: (open: boolean) => void;
}

// 자세 라벨/코칭은 공유 네임스페이스(posture/coaching) 사용. 반복용 타입 목록만 유지.
const POSTURE_TYPES: PostureType[] = [
  "forward_head",
  "chin_resting",
  "shoulder_tilt",
  "slouching",
  "monitor_too_close",
  "shoulder_asymmetry",
  "head_roll",
];

const POSTURE_FIGURE: Record<PostureType, PostureFigureState> = {
  forward_head: "forward-head",
  chin_resting: "chin-prop",
  shoulder_tilt: "shoulder-tilt",
  slouching: "slouch",
  monitor_too_close: "forward-head",
  shoulder_asymmetry: "shoulder-tilt",
  head_roll: "shoulder-tilt",
};

const ABSENCE_GRACE_MS = 8000;
/** 강제 모드 블러 최대 지속(ms). 안 움직여도 이 시간 후 자동 해제 → 절대 갇히지 않음. */
const FORCE_BLUR_MAX_MS = 30_000;
/** 강제 모드 블러 해제 후 재발동까지의 쿨다운(ms). 도배 방지 = "5분 스누즈". */
const FORCE_BLUR_COOLDOWN_MS = 5 * 60_000;
/** 휴식·변동성 넛지 상호 쿨다운(ms). 휴식이 우선 — 최근 휴식 넛지가 있으면 변동성
 *  억제(둘 다 "움직여라"라 근접 발사 시 중복 체감·compliance 덮어쓰기 방지). */
const MUTUAL_NUDGE_COOLDOWN_MS = 5 * 60_000;

function formatDuration(secs: number): string {
  if (secs < 60) return i18n.t("monitor:secs", { s: Math.round(secs) });
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return i18n.t("monitor:minsSecs", { m, s });
}

function formatUsageTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function AnimatedValue({ value }: { value: string }) {
  const characters = Array.from(value);

  return (
    <span 
      style={{ 
        display: "inline-flex", 
        overflow: "hidden", 
        height: "1.1em", 
        lineHeight: "1.1em",
        verticalAlign: "bottom"
      }}
    >
      {characters.map((char, idx) => {
        const isDigit = char >= '0' && char <= '9';
        
        if (!isDigit) {
          return (
            <span
              key={idx}
              style={{
                display: "inline-block",
                height: "1.1em",
                lineHeight: "1.1em",
                textAlign: "center",
              }}
            >
              {char}
            </span>
          );
        }

        const digit = parseInt(char, 10);

        return (
          <span
            key={idx}
            style={{
              display: "inline-block",
              width: "0.62em",
              height: "1.1em",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(-${digit * 10}%)`,
                transition: "transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)",
              }}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <span
                  key={num}
                  style={{
                    height: "1.1em",
                    lineHeight: "1.1em",
                    textAlign: "center",
                  }}
                >
                  {num}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function MonitorView({
  baseline,
  paused,
  onTogglePause,
  onRecalibrate,
  onOpenSettings,
  onOpenProfile,
  onOpenPricing,
  onStatusChange,
  detailedReportOpen = false,
  setDetailedReportOpen = () => {},
}: Props) {
  const { t, i18n } = useTranslation(["monitor", "posture", "coaching", "stretch", "common"]);
  const { user } = useAuth();
  // 권한은 localStorage 가 아니라 서버 검증 값을 신뢰한다(§7 E3-②). 캐시 조작 시
  // useEntitlement 가 다음 검증에서 서버 값으로 강등한다.
  const { plan: subPlan } = useEntitlement();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .maybeSingle();
        if (!error && data?.is_admin) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } catch (err) {
        console.error("[MonitorView] Failed to check admin status:", err);
        setIsAdmin(false);
      }
    };
    checkAdminStatus();
  }, [user]);

  const isMac = typeof navigator !== "undefined" && navigator.userAgent.indexOf("Mac") !== -1;
  const shortcutText = isMac ? t("monitor:shortcut.mac") : t("monitor:shortcut.win");

  const initialAngle = useMemo<"front" | "left" | "right">(() => {
    if (!baseline || !baseline.face) return "front";
    const yawDeg = baseline.face.yaw * (180 / Math.PI);
    if (yawDeg > 12) return "right";
    if (yawDeg < -12) return "left";
    return "front";
  }, [baseline]);

  const [cameraAngle, setCameraAngle] = useState<"front" | "left" | "right">(initialAngle);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarNavDate, setCalendarNavDate] = useState<Date>(() => new Date());

  const getViolationSecsForDate = (year: number, month: number, day: number): number => {
    const events = loadEvents();
    let totalSecs = 0;
    for (const e of events) {
      const eDate = new Date(e.startedAt);
      if (
        eDate.getFullYear() === year &&
        eDate.getMonth() === month &&
        eDate.getDate() === day
      ) {
        totalSecs += e.durationSecs;
      }
    }
    return totalSecs;
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const [recommendAngle, setRecommendAngle] = useState<"front" | "left" | "right" | null>(null);
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);
  const [baselineState, setBaselineState] = useState<CalibrationBaseline>(baseline);

  useEffect(() => {
    setCameraAngle(initialAngle);
  }, [initialAngle]);

  useEffect(() => {
    const handleRecommend = (e: Event) => {
      const customEvent = e as CustomEvent<{ angle: "front" | "left" | "right" | null }>;
      const angle = customEvent.detail?.angle;
      setRecommendAngle(angle || null);
    };
    window.addEventListener("barosit:calibration-recommended", handleRecommend);
    return () => {
      window.removeEventListener("barosit:calibration-recommended", handleRecommend);
    };
  }, []);

  useEffect(() => {
    setBaselineState(baseline);
  }, [baseline]);

  useEffect(() => {
    if (!calendarOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".calendar-popover") && !target.closest(".calendar-toggle-btn")) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [calendarOpen]);

  const [hoveredCardIdx, setHoveredCardIdx] = useState<number | null>(null);
  const [activePostureDetail, setActivePostureDetail] = useState<PostureType | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [hoveredCell, setHoveredCell] = useState<{
    month: number;
    day: number;
    ratio: number;
    grade: string;
    info: any;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredHeatmapCell, setHoveredHeatmapCell] = useState<{
    label: string;
    hour: number;
    secs: number;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredLinePoint, setHoveredLinePoint] = useState<{
    x: number;
    y: number;
    score: number;
    hour: number;
    violations: number;
    activeSecs: number;
    badSecs?: number;
  } | null>(null);

  // 실시간 착석 시간 로컬 상태 연동
  const [activeDurationByHour, setActiveDurationByHour] = useState<number[]>(() => {
    const raw = localStorage.getItem("active_duration_by_hour");
    try {
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 24) return parsed;
      }
    } catch {}
    return new Array(24).fill(0);
  });

  const [yesterdayActiveDurationByHour, setYesterdayActiveDurationByHour] = useState<number[]>(() => {
    const raw = localStorage.getItem("active_duration_by_hour_yesterday");
    try {
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 24) return parsed;
      }
    } catch {}
    return new Array(24).fill(0);
  });

  // 실시간 좋은 자세 시간 로컬 상태 연동
  const [goodDurationByHour, setGoodDurationByHour] = useState<number[]>(() => {
    const raw = localStorage.getItem("good_duration_by_hour");
    try {
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 24) return parsed;
      }
    } catch {}
    return new Array(24).fill(0);
  });

  useEffect(() => {
    const sync = () => {
      const rawActive = localStorage.getItem("active_duration_by_hour");
      try {
        if (rawActive) {
          const parsed = JSON.parse(rawActive);
          if (Array.isArray(parsed) && parsed.length === 24) {
            setActiveDurationByHour(parsed);
          }
        }
      } catch {}

      const rawGood = localStorage.getItem("good_duration_by_hour");
      try {
        if (rawGood) {
          const parsed = JSON.parse(rawGood);
          if (Array.isArray(parsed) && parsed.length === 24) {
            setGoodDurationByHour(parsed);
          }
        }
      } catch {}
    };

    const syncYesterday = () => {
      const rawActive = localStorage.getItem("active_duration_by_hour_yesterday");
      try {
        if (rawActive) {
          const parsed = JSON.parse(rawActive);
          if (Array.isArray(parsed) && parsed.length === 24) {
            setYesterdayActiveDurationByHour(parsed);
          }
        }
      } catch {}
    };

    // 1초 타이머와 연동하여 동기화
    const timer = setInterval(() => {
      sync();
      syncYesterday();
    }, 1000);

    // 타 창 동기화 리스너
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "active_duration_by_hour" || e.key === "good_duration_by_hour") {
        sync();
      }
      if (e.key === "active_duration_by_hour_yesterday" || e.key === "good_duration_by_hour_yesterday") {
        syncYesterday();
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const triggerBackgroundSync = () => {
    try {
      const historyStr = localStorage.getItem("barosit_daily_history") || "{}";
      const history = JSON.parse(historyStr);
      const unsentKeys = Object.keys(history).filter(k => history[k].synced === false);
      if (unsentKeys.length === 0) return;

      console.log(`[Sync Engine] Unsent daily records found:`, unsentKeys);
      console.log(`[Sync Engine] Simulating POST /api/history/sync-batch with payload:`, 
        unsentKeys.map(k => ({ date: k, data: history[k] }))
      );

      setTimeout(() => {
        try {
          const freshHistoryStr = localStorage.getItem("barosit_daily_history") || "{}";
          const freshHistory = JSON.parse(freshHistoryStr);
          unsentKeys.forEach(k => {
            if (freshHistory[k]) {
              freshHistory[k].synced = true;
            }
          });
          localStorage.setItem("barosit_daily_history", JSON.stringify(freshHistory));
          console.log(`[Sync Engine] Batch sync succeeded! Synced keys updated to true.`);
        } catch (e) {
          console.error("[Sync Engine] Post-sync update failed:", e);
        }
      }, 1500);

    } catch (err) {
      console.error("[Sync Engine] Sync failed:", err);
    }
  };

  useEffect(() => {
    triggerBackgroundSync();
  }, []);

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

  // 로그인 직후 서버 프로필/설정을 백그라운드로 복원. ProfileView 가 마운트
  // 되지 않은 채 로그인이 진행되는 데스크탑 흐름(메인 화면 → 로그인 → 콜백
  // → ProfileView 자동 닫힘)에서 pullProfile 이 한 번도 호출되지 않던
  // 누락을 메웁니다. UI 는 즉시 진행, 데이터는 백그라운드 — 사용자 원칙.
  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const { pullProfileFromServer, pullSettingsFromServer } = await import(
          "../lib/syncService"
        );
        void pullProfileFromServer();
        void pullSettingsFromServer();
      } catch (err) {
        console.error("[MonitorView] Failed to pull profile/settings:", err);
      }
    })();
  }, [user?.id]);

  // 우상단 프로필 버튼의 소셜 이미지 로딩 실패 추적. user 가 바뀌면 reset.
  // React state 로 관리해 reconciler 와 충돌 없음 (이전 DOM 직접 조작은
  // user=null 전환 시 외부 span 잔존 문제가 있었음).
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);
  useEffect(() => {
    setAvatarImageFailed(false);
  }, [user?.id]);
  const socialAvatarUrl = extractSocialAvatarUrl(user);
  const userInitial = pickInitial(profile.name, user);

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

  // OS 입력 유휴 + 자리비움이면 카메라까지 끔 → 시스템 배터리 보호 정상 작동.
  // 입력/깨어남으로 재개(= 작업 재개). 복귀 감지를 카메라가 아닌 OS 입력으로 한다.
  const idleSuspended = useIdleSuspend(lastPresentAtRef);

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

  // 재개(suspend 해제) 시 자리비움 타이머 리셋 — 카메라 켜질 때 즉시 재-자리비움 오판 방지.
  useEffect(() => {
    if (!idleSuspended) lastPresentAtRef.current = Date.now();
  }, [idleSuspended]);

  // suspend 중엔 카메라 OFF → cameracaptured 어서션 해제로 시스템 슬립/화면보호기 허용.
  const { videoRef, ready: cameraReady, error: cameraError } = useCamera(
    cameraActive && !idleSuspended,
  );

  // useMemoryReloadGuard 가 reload 직전 발행하는 이벤트를 받아 현재 video +
  // silhouette overlay 합성 snapshot 을 sessionStorage 에 저장. App.tsx 의
  // SnapshotOverlay 가 reload 후 짧게 표시해 사용자가 reload 자체를 인지
  // 못하게 한다.
  useEffect(() => {
    const handler = () => {
      // visible silhouette canvas — silhouette + dot + 어깨/팔 라인 까지 합성된
      // 사용자 화면 그대로. 머리 위 졸라맨인 PostureFigure 는 별도 SVG 라 canvas
      // 에 안 잡히고 baselineState 조건으로 이미 차단되어 안전. dot/어깨선이
      // SnapshotOverlay 에도 포함되어 fade-out 시점에 갑자기 등장하는 위화감 차단.
      const visibleCanvas = document.querySelector<HTMLCanvasElement>(
        "canvas[data-silhouette-canvas]",
      );
      const dataURL = captureMonitorSnapshot({
        video: videoRef.current,
        silhouetteCanvas: visibleCanvas,
      });
      if (!dataURL) return;
      const rectDom = visibleCanvas?.getBoundingClientRect();
      const rect = rectDom
        ? {
            top: rectDom.top,
            left: rectDom.left,
            width: rectDom.width,
            height: rectDom.height,
          }
        : undefined;
      saveSnapshot(dataURL, rect);
    };
    window.addEventListener("barosit:before-memory-reload", handler);
    return () => window.removeEventListener("barosit:before-memory-reload", handler);
  }, [videoRef]);

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
  const [stretchesTodayCount, setStretchesTodayCount] = useState<number>(() => {
    return Number(localStorage.getItem("stretches_today") || "0");
  });
  const [activeDurationTodayCount, setActiveDurationTodayCount] = useState<number>(() => {
    return Number(localStorage.getItem("active_duration_today") || "0");
  });
  const [goodDurationTodayCount, setGoodDurationTodayCount] = useState<number>(() => {
    return Number(localStorage.getItem("good_duration_today") || "0");
  });
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
      if (e.key === "stretches_today") {
        setStretchesTodayCount(Number(e.newValue || "0"));
      }
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
      if (!document.hidden) {
        lastPresentAtRef.current = Date.now();
        // 윈도우로 복귀 시 백그라운드 엔진이 누적한 최신 통계 데이터 즉각 동기화
        setActiveDurationTodayCount(Number(localStorage.getItem("active_duration_today") || "0"));
        setGoodDurationTodayCount(Number(localStorage.getItem("good_duration_today") || "0"));
        setStretchesTodayCount(Number(localStorage.getItem("stretches_today") || "0"));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // 슬립/덮개 닫힘/화면보호기 해제 후 깨어남(작업 재개) 감지 — absence 타이머를
  // 리셋해 슬립 동안의 시간 공백으로 즉시 자리비움 오판하는 것을 막고, 사용자가
  // 다시 잡히면 정상 재개되게 한다. (카메라 재획득은 useCamera 가 wake 로 처리.)
  useEffect(() => subscribeWake(() => { lastPresentAtRef.current = Date.now(); }), []);

  // 오늘 총 사용 시간, 좋은 자세 시간, 스트레칭 횟수 실시간 동기화 (다중 창 및 백그라운드)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "active_duration_today") {
        setActiveDurationTodayCount(Number(e.newValue || "0"));
      }
      if (e.key === "good_duration_today") {
        setGoodDurationTodayCount(Number(e.newValue || "0"));
      }
      if (e.key === "stretches_today") {
        setStretchesTodayCount(Number(e.newValue || "0"));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // keepAwake(무음 오디오로 webview suspend 방지)는 usePoseLoop 가 enabled
  // 생명주기에 맞춰 시작/중단한다 — 감지 중에만 깨어 있고 일시정지/유휴면 시스템이
  // 잠들 수 있게 해 배터리 누수를 막는다.

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
  const debugRef = useRef<AnalysisDebug | null>(null);
  const violationsRef = useRef<Set<PostureType>>(new Set());
  const lastRecommendedAngleRef = useRef<"front" | "left" | "right" | null>(null);
  // Hysteresis 용 마지막 sticky angle. flap 차단 위해 진입 12° / 이탈 8° 적용.
  const lastAngleRef = useRef<"front" | "left" | "right" | null>(null);
  // useMemoryReloadGuard 가 reload 직전 발행하는 mask-ready 이벤트용 — 첫
  // mask 한 번만 발행해 SnapshotOverlay 가 fade-out.
  const firstMaskFiredRef = useRef<boolean>(false);
  // 첫 mask 도착 후 SilhouetteOverlay 가 그려진 다음 frame 부터 LandmarkOverlay
  // 표시. mask 와 같은 frame 에 그리면 silhouette 보다 LandmarkOverlay 가
  // 1 frame 먼저 paint 되어 졸라맨이 한 순간 노출됨 → RAF 2번 대기.
  const [landmarkReady, setLandmarkReady] = useState(false);
  // pose loop heartbeat + watchdog — 60초+ stale 시 hard reload
  const monitorHeartbeat = useHeartbeat();
  useWatchdog("monitor-frame", monitorHeartbeat.getLastAt, {
    expectedIntervalMs: 100,
    warnThresholdMs: 30_000,
    reloadThresholdMs: 60_000,
    // idleSuspended(자리비움으로 카메라 OFF)면 onFrame 이 의도적으로 멈춘 것이므로
    // watchdog 가 stale 로 오판해 hard reload 하지 않도록 비활성화.
    active: !paused && !widgetEnabled && !detailedReportOpen && !idleSuspended,
  });

  // 자리비움으로 카메라가 OFF(idleSuspended)되면 onFrame 이 멈춰 status 가 마지막
  // 값에 고정된다. 명시적으로 자리비움(paused)으로 표시해 "잘 앉아 있어요"로 남지 않게.
  // 재개 시엔 heartbeat 를 갱신해 정지 기간의 stale 타임스탬프로 watchdog 가 즉시
  // reload 하는 레이스를 방지(검출 루프가 재개되면 frame 이 status 를 다시 설정).
  useEffect(() => {
    if (idleSuspended) {
      setStatus("paused");
      updateStatus("paused").catch(() => undefined);
      onStatusChange?.("paused");
    } else {
      monitorHeartbeat.tick();
    }
  }, [idleSuspended, monitorHeartbeat, onStatusChange]);
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
      onStatusChange?.("good");
    }
  }, [paused, onStatusChange]);

  // 백그라운드 서버 데이터 동기화 연동
  useEffect(() => {
    // 상태 변경 시점 즉시 동기화 트리거
    triggerAutoSync();

    if (paused) return;

    // 5분 간격 주기적 백그라운드 동기화 (5 * 60 * 1000 = 300,000ms)
    const intervalId = setInterval(() => {
      triggerAutoSync();
    }, 300000);

    return () => {
      clearInterval(intervalId);
      // 일시정지 진입 시 최종 동기화 트리거
      triggerAutoSync();
    };
  }, [paused]);

  const statusRef = useRef<PostureStatus>(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const scoreRef = useRef<number>(score);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  // 오늘 총 사용 시간, 좋은 자세 시간, 점수 누적 타이머 (실시간 반영)
  useEffect(() => {
    if (widgetEnabled || paused) return;

    const id = window.setInterval(() => {
      // 자리비움(paused) 상태가 아닐 때만 카운팅
      if (statusRef.current === "paused") return;

      try {
        // 1. 총 사용 시간 누적
        const currentActive = Number(localStorage.getItem("active_duration_today") || "0");
        const nextActive = currentActive + 1;
        localStorage.setItem("active_duration_today", String(nextActive));
        setActiveDurationTodayCount(nextActive);

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
          setGoodDurationTodayCount(nextGood);

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
        console.error("Failed to accumulate monitoring stats in MonitorView:", e);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [widgetEnabled, paused]);

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

  const loopParams = usePerformanceProfile(visible);
  // 데스크톱 앱은 로그인 + PRO 전용(§7 E3, 해석 B). 비로그인/FREE 는 모니터링을
  // 돌리지 않고 기존 업셀 배너(아래 !user || subPlan==='free')로 로그인·업그레이드를
  // 유도한다. subPlan 캐시는 App.fetchSub 가 실효 플랜(베타 모드 포함)으로 정합한다.
  const monitoringEntitled = isMonitoringEntitled(user, subPlan);
  const { error: detectorError, retry: detectorRetry } = usePoseLoop({
    videoRef,
    enabled: cameraReady && !paused && monitoringEntitled,
    // 윈도우가 다른 앱 뒤로 가려져도 (Tauri/macOS occlusion → document.hidden)
    // 모니터링은 계속해야 함. face/hands 는 자리비움 판정과 chin_resting 검출에
    // 필수라 항상 ON. 성능 프로필(Full/Eco)에 따라 fps·모델 실행 주기만 조절.
    fps: loopParams.fps,
    segmentEveryN: loopParams.segmentEveryN,
    runFace: true,
    runHands: true,
    faceEveryN: loopParams.faceEveryN,
    handsEveryN: loopParams.handsEveryN,
    // 자리비움(status "paused")이면 keepAwake 끔 → 시스템 슬립/화면보호기 허용.
    present: status !== "paused",
    onFrame: (frame: DetectionFrame) => {
      monitorHeartbeat.tick();
      if (paused) return;

      // [실루엣 블랙아웃 수정] mask(세그멘테이션) 처리는 pose 검출과 독립적이므로
      // pose 가드보다 먼저 수행한다. Why: 주기적 메모리 reload 후 maskReadyRef 가
      // 리셋된 상태에서 첫 프레임에 pose 가 없으면(자리비움/pose 깜빡임) 아래
      // `if (!frame.pose) return` 에 막혀 mask 가 영영 set 되지 않아 SilhouetteOverlay
      // 가 계속 빈(검은) 화면으로 남던 버그. 세그멘터는 pose 없이도 사람 실루엣을
      // 만들어내므로 항상 반영한다.
      if (frame.mask) {
        setMask(frame.mask);
        if (!firstMaskFiredRef.current) {
          firstMaskFiredRef.current = true;
          try {
            window.dispatchEvent(new CustomEvent("barosit:mask-ready"));
          } catch {
            /* noop */
          }
          // SilhouetteOverlay 가 mask prop 을 받아 useEffect 로 canvas 에
          // 그리려면 commit + 다음 frame 필요. RAF 2 번 대기 후 LandmarkOverlay
          // 표시 → silhouette 이 먼저 paint 되어 졸라맨 노출 차단.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setLandmarkReady(true));
          });
        }
      }

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
      // mask 처리는 pose 가드 이전으로 이동됨 (위 참조).

      // 실시간 카메라 각도 감지 및 기준선 오토 스위칭 연동.
      // lastAngleRef 로 hysteresis 적용 — yaw 임계 근처 진동에 의한 flap 차단.
      if (frame.face && baselineState) {
        const currentAngle = determineAngleSticky(frame.face, lastAngleRef.current);
        const storedAngle = determineAngle(baselineState.face);
        lastAngleRef.current = currentAngle;

        if (currentAngle !== storedAngle) {
          // A. 오토 스위칭 성공 여부와 무관하게, 감지된 실시간 카메라 방향 상태를 즉각 반영하여 아이콘을 좌우로 점프시킴
          setCameraAngle(currentAngle);

          const nextBaseline = loadBaseline(currentAngle);
          if (nextBaseline) {
            setBaselineState(nextBaseline);
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
        baselineState,
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

      const stretchKind = detectStretch(smoothed, frame.face, baselineState);
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
          setStretchesTodayCount(nextCount);
        } catch (e) {
          console.error("Failed to increment stretches count:", e);
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
      setBreakStatus(breakResult.status);
      if (breakResult.fired) {
        // JITAI — 즉시 발사하지 않고 방해 가능 순간까지 보류(아래 Phase 6 에서 발사).
        breakJitaiGateRef.current.hold(breakResult.fired, Date.now());
      }
      if (breakResult.completed) {
        // 1분 움직임 목표 달성 → 착석시계 리셋됨. 긍정 강화(보상 토스트+점수).
        dispatchComplianceReward(`break_${breakResult.completed}` as NudgeKind);
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
          frame.face && baselineState?.face
            ? Math.abs(frame.face.yaw - baselineState.face.yaw)
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

      // Phase 5 — 알림 준수 추적. 발사된 알림 후 응답 윈도우 내 행동을 보고
      // 준수/미준수를 확정. 준수 시 긍정 강화(점수 보너스), 둘 다 일일 집계.
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
        setLastAlarm({ type: latest.type, at: Date.now() });
      }
      for (const event of fired) {
        appendEvent({
          type: event.type,
          startedAt: event.startedAt,
          durationSecs: event.durationSecs,
        });

        const intensity = intensityFromDuration(event.durationSecs);
        // 정적 다국어 코칭 (AI 생성 코칭 대체). 오버레이는 null이면 coaching:tip 폴백.
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

      const next: PostureStatus = result.isResting
        ? "resting"
        : result.isStanding
          ? "standing"
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
  // idleSuspended(자리비움으로 카메라 OFF)면 cameraReady=false 라 기존 조건이 away 를
  // 놓친다 → "양호"로 잘못 표시됨. suspend 자체가 자리비움 신호이므로 away 로 인정.
  const away =
    !paused &&
    !widgetEnabled &&
    (idleSuspended || (cameraReady && sinceAbsence > ABSENCE_GRACE_MS));
  const resting = status === "resting";
  const standing = status === "standing";
  const tone: "good" | "amber" | "warn" | "dim" = paused
    ? "dim"
    : away
      ? "dim"
      : resting
        ? "dim"
        : standing
          ? "good"
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
    ? t("monitor:statusBadge.paused")
    : away
      ? t("monitor:statusBadge.away")
      : resting
        ? t("monitor:statusBadge.resting")
        : standing
          ? t("monitor:statusBadge.standing")
          : tone === "good"
            ? t("monitor:statusBadge.good")
            : tone === "amber"
              ? t("monitor:statusBadge.warn")
              : t("monitor:statusBadge.bad");

  // 메인 카피
  const primaryViolation = displayViolations[0];
  const headline = paused
    ? t("monitor:headline.paused")
    : away
      ? t("monitor:headline.away")
      : resting
        ? t("monitor:headline.resting")
        : standing
          ? t("monitor:headline.standing")
          : tone === "good"
            ? t("monitor:headline.good")
            : tone === "amber"
              ? t("monitor:headline.amber")
              : primaryViolation
                ? t(`coaching:tip.${primaryViolation}`)
                : t("monitor:headline.bad");

  const subline = paused
    ? t("monitor:subline.paused")
    : away
      ? t("monitor:subline.away")
      : resting
        ? t("monitor:subline.resting")
        : standing
          ? t("monitor:subline.standing")
          : tone === "good"
            ? t("monitor:subline.good")
            : primaryViolation
            ? t("monitor:subline.violation", {
                label: t(`posture:label.${primaryViolation}`),
                duration: formatDuration(maxDurationSecs),
              })
            : t("monitor:subline.scanning");

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

      // Day transition check for stretches and durations
      const todayDateStr = new Date(startToday).toDateString();
      const lastActiveDateStr = localStorage.getItem("last_active_date");
      let stretches = stretchesTodayCount;
      if (lastActiveDateStr && lastActiveDateStr !== todayDateStr) {
        // [Retroactive Pack-and-Sync] 이전 임시 누적 데이터를 어제 날짜의 최종 데이터로 압축 포장
        try {
          const prevActive = Number(localStorage.getItem("active_duration_today") || "0");
          const prevGood = Number(localStorage.getItem("good_duration_today") || "0");
          const prevStretches = Number(localStorage.getItem("stretches_today") || "0");
          
          // 이전 활성일에 발생했던 위반 횟수 계산
          const prevDateObj = new Date(lastActiveDateStr);
          const startOfPrevDay = new Date(prevDateObj.getFullYear(), prevDateObj.getMonth(), prevDateObj.getDate()).getTime();
          const endOfPrevDay = startOfPrevDay + 24 * 60 * 60 * 1000;
          const prevViolations = events.filter(e => e.startedAt >= startOfPrevDay && e.startedAt < endOfPrevDay).length;

          const ratio = prevActive > 0 ? Math.round((prevGood / prevActive) * 100) : 100;
          
          const yyyy = prevDateObj.getFullYear();
          const mm = String(prevDateObj.getMonth() + 1).padStart(2, "0");
          const dd = String(prevDateObj.getDate()).padStart(2, "0");
          const yyyymmdd = `${yyyy}-${mm}-${dd}`;

          const historyStr = localStorage.getItem("barosit_daily_history") || "{}";
          const history = JSON.parse(historyStr);
          
          history[yyyymmdd] = {
            r: ratio,
            v: prevViolations,
            s: prevStretches,
            a: prevActive,
            synced: false
          };
          
          localStorage.setItem("barosit_daily_history", JSON.stringify(history));

          // 1초 뒤 서버 일괄 업로드 실행
          setTimeout(() => {
            triggerBackgroundSync();
          }, 1000);
        } catch (err) {
          console.error("Day transition packing error:", err);
        }

        const prevStretches = localStorage.getItem("stretches_today") || "0";
        localStorage.setItem("stretches_yesterday", prevStretches);
        localStorage.setItem("stretches_today", "0");
        stretches = 0;
        setTimeout(() => setStretchesTodayCount(0), 0);

        const prevGood = localStorage.getItem("good_duration_today") || "0";
        localStorage.setItem("good_duration_yesterday", prevGood);
        localStorage.setItem("good_duration_today", "0");
        setTimeout(() => setGoodDurationTodayCount(0), 0);

        const prevActive = localStorage.getItem("active_duration_today") || "0";
        localStorage.setItem("active_duration_yesterday", prevActive);
        localStorage.setItem("active_duration_today", "0");
        setTimeout(() => setActiveDurationTodayCount(0), 0);

        const prevActiveByHour = localStorage.getItem("active_duration_by_hour") || JSON.stringify(new Array(24).fill(0));
        localStorage.setItem("active_duration_by_hour_yesterday", prevActiveByHour);
        localStorage.setItem("active_duration_by_hour", JSON.stringify(new Array(24).fill(0)));

        const prevGoodByHour = localStorage.getItem("good_duration_by_hour") || JSON.stringify(new Array(24).fill(0));
        localStorage.setItem("good_duration_by_hour_yesterday", prevGoodByHour);
        localStorage.setItem("good_duration_by_hour", JSON.stringify(new Array(24).fill(0)));

        localStorage.setItem("last_active_date", todayDateStr);
      } else if (!lastActiveDateStr) {
        localStorage.setItem("last_active_date", todayDateStr);
      }

      const stretchesYesterday = Number(
        localStorage.getItem("stretches_yesterday") || "0",
      );
      const yesterdayActiveSecsVal = Number(localStorage.getItem("active_duration_yesterday") || "0");
      const hasYesterdayData = yesterdayActiveSecsVal > 0;

      return {
        todayStats: {
          avgScore: Math.round(displayScore),
          violations: todayTotal,
          stretches,
        },
        yesterdayByHour: yesterday.byHour,
        deltas: {
          violations: hasYesterdayData ? todayTotal - yesterdayTotal : null,
          stretches: hasYesterdayData ? stretches - stretchesYesterday : null,
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
        deltas: { violations: null, stretches: null },
      };
    }
  })();

  // 좋은 자세 유지율 계산 (실시간)
  const todayGoodRatio = activeDurationTodayCount > 0
    ? (goodDurationTodayCount / activeDurationTodayCount) * 100
    : 100;
  
  const yesterdayActiveSecs = Number(localStorage.getItem("active_duration_yesterday") || "0");
  const yesterdayGoodSecs = Number(localStorage.getItem("good_duration_yesterday") || "0");
  const yesterdayGoodRatio = yesterdayActiveSecs > 0
    ? (yesterdayGoodSecs / yesterdayActiveSecs) * 100
    : 100;

  const goodRatioDelta = yesterdayActiveSecs > 0
    ? todayGoodRatio - yesterdayGoodRatio
    : null;

  // 좋은 자세 유지율에 따른 자세 건강 등급 결정
  const getPostureGrade = (ratio: number) => {
    if (ratio >= 95) return { grade: "S", label: t("monitor:grade.S.label"), desc: t("monitor:grade.S.desc"), color: "var(--b-sig)" };
    if (ratio >= 90) return { grade: "A", label: t("monitor:grade.A.label"), desc: t("monitor:grade.A.desc"), color: "var(--b-sig)" };
    if (ratio >= 80) return { grade: "B", label: t("monitor:grade.B.label"), desc: t("monitor:grade.B.desc"), color: "var(--b-fg-1)" };
    if (ratio >= 70) return { grade: "C", label: t("monitor:grade.C.label"), desc: t("monitor:grade.C.desc"), color: "var(--b-warn)" };
    return { grade: "D", label: t("monitor:grade.D.label"), desc: t("monitor:grade.D.desc"), color: "var(--b-warn)" };
  };

  const todayGradeInfo = getPostureGrade(todayGoodRatio);

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
        {/* Nudge Alert Banner for Guest / Free Users */}
        {(!user || (isBetaFree() ? IS_WEB : subPlan === "free")) && (
          <div
            className="barosit-nudge-banner"
            onClick={!user ? onOpenProfile : (isBetaFree() ? () => { window.location.hash = "#/community"; } : onOpenPricing)}
            style={{
              cursor: "pointer",
              position: "relative",
              borderRadius: "16px",
              padding: "16px 24px",
              marginBottom: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "20px",
              background: !user
                ? "linear-gradient(135deg, rgba(30, 27, 75, 0.45) 0%, rgba(15, 23, 42, 0.6) 100%)"
                : "linear-gradient(135deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.6) 100%)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: !user
                ? "1px solid rgba(99, 102, 241, 0.15)"
                : "1px solid rgba(234, 179, 8, 0.15)",
              boxShadow: !user
                ? "0 8px 32px 0 rgba(99, 102, 241, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.05)"
                : "0 8px 32px 0 rgba(234, 179, 8, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.05)",
              overflow: "hidden",
              transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Glow effect decor */}
            <div
              style={{
                position: "absolute",
                top: "-50%",
                left: "-20%",
                width: "60%",
                height: "200%",
                background: !user
                  ? "radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0) 70%)"
                  : "radial-gradient(circle, rgba(234, 179, 8, 0.12) 0%, rgba(234, 179, 8, 0) 70%)",
                pointerEvents: "none",
                zIndex: 0,
                transform: "rotate(-15deg)",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: "16px", zIndex: 1, flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "42px",
                  height: "42px",
                  borderRadius: "12px",
                  background: !user
                    ? "rgba(99, 102, 241, 0.12)"
                    : "rgba(234, 179, 8, 0.12)",
                  border: !user
                    ? "1px solid rgba(99, 102, 241, 0.2)"
                    : "1px solid rgba(234, 179, 8, 0.2)",
                  color: !user ? "#818cf8" : "#fbbf24",
                  fontSize: "20px",
                  flexShrink: 0,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              >
                {!user ? "☁️" : "⚡"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                <span
                  style={{
                    fontSize: "14.5px",
                    fontWeight: 600,
                    color: "rgba(255, 255, 255, 0.95)",
                    letterSpacing: "-0.01em",
                    lineHeight: 1.45,
                  }}
                >
                  {!user
                    ? t("monitor:proBanner.guestMsg")
                    : (isBetaFree() ? t("monitor:proBanner.freeMsg_beta") : t("monitor:proBanner.freeMsg"))}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: !user ? "rgba(199, 210, 254, 0.95)" : "rgba(251, 191, 36, 0.85)",
                    letterSpacing: "-0.005em",
                  }}
                >
                  {!user
                    ? t("monitor:proBanner.guestSub")
                    : (isBetaFree() ? t("monitor:proBanner.freeSub_beta") : t("monitor:proBanner.freeSub"))}
                </span>
              </div>
            </div>

            <button
              style={{
                zIndex: 1,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 18px",
                borderRadius: "10px",
                background: !user
                  ? "linear-gradient(135deg, rgba(99, 102, 241, 0.85) 0%, rgba(79, 70, 229, 0.9) 100%)"
                  : "linear-gradient(135deg, rgba(245, 158, 11, 0.85) 0%, rgba(217, 119, 6, 0.9) 100%)",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                boxShadow: !user
                  ? "0 4px 14px 0 rgba(99, 102, 241, 0.3)"
                  : "0 4px 14px 0 rgba(245, 158, 11, 0.3)",
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
              }}
              className="nudge-action-btn"
            >
              {!user ? t("monitor:proBanner.guestCta") : (isBetaFree() ? t("monitor:proBanner.freeCta_beta") : t("monitor:proBanner.freeCta"))}
              <Icon name="chev-r" size={11} />
            </button>

            {/* Inline CSS styling helper to support advanced hover effects beautifully */}
            <style>{`
              .barosit-nudge-banner {
                position: relative;
              }
              .barosit-nudge-banner:hover {
                transform: translateY(-2px);
                border-color: ${!user ? "rgba(99, 102, 241, 0.3)" : "rgba(234, 179, 8, 0.3)"} !important;
                box-shadow: ${
                  !user
                    ? "0 12px 36px 0 rgba(99, 102, 241, 0.15), inset 0 1px 1px 0 rgba(255, 255, 255, 0.08)"
                    : "0 12px 36px 0 rgba(234, 179, 8, 0.15), inset 0 1px 1px 0 rgba(255, 255, 255, 0.08)"
                } !important;
              }
              .barosit-nudge-banner:active {
                transform: translateY(0);
              }
              .barosit-nudge-banner:hover .nudge-action-btn {
                transform: scale(1.03);
                filter: brightness(1.1);
              }
            `}</style>
          </div>
        )}
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
              {i18n.language === "ko" ? MAIN_SLOGAN : t("app:tagline")}
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
                  ? t("monitor:break.deep")
                  : stage === "standup"
                    ? t("monitor:break.standup")
                    : stage === "micro"
                      ? t("monitor:break.micro")
                      : t("monitor:break.soon");
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
                  <span style={{ fontWeight: 700 }}>{t("monitor:break.sitting", { mins })}</span>
                  <span style={{ opacity: 0.7 }}>· {message}</span>
                </div>
              );
            })()}
          </div>
          {/* Quick actions */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="b-icon-btn b-tip"
              aria-label={paused ? t("monitor:controls.resumeAria") : t("monitor:controls.pauseAria")}
              data-tip={
                paused
                  ? t("monitor:controls.resumeTip", { shortcut: shortcutText })
                  : t("monitor:controls.pauseTip", { shortcut: shortcutText })
              }
              onClick={onTogglePause}
            >
              <Icon name={paused ? "play" : "pause"} size={15} />
            </button>
            {platform.features.multiWindow && (
              <>
                <button
                  className="b-icon-btn b-tip"
                  aria-label={minibarOn ? t("monitor:controls.minibarHideAria") : t("monitor:controls.minibarShowAria")}
                  data-tip={
                    minibarOn
                      ? t("monitor:controls.minibarHideTip")
                      : t("monitor:controls.minibarShowTip")
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
                  aria-label={t("monitor:controls.widgetModeTip")}
                  data-tip={t("monitor:controls.widgetModeTip")}
                  onClick={() => switchToWidgetMode().catch(() => undefined)}
                  disabled={!minibarOn}
                  style={{ height: 32, padding: "0 10px", fontSize: 12 }}
                >
                  <Icon name="chev-d" size={12} />
                  {t("monitor:controls.widgetMode")}
                </button>
              </>
            )}
            <button
              className="b-icon-btn b-tip"
              aria-label={t("monitor:controls.settings")}
              data-tip={t("monitor:controls.settings")}
              onClick={onOpenSettings}
            >
              <Icon name="settings" size={15} />
            </button>
            {!platform.features.multiWindow && (
              <a
                href="#/landing"
                className="b-btn b-btn-ghost b-tip"
                aria-label={t("monitor:controls.homeAria")}
                data-tip={t("monitor:controls.homeTip")}
                style={{
                  height: 32,
                  padding: "0 10px",
                  fontSize: 12,
                  textDecoration: "none",
                }}
              >
                {t("monitor:controls.home")}
              </a>
            )}
            {user && isAdmin && (
              <a
                href="#/admin"
                className="b-btn b-btn-ghost b-tip"
                aria-label="어드민 제어 센터"
                data-tip="어드민 대시보드 구동"
                style={{
                  height: 32,
                  padding: "0 10px",
                  fontSize: 12,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  color: "#e08866",
                  border: "1px solid rgba(224, 136, 102, 0.3)",
                  background: "rgba(224, 136, 102, 0.04)"
                }}
              >
                <Icon name="shield" size={13} style={{ opacity: 0.8 }} />
                <span>관리자</span>
              </a>
            )}
            {user ? (
              <button
                className="b-icon-btn b-tip"
                aria-label={t("monitor:controls.profileAria")}
                data-tip={profile.name ? t("monitor:controls.profileTip", { name: profile.name }) : t("monitor:controls.profile")}
                onClick={onOpenProfile}
                style={{
                  fontSize: 18,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  padding: 0,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "2px solid var(--b-border-translucent, rgba(255,255,255,0.1))",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  transition: "transform 0.2s, border-color 0.2s"
                }}
              >
                {/*
                  소셜 OAuth 로 받은 프로필 이미지를 우선 표시. 로딩 실패
                  (카카오 CDN referer 차단 등) 시 React state 로 fallback —
                  이름 이니셜 표시. 사용자가 직접 *변경*하는 UI 는 없음.
                */}
                {socialAvatarUrl && !avatarImageFailed ? (
                  <img
                    src={socialAvatarUrl}
                    alt={userInitial}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarImageFailed(true)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: "50%",
                    }}
                  />
                ) : (
                  <span
                    aria-hidden
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      height: "100%",
                      background: "linear-gradient(135deg, var(--b-sig, #5b8c7a), #3c5e52)",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: 0,
                    }}
                  >
                    {userInitial}
                  </span>
                )}
              </button>
            ) : (
              <button
                className="b-btn b-btn-ghost b-tip"
                aria-label={t("monitor:controls.loginAria")}
                data-tip={t("monitor:controls.loginTip")}
                onClick={onOpenProfile}
                style={{
                  height: 32,
                  padding: "0 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: "20px",
                  border: "1px solid var(--b-line-2, rgba(255,255,255,0.15))",
                  background: "rgba(255, 255, 255, 0.03)",
                  color: "var(--b-fg-1)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.05)"
                }}
              >
                <Icon name="shield" size={13} style={{ opacity: 0.8 }} />
                <span>{t("monitor:controls.login")}</span>
              </button>
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
              background: "#0a0a0a",
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
                  baseline={baselineState}
                />
                {/* posture figure 오버레이 — 캘리브레이션 안 된 첫 사용자
                    가이드용. baseline 이 있으면 (캘리브레이션 완료) reload
                    직후 landmarks 가 아직 null 인 짧은 순간에 SVG 졸라맨이
                    노출되어 거슬리므로 baseline 없을 때만 표시. */}
                {!landmarks && !paused && !baselineState && (
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
              // 첫 mask 가 도착하고 SilhouetteOverlay 가 그려진 다음 frame 부터
              // 표시. Why: 같은 frame 에 그리면 LandmarkOverlay 가 silhouette
              // 보다 먼저 paint 되어 졸라맨이 한 순간 노출됨.
              landmarkReady && <LandmarkOverlay landmarks={landmarks} />
            )}

            {/* 미권한(비로그인/FREE) 안내 오버레이 — 모니터링 루프가 꺼져 실루엣이
                비어 있을 때 카드가 "고장"처럼 보이지 않도록 이유 + CTA 를 카드
                안에 직접 표시. 생 웹캠도 함께 가려 프라이버시 보호. */}
            {!monitoringEntitled && (
              <div
                onClick={!user ? onOpenProfile : onOpenPricing}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 5,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: 12,
                  padding: 20,
                  background:
                    "linear-gradient(160deg, rgba(15,23,42,0.92) 0%, rgba(10,10,10,0.96) 100%)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: !user
                      ? "rgba(99,102,241,0.14)"
                      : "rgba(234,179,8,0.14)",
                    border: !user
                      ? "1px solid rgba(99,102,241,0.25)"
                      : "1px solid rgba(234,179,8,0.25)",
                    color: !user ? "#a5b4fc" : "#fbbf24",
                  }}
                >
                  <Icon name="lock" size={20} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxWidth: 250 }}>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.95)",
                      lineHeight: 1.4,
                    }}
                  >
                    {!user
                      ? t("monitor:cameraLock.guestTitle")
                      : t("monitor:cameraLock.freeTitle")}
                  </span>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 500,
                      color: "rgba(203,213,225,0.85)",
                      lineHeight: 1.45,
                    }}
                  >
                    {!user
                      ? t("monitor:cameraLock.guestSub")
                      : t("monitor:cameraLock.freeSub")}
                  </span>
                </div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 16px",
                    borderRadius: 10,
                    background: !user
                      ? "linear-gradient(135deg, rgba(99,102,241,0.9) 0%, rgba(79,70,229,0.92) 100%)"
                      : "linear-gradient(135deg, rgba(245,158,11,0.9) 0%, rgba(217,119,6,0.92) 100%)",
                    color: "#fff",
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  {!user
                    ? t("monitor:cameraLock.guestCta")
                    : t("monitor:cameraLock.freeCta")}
                  <Icon name="chev-r" size={11} />
                </span>
              </div>
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

            {/* Camera Position Icon Badge (Ultra-minimalist, placed elegantly at the bottom edge inside the card) */}
            <div
              title={cameraAngle === "front" ? t("monitor:camera.detectedFront") : cameraAngle === "left" ? t("monitor:camera.detectedLeft") : t("monitor:camera.detectedRight")}
              style={{
                position: "absolute",
                bottom: 10,
                ...(cameraAngle === "left"
                  ? { left: 10 }
                  : cameraAngle === "right"
                  ? { right: 10 }
                  : { left: "50%", transform: "translateX(-50%)" }),
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "rgba(0, 0, 0, 0.65)",
                backdropFilter: "blur(4px)",
                color: "var(--b-sig)",
                border: "1px solid var(--b-sig)",
                boxShadow: "0 0 8px rgba(91, 140, 122, 0.4)",
                zIndex: 4,
                transition: "all 0.3s ease-in-out",
              }}
            >
              <Icon name="camera" size={11} />
            </div>

            {/* Stretch toast */}
            {stretchToast && (
              <div className="stretch-toast">
                <span className="stretch-toast__icon">🌿</span>
                <span>{t(`stretch:label.${stretchToast.kind}`)}</span>
                <span className="stretch-toast__bonus">
                  +{stretchToast.amount}
                </span>
              </div>
            )}

            {/* 기준 자세 다시 잡기 — 카메라 우상단 (위치 배지가 밀려나서 중첩 방지) */}
            <button
              onClick={onRecalibrate}
              title={t("monitor:camera.recalibrateTitle")}
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
              {t("monitor:camera.recalibrate")}
            </button>

            {/* 카메라 각도 변경으로 인한 실루엣 카드 내 가이드 배너 */}
            {recommendAngle && (
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  right: 10,
                  borderRadius: "10px",
                  padding: "8px 10px",
                  background: "linear-gradient(135deg, rgba(217, 119, 6, 0.95) 0%, rgba(245, 158, 11, 0.98) 100%)",
                  backgroundBlendMode: "normal",
                  backgroundAttachment: "scroll",
                  backgroundColor: "rgba(217, 119, 6, 0.95)",
                  backgroundPosition: "0% 0%",
                  backgroundRepeat: "repeat",
                  backgroundSize: "auto",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "6px",
                  zIndex: 20,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "14px", flexShrink: 0 }}>📐</span>
                  <span
                    style={{
                      fontSize: "11.5px",
                      fontWeight: 700,
                      color: "#ffffff",
                      letterSpacing: "-0.03em",
                      lineHeight: 1.2,
                      display: "inline-flex",
                      alignItems: "center",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {t("monitor:camera.angleChanged", { angle: recommendAngle === "front" ? t("monitor:angle.front") : recommendAngle === "left" ? t("monitor:angle.left") : t("monitor:angle.right") })}
                    {/* 헬프 아이콘 (?) */}
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "15px",
                        height: "15px",
                        borderRadius: "50%",
                        background: "rgba(255, 255, 255, 0.2)",
                        border: "none",
                        color: "#ffffff",
                        fontSize: "9.5px",
                        fontWeight: "bold",
                        marginLeft: "5px",
                        cursor: "help",
                        transition: "all 0.2s ease",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.35)";
                        setShowHelpTooltip(true);
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                        setShowHelpTooltip(false);
                      }}
                    >
                      ?
                    </span>
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRecalibrate();
                      setRecommendAngle(null);
                    }}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "6px",
                      background: "#ffffff",
                      color: "#d97706",
                      fontSize: "10.5px",
                      fontWeight: 800,
                      border: "none",
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                      transition: "all 0.2s ease",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "scale(1.03)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "none";
                    }}
                  >
                    {t("monitor:camera.register")}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRecommendAngle(null);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "20px",
                      height: "20px",
                      borderRadius: "4px",
                      background: "rgba(255, 255, 255, 0.15)",
                      border: "none",
                      color: "#ffffff",
                      cursor: "pointer",
                      fontSize: "10px",
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* 헬프 툴팁 오버레이 - 배너 하단에 둥둥 뜨는 글래스모피즘 상자 */}
                {showHelpTooltip && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      left: 0,
                      right: 0,
                      borderRadius: "10px",
                      padding: "14px 18px",
                      background: "rgba(15, 23, 42, 0.96)",
                      backdropFilter: "blur(20px)",
                      WebkitBackdropFilter: "blur(20px)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      boxShadow: "0 12px 36px rgba(0,0,0,0.5)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      zIndex: 30,
                      pointerEvents: "none",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontSize: "12px", fontWeight: 800, color: "#fbbf24", display: "flex", alignItems: "center", gap: "6px" }}>
                      {t("monitor:camera.helpTitle")}
                    </div>
                    <div style={{ fontSize: "11px", fontWeight: 500, color: "rgba(255, 255, 255, 0.85)", lineHeight: 1.5, letterSpacing: "-0.01em" }}>
                      {t("monitor:camera.helpBody1")}
                    </div>
                    <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#a8d4c4", lineHeight: 1.4, marginTop: "2px" }}>
                      {t("monitor:camera.helpBody2")}
                    </div>
                  </div>
                )}
              </div>
            )}
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
                    {t("monitor:card.activeViolation", { label: t(`posture:label.${primaryViolation}`) })}
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
                  {t(`coaching:tip.${primaryViolation}`)}
                </div>
                <div
                  className="b-num"
                  style={{ fontSize: 12, color: "var(--b-fg-3)" }}
                >
                  {t("monitor:card.ongoing", { duration: formatDuration(maxDurationSecs) })}
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
                    {t("monitor:card.caution", { label: t(`posture:label.${primaryViolation}`) })}
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
                  {t(`coaching:tip.${primaryViolation}`)}
                </div>
                <div
                  className="b-num"
                  style={{ fontSize: 12, color: "var(--b-fg-3)" }}
                >
                  {t("monitor:card.ongoing", { duration: formatDuration(maxDurationSecs) })}
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
                    {t("monitor:subline.good")}
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
                  {t("monitor:subline.scanning")}
                </div>
                <div
                  className="b-num"
                  style={{ fontSize: 12, color: "var(--b-fg-3)" }}
                >
                  {t("monitor:card.holding")}
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
                    {t("monitor:statusBadge.paused")}
                  </span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                  {t("monitor:headline.paused")}
                </div>
                <div style={{ fontSize: 12, color: "var(--b-fg-3)" }}>
                  {t("monitor:subline.paused")}
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
                    {t("monitor:statusBadge.away")}
                  </span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                  {t("monitor:headline.away")}
                </div>
                <div style={{ fontSize: 12, color: "var(--b-fg-3)" }}>
                  {t("monitor:subline.away")}
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
                  {t("monitor:sensitivity.title")}
                </span>
                <button
                  className="b-btn b-btn-quiet"
                  style={{ fontSize: 11, padding: "4px 8px" }}
                  onClick={onOpenSettings}
                >
                  {t("monitor:sensitivity.more")} <Icon name="chev-r" size={10} />
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
                <span style={{ width: 60 }}>{t("posture:label.forward_head")}</span>
                <span style={{ fontSize: 10, color: "var(--b-fg-4)" }}>{t("monitor:sensitivity.strict")}</span>
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
                <span style={{ fontSize: 10, color: "var(--b-fg-4)" }}>{t("monitor:sensitivity.lenient")}</span>
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
            const fmtDelta = (n: number | null) =>
              n === null ? null : (n === 0 ? "0" : n > 0 ? `+${n}` : `${n}`);
            // 위반은 적을수록 좋음 → 음수가 good. 스트레칭은 많을수록 좋음 → 양수가 good.
            const cards = [
              {
                label: t("monitor:stats.health.label"),
                value: `${todayGoodRatio.toFixed(4)}`,
                badge: {
                  text: `${todayGradeInfo.grade} ${todayGradeInfo.label}`,
                  color: todayGradeInfo.color,
                },
                delta: goodRatioDelta === null 
                  ? null 
                  : goodRatioDelta === 0 
                  ? "0.0000" 
                  : goodRatioDelta > 0 
                  ? `+${goodRatioDelta.toFixed(4)}` 
                  : `${goodRatioDelta.toFixed(4)}`,
                deltaGood: goodRatioDelta === null ? true : goodRatioDelta >= 0,
                tooltipDesc: t("monitor:stats.health.tooltip"),
                scientificGround: t("monitor:stats.health.ground"),
                extraContent: (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4, borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: 4 }}>
                    <div style={{ fontSize: 9, color: "var(--b-fg-4)", fontWeight: 700, marginBottom: 2 }}>{t("monitor:stats.criteria.title")}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                      <span style={{ color: "var(--b-sig)", fontWeight: 700 }}>{t("monitor:stats.criteria.sRange")}</span>
                      <span style={{ color: "var(--b-fg-3)" }}>{t("monitor:stats.criteria.sDesc")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                      <span style={{ color: "var(--b-sig)", fontWeight: 700 }}>{t("monitor:stats.criteria.aRange")}</span>
                      <span style={{ color: "var(--b-fg-3)" }}>{t("monitor:stats.criteria.aDesc")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                      <span style={{ color: "var(--b-fg-2)", fontWeight: 700 }}>{t("monitor:stats.criteria.bRange")}</span>
                      <span style={{ color: "var(--b-fg-3)" }}>{t("monitor:stats.criteria.bDesc")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                      <span style={{ color: "var(--b-warn)", fontWeight: 700 }}>{t("monitor:stats.criteria.cRange")}</span>
                      <span style={{ color: "var(--b-fg-3)" }}>{t("monitor:stats.criteria.cDesc")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                      <span style={{ color: "var(--b-warn)", fontWeight: 700 }}>{t("monitor:stats.criteria.dRange")}</span>
                      <span style={{ color: "var(--b-fg-3)" }}>{t("monitor:stats.criteria.dDesc")}</span>
                    </div>
                  </div>
                )
              },
              {
                label: t("monitor:stats.violations.label"),
                value: `${todayStats.violations}`,
                badge: null,
                delta: fmtDelta(deltas.violations),
                deltaGood: deltas.violations === null ? true : deltas.violations <= 0,
                tooltipDesc: t("monitor:stats.violations.tooltip"),
                scientificGround: t("monitor:stats.violations.ground"),
                extraContent: null
              },
              {
                label: t("monitor:stats.stretch.label"),
                value: `${todayStats.stretches}`,
                badge: null,
                delta: fmtDelta(deltas.stretches),
                deltaGood: deltas.stretches === null ? true : deltas.stretches >= 0,
                tooltipDesc: t("monitor:stats.stretch.tooltip"),
                scientificGround: t("monitor:stats.stretch.ground"),
                extraContent: null
              },
              {
                label: t("monitor:stats.usage.label"),
                value: formatUsageTime(activeDurationTodayCount),
                badge: null,
                delta: null,
                deltaGood: true,
                tooltipDesc: t("monitor:stats.usage.tooltip"),
                scientificGround: t("monitor:stats.usage.ground"),
                extraContent: null
              },
            ];
            return cards.map((c, i) => (
              <div
                key={i}
                onMouseEnter={() => setHoveredCardIdx(i)}
                onMouseLeave={() => setHoveredCardIdx(null)}
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "var(--b-surface)",
                  border: "1px solid var(--b-line)",
                  position: "relative",
                  cursor: "help",
                }}
              >
                {c.badge && (
                  <span
                    style={{
                      position: "absolute",
                      top: 14,
                      right: 16,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 6,
                      background: c.badge.color === "var(--b-sig)" 
                        ? "var(--b-sig-bg)" 
                        : c.badge.color === "var(--b-warn)" 
                        ? "var(--b-warn-soft)" 
                        : "rgba(255, 255, 255, 0.06)",
                      color: c.badge.color,
                      border: c.badge.color === "var(--b-sig)" 
                        ? "1px solid var(--b-sig-soft)" 
                        : c.badge.color === "var(--b-warn)" 
                        ? "1px solid var(--b-warn)" 
                        : "1px solid rgba(255, 255, 255, 0.1)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {c.badge.text}
                  </span>
                )}
                {hoveredCardIdx === i && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 8px)",
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 280,
                      background: "rgba(18, 18, 24, 0.95)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: 12,
                      padding: "12px 14px",
                      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
                      zIndex: 100,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      pointerEvents: "none",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--b-fg-1)" }}>
                      {t("monitor:stats.tooltipHeader", { label: c.label })}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--b-fg-2)", lineHeight: 1.45 }}>
                      {c.tooltipDesc}
                    </div>
                    {c.scientificGround && (
                      <div
                        style={{
                          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                          paddingTop: 6,
                          marginTop: 2,
                          fontSize: 9,
                          color: "var(--b-sig)",
                          lineHeight: 1.4,
                          fontWeight: 500,
                        }}
                      >
                        {t("monitor:stats.groundPrefix")}{c.scientificGround}
                      </div>
                    )}
                    {c.extraContent}
                  </div>
                )}
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
                    <AnimatedValue value={c.value} />
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t("monitor:report.todayPosture")}</div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--b-fg-3)",
                  marginTop: 2,
                }}
              >
                {t("monitor:report.timeTrend")}
              </div>
            </div>

            <button
              onClick={() => setDetailedReportOpen(true)}
              className="b-btn b-btn-ghost"
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: subPlan === "pro" ? "transparent" : "linear-gradient(135deg, rgba(234, 179, 8, 0.1) 0%, rgba(234, 179, 8, 0.03) 100%)",
                border: subPlan === "pro" ? "1px solid var(--b-line-2)" : "1px solid rgba(234, 179, 8, 0.35)",
                color: subPlan === "pro" ? "var(--b-fg-2)" : "var(--b-amber)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {subPlan !== "pro" && <span style={{ fontSize: 10 }}>👑</span>}
              {t("monitor:report.detailReport")}
            </button>
          </div>
          <HourlyHeatmap
            yesterdayByHour={yesterdayByHour}
            activeDurationByHour={activeDurationByHour}
            yesterdayActiveDurationByHour={yesterdayActiveDurationByHour}
            goodDurationByHour={goodDurationByHour}
          />
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              fontWeight: 700,
              color: "var(--b-fg-2)",
              marginBottom: 8,
            }}
          >
            {t("monitor:report.byType")}
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
            {cameraError && <span>{t("monitor:report.cameraError", { error: cameraError })}</span>}
            {detectorError && (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {detectorError}
                <button
                  className="b-btn b-btn-ghost"
                  onClick={detectorRetry}
                  style={{ height: 24, fontSize: 11, padding: "0 8px" }}
                >
                  {t("monitor:report.retry")}
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
          {i18n.language === "ko" ? pickSubSlogan() : t("app:taglineSub")}
        </div>
      </div>

      {/* PRO/FREE Detailed Analysis Report Modal */}
      {detailedReportOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 10, 12, 0.75)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setDetailedReportOpen(false)}
        >
          <div
            style={{
              width: 620,
              maxWidth: "95vw",
              maxHeight: "85vh",
              background: "var(--b-surface)",
              border: "1px solid var(--b-line)",
              borderRadius: 20,
              boxShadow: "var(--b-shadow-modal)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--b-line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>👑</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "var(--b-fg-1)" }}>
                  {subPlan === "pro" ? t("monitor:report.proTitle") : t("monitor:report.proTitleTrial")}
                </span>
              </div>
              <button
                onClick={() => setDetailedReportOpen(false)}
                className="b-icon-btn"
                style={{ width: 28, height: 28 }}
              >
                <Icon name="x" size={13} />
              </button>
            </div>

            {true ? ( // 임시 잠금 해제 (무료 플랜에서도 체험 가능)
              /* PRO User Contents */
              <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 20 }} className="b-scroll">
                
                {/* Section 1: AI Clinical Advice */}
                <div
                  style={{
                    padding: "16px 20px",
                    borderRadius: 14,
                    background: "linear-gradient(135deg, rgba(91, 140, 122, 0.1) 0%, rgba(91, 140, 122, 0.02) 100%)",
                    border: "1px solid rgba(91, 140, 122, 0.25)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 14 }}>🩺</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--b-sig)" }}>{t("monitor:report.aiClinical")}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--b-fg-2)", lineHeight: 1.6 }}>
                    {(() => {
                      const eventsToday = loadEvents().filter(e => e.startedAt >= startOfToday());
                      const counts: Record<string, number> = {};
                      eventsToday.forEach(e => {
                        counts[e.type] = (counts[e.type] || 0) + 1;
                      });
                      let mostFrequentType = "";
                      let maxCount = 0;
                      Object.entries(counts).forEach(([k, v]) => {
                        if (v > maxCount) {
                          maxCount = v;
                          mostFrequentType = k;
                        }
                      });

                      if (maxCount === 0) {
                        return t("monitor:aiGuide.none");
                      }

                      if (mostFrequentType === "forward_head" || mostFrequentType === "monitor_too_close") {
                        return t("monitor:aiGuide.forwardHead");
                      }
                      if (mostFrequentType === "slouching") {
                        return t("monitor:aiGuide.slouching");
                      }
                      if (mostFrequentType === "chin_resting") {
                        return t("monitor:aiGuide.chinResting");
                      }
                      return t("monitor:aiGuide.generic", {
                        label:
                          POSTURE_TYPES.includes(mostFrequentType as PostureType)
                            ? t(`posture:label.${mostFrequentType}`)
                            : mostFrequentType,
                      });
                    })()}
                  </div>
                </div>

                {/* Section 2: 숫자로 보는 자세 훈련 성과 및 개선 지표 */}
                {(() => {
                  const events = loadEvents();
                  const startToday = startOfToday();
                  const startYesterday = startToday - 24 * 60 * 60 * 1000;

                  const todayEvts = events.filter(e => e.startedAt >= startToday);
                  const yesterdayEvts = events.filter(e => e.startedAt >= startYesterday && e.startedAt < startToday);

                  // 평균 나쁜 자세 교정 반응 속도 (초 단위)
                  const todayAvgSecs = todayEvts.length > 0
                    ? todayEvts.reduce((sum, e) => sum + e.durationSecs, 0) / todayEvts.length
                    : 0;
                  const yesterdayAvgSecs = yesterdayEvts.length > 0
                    ? yesterdayEvts.reduce((sum, e) => sum + e.durationSecs, 0) / yesterdayEvts.length
                    : 0;

                  // 반응 속도 개선폭 (초 단위 단축이므로 어제 평균 - 오늘 평균이 양수일 때 개선!)
                  const speedDelta = yesterdayAvgSecs - todayAvgSecs;

                  // 바른 자세 유효 누적 시간 (분 단위)
                  const goodTodayMins = Math.round(goodDurationTodayCount / 60);
                  const goodYesterdayMins = Math.round(Number(localStorage.getItem("good_duration_yesterday") || "0") / 60);
                  const goodMinsDelta = goodTodayMins - goodYesterdayMins;

                  const formatMins = (mins: number) => {
                    if (mins < 60) return t("monitor:report.mins", { m: mins });
                    const h = Math.floor(mins / 60);
                    const m = mins % 60;
                    return m === 0 ? t("monitor:report.hours", { h }) : t("monitor:report.hoursMins", { h, m });
                  };

                  const formatDeltaMins = (mins: number) => {
                    if (mins === 0) return "";
                    const sign = mins > 0 ? "+" : "-";
                    const absMins = Math.abs(mins);
                    if (absMins < 60) return `${sign}${t("monitor:report.mins", { m: absMins })}`;
                    const h = Math.floor(absMins / 60);
                    const m = absMins % 60;
                    const timeStr = m === 0 ? t("monitor:report.hours", { h }) : t("monitor:report.hoursMins", { h, m });
                    return `${sign}${timeStr}`;
                  };

                  // 좋은 자세 비율 변동 계산
                  const todayActiveSecs = activeDurationTodayCount;
                  const todayGoodSecs = goodDurationTodayCount;
                  const todayGoodRatioLocal = todayActiveSecs > 0 ? (todayGoodSecs / todayActiveSecs) * 100 : 100;

                  const yesterdayActiveSecsLocal = Number(localStorage.getItem("active_duration_yesterday") || "0");
                  const yesterdayGoodSecsLocal = Number(localStorage.getItem("good_duration_yesterday") || "0");
                  const yesterdayGoodRatioLocal = yesterdayActiveSecsLocal > 0 ? (yesterdayGoodSecsLocal / yesterdayActiveSecsLocal) * 100 : 100;

                  const goodRatioDeltaLocal = todayGoodRatioLocal - yesterdayGoodRatioLocal;

                  const todayGradeLocal = getPostureGrade(todayGoodRatioLocal);

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-2)" }}>{t("monitor:report.perfTitle")}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        
                        {/* 1. 자세 개선 종합 지수 */}
                        <div
                          style={{
                            padding: "14px 16px",
                            borderRadius: 12,
                            background: "var(--b-surface-2)",
                            border: "1px solid var(--b-line)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 11, color: "var(--b-fg-3)", fontWeight: 500 }}>{t("monitor:report.improveIndex")}</span>
                          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--b-fg-1)", display: "flex", alignItems: "baseline", gap: 4 }}>
                            {goodRatioDeltaLocal >= 0 ? (
                              <>
                                <span style={{ color: "var(--b-sig)" }}>+{goodRatioDeltaLocal.toFixed(1)}%</span>
                                <span style={{ fontSize: 9, color: "var(--b-sig)", fontWeight: 700 }}>{t("monitor:report.up")}</span>
                              </>
                            ) : (
                              <>
                                <span style={{ color: "var(--b-warn)" }}>{goodRatioDeltaLocal.toFixed(1)}%</span>
                                <span style={{ fontSize: 9, color: "var(--b-warn)", fontWeight: 700 }}>{t("monitor:report.down")}</span>
                              </>
                            )}
                          </div>
                          <span style={{ fontSize: 9.5, color: "var(--b-fg-4)", lineHeight: 1.4 }}>
                            {goodRatioDeltaLocal >= 0 
                              ? t("monitor:report.gradeImproved", { grade: todayGradeLocal.grade, label: todayGradeLocal.label })
                              : t("monitor:report.gradeKeep", { grade: todayGradeLocal.grade, label: todayGradeLocal.label })}
                          </span>
                        </div>
 
                        {/* 2. 자가 교정 피드백 반응 시간 */}
                        <div
                          style={{
                            padding: "14px 16px",
                            borderRadius: 12,
                            background: "var(--b-surface-2)",
                            border: "1px solid var(--b-line)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 11, color: "var(--b-fg-3)", fontWeight: 500 }}>{t("monitor:report.reactionSpeed")}</span>
                          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--b-fg-1)", display: "flex", alignItems: "baseline", gap: 4 }}>
                            {todayAvgSecs > 0 ? (
                              <>
                                <span>{t("monitor:report.secOnly", { v: todayAvgSecs.toFixed(1) })}</span>
                                {yesterdayAvgSecs > 0 && speedDelta !== 0 && (
                                  <span style={{ fontSize: 9, color: speedDelta > 0 ? "var(--b-sig)" : "var(--b-warn)", fontWeight: 700 }}>
                                    ({speedDelta > 0 ? t("monitor:report.faster", { v: speedDelta.toFixed(1) }) : t("monitor:report.slower", { v: Math.abs(speedDelta).toFixed(1) })})
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ fontSize: 12.5, color: "var(--b-fg-3)", fontWeight: 700 }}>{t("monitor:report.noViolations")}</span>
                            )}
                          </div>
                          <span style={{ fontSize: 9.5, color: "var(--b-fg-4)", lineHeight: 1.4 }}>
                            {speedDelta > 0 ? t("monitor:report.reactionFast") : t("monitor:report.reactionSlow")}
                          </span>
                        </div>
 
                        {/* 3. 바른 자세 누적 유효 시간 */}
                        <div
                          style={{
                            padding: "14px 16px",
                            borderRadius: 12,
                            background: "var(--b-surface-2)",
                            border: "1px solid var(--b-line)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 11, color: "var(--b-fg-3)", fontWeight: 500 }}>{t("monitor:report.goodTime")}</span>
                          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--b-fg-1)", display: "flex", alignItems: "baseline", gap: 4 }}>
                            <span>{formatMins(goodTodayMins)}</span>
                            {goodMinsDelta !== 0 && (
                              <span style={{ fontSize: 9, color: goodMinsDelta > 0 ? "var(--b-sig)" : "var(--b-warn)", fontWeight: 700 }}>
                                ({formatDeltaMins(goodMinsDelta)})
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 9.5, color: "var(--b-fg-4)", lineHeight: 1.4 }}>
                            {goodMinsDelta > 0 ? t("monitor:report.goodTimeUp") : t("monitor:report.goodTimeKeep")}
                          </span>
                        </div>
 
                      </div>
 
                      {/* 🔬 과학적 자세 등급 산정 및 척추역학 근거 */}
                      <div
                        style={{
                          padding: "12px 16px",
                          borderRadius: 12,
                          background: "rgba(255, 255, 255, 0.015)",
                          border: "1px dashed var(--b-line)",
                          fontSize: 10.5,
                          color: "var(--b-fg-3)",
                          lineHeight: 1.55,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: "var(--b-fg-2)", marginBottom: 5 }}>
                          <span>🔬</span>
                          <span>{t("monitor:report.basisTitle")}</span>
                        </div>
                        <div dangerouslySetInnerHTML={{ __html: t("monitor:report.basisBody") }} />
                      </div>
                    </div>
                  );
                })()}

                {/* Section 2.5: 자세 건강 점수 시간대별 추이 SVG 그래프 */}
                <div
                  style={{
                    padding: "16px 20px",
                    borderRadius: 14,
                    background: "var(--b-surface-2)",
                    border: "1px solid var(--b-line)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-2)" }}>{t("monitor:report.trendTitle")}</div>
                    <div style={{ fontSize: 11, color: "var(--b-fg-3)" }}>{t("monitor:report.unitPoints")}</div>
                  </div>
                  <div style={{ position: "relative", width: "100%", height: 130 }}>
                    {(() => {
                      const eventsToday = loadEvents().filter(e => e.startedAt >= startOfToday());
                      const hourlyViolations = new Array(24).fill(0);
                      eventsToday.forEach(e => {
                        const hr = new Date(e.startedAt).getHours();
                        if (hr >= 0 && hr < 24) {
                          hourlyViolations[hr] += 1;
                        }
                      });

                      const scores = (activeDurationByHour as number[]).map((activeSecs: number, hr: number) => {
                        if (activeSecs === 0) return 100;
                        const goodSecs = goodDurationByHour[hr] || 0;
                        const vCount = hourlyViolations[hr] || 0;

                        let badSecs = 0;
                        if (vCount === 0) {
                          // 위반이 전혀 발생하지 않은 깨끗한 시간대는 나쁜 자세가 0초입니다.
                          badSecs = 0;
                        } else if (goodSecs === 0 && vCount > 0) {
                          // 과도기/비동기 보정: good_duration_by_hour 누적 시작일 대비 과거 데이터 등
                          badSecs = Math.min(activeSecs, vCount * 18);
                        } else {
                          // 기본 물리 시간 계산
                          const rawBadSecs = Math.max(0, activeSecs - goodSecs);
                          // 스마트 비동기 가드: 1회당 물리적 최대 유지 한계선(90초)을 초과하는 왜곡 검출 시 합리값으로 보정
                          const maxPossibleBadSecs = vCount * 90;
                          if (rawBadSecs > maxPossibleBadSecs) {
                            badSecs = Math.min(activeSecs, vCount * 18);
                          } else {
                            badSecs = rawBadSecs;
                          }
                        }

                        if (badSecs > activeSecs) {
                          badSecs = activeSecs;
                        }

                        const ratio = badSecs / activeSecs;
                        return Math.max(30, 100 - Math.round(ratio * 100));
                      });

                      // 📈 동적 Y축 스케일링 엔진
                      const validScores = scores.filter((_, hr) => (activeDurationByHour[hr] || 0) > 0);
                      const minScore = validScores.length > 0 ? Math.min(...validScores) : 70;
                      // 10단위 내림 버퍼 적용 (최하 30점 제한)
                      const minY = Math.max(30, Math.floor((minScore - 5) / 10) * 10);
                      const maxY = 100;
                      const ySpan = maxY - minY;

                      const width = 540;
                      const height = 110;
                      const paddingLeft = 35;
                      const paddingRight = 15;
                      const paddingTop = 10;
                      const paddingBottom = 20;

                      const chartWidth = width - paddingLeft - paddingRight;
                      const chartHeight = height - paddingTop - paddingBottom;

                      const points = (scores as number[]).map((s: number, idx: number) => {
                        const x = paddingLeft + (idx / 23) * chartWidth;
                        // 동적 Y스케일 좌표 변환
                        const y = paddingTop + chartHeight - ((s - minY) / ySpan) * chartHeight;
                        return { x, y, score: s, hour: idx };
                      });

                      const linePath = (points as { x: number; y: number; score: number; hour: number; }[]).map((p, idx: number) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                      const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(paddingTop + chartHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(paddingTop + chartHeight).toFixed(1)} Z`;

                      return (
                        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "100%", overflow: "visible" }}>
                          <defs>
                            <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--b-sig)" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="var(--b-sig)" stopOpacity="0.0" />
                            </linearGradient>
                            <filter id="scoreLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="var(--b-sig)" floodOpacity="0.3" />
                            </filter>
                          </defs>

                          {/* Level Guides (동적 등급 경계 격자) */}
                          {[
                            { val: 95, color: "var(--b-sig)" },
                            { val: 90, color: "var(--b-sig)" },
                            { val: 80, color: "var(--b-fg-3)" },
                            { val: 70, color: "var(--b-warn)" },
                            { val: 60, color: "var(--b-warn)" },
                            { val: 50, color: "var(--b-warn)" },
                            { val: 40, color: "var(--b-warn)" },
                            { val: 30, color: "var(--b-warn)" },
                          ]
                            .filter((lvl) => lvl.val >= minY)
                            .map((lvl: { val: number; color: string }) => {
                              const y = paddingTop + chartHeight - ((lvl.val - minY) / ySpan) * chartHeight;
                            return (
                              <g key={lvl.val}>
                                <line
                                  x1={paddingLeft}
                                  y1={y}
                                  x2={width - paddingRight}
                                  y2={y}
                                  stroke="var(--b-line-2)"
                                  strokeWidth="0.8"
                                  strokeDasharray="3 3"
                                />
                                <text
                                  x={paddingLeft - 6}
                                  y={y + 3}
                                  fill={lvl.color}
                                  fontSize="8"
                                  fontWeight="bold"
                                  textAnchor="end"
                                  fontFamily="ui-monospace, monospace"
                                >
                                  {t("monitor:report.points", { n: lvl.val })}
                                </text>
                              </g>
                            );
                          })}

                          {/* Gradient Fill Under Line */}
                          <path d={areaPath} fill="url(#scoreAreaGrad)" />

                          {/* Line Path */}
                          <path
                            d={linePath}
                            fill="none"
                            stroke="var(--b-sig)"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            filter="url(#scoreLineGlow)"
                          />

                          {/* Dots & Score Labels */}
                          {(points as { x: number; y: number; score: number; hour: number; }[]).map((p, idx: number) => {
                            const hasDeduction = p.score < 100;
                            return (
                              <g key={idx}>
                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r={hasDeduction ? "4" : "2.5"}
                                  fill={hasDeduction ? "var(--b-warn)" : "var(--b-sig)"}
                                  stroke="var(--b-surface)"
                                  strokeWidth="1.5"
                                />
                                {hasDeduction && (
                                  <text
                                    x={p.x}
                                    y={p.y - 8}
                                    fill="var(--b-warn)"
                                    fontSize="8.5"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                  >
                                    {t("monitor:report.points", { n: p.score })}
                                  </text>
                                )}
                                {/* 대형 투명 호버 영역 */}
                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r="12"
                                  fill="transparent"
                                  cursor="pointer"
                                  onMouseEnter={() => {
                                    const activeSecs = activeDurationByHour[p.hour] || 0;
                                    const goodSecs = goodDurationByHour[p.hour] || 0;
                                    const vCount = hourlyViolations[p.hour] || 0;

                                    let badSecs = 0;
                                    if (vCount === 0) {
                                      // 위반이 전혀 발생하지 않은 깨끗한 시간대는 나쁜 자세가 0초입니다.
                                      badSecs = 0;
                                    } else if (goodSecs === 0 && vCount > 0) {
                                      // 과도기/비동기 보정: good_duration_by_hour 누적 시작일 대비 과거 데이터 등
                                      badSecs = Math.min(activeSecs, vCount * 18);
                                    } else {
                                      // 기본 물리 시간 계산
                                      const rawBadSecs = Math.max(0, activeSecs - goodSecs);
                                      // 스마트 비동기 가드: 1회당 물리적 최대 유지 한계선(90초)을 초과하는 왜곡 검출 시 합리값으로 보정
                                      const maxPossibleBadSecs = vCount * 90;
                                      if (rawBadSecs > maxPossibleBadSecs) {
                                        badSecs = Math.min(activeSecs, vCount * 18);
                                      } else {
                                        badSecs = rawBadSecs;
                                      }
                                    }

                                    if (badSecs > activeSecs) {
                                      badSecs = activeSecs;
                                    }

                                    setHoveredLinePoint({
                                      x: p.x,
                                      y: p.y,
                                      score: p.score,
                                      hour: p.hour,
                                      violations: vCount,
                                      activeSecs,
                                      badSecs,
                                    });
                                  }}
                                  onMouseLeave={() => setHoveredLinePoint(null)}
                                />
                              </g>
                            );
                          })}

                          {/* X-Axis Labels */}
                          {(points as { x: number; y: number; score: number; hour: number; }[]).filter(p => p.hour % 4 === 0).map((p, idx: number) => (
                            <text
                              key={idx}
                              x={p.x}
                              y={height}
                              fill="var(--b-fg-4)"
                              fontSize="9"
                              textAnchor="middle"
                            >
                              {String(p.hour).padStart(2, "0")}:00
                            </text>
                          ))}
                        </svg>
                      );
                    })()}

                    {/* 🌟 꺾은선 마우스 호버 시 글자가 크게 표출되는 프리미엄 툴팁 */}
                    {hoveredLinePoint && (
                      <div
                        style={{
                          position: "absolute",
                          left: hoveredLinePoint.x,
                          top: hoveredLinePoint.y - 12,
                          transform: "translateX(-50%) translateY(-100%)",
                          background: "rgba(20, 20, 26, 0.96)",
                          backdropFilter: "blur(12px)",
                          WebkitBackdropFilter: "blur(12px)",
                          border: "1px solid rgba(255, 255, 255, 0.16)",
                          borderRadius: 12,
                          padding: "12px 16px",
                          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
                          zIndex: 10000,
                          pointerEvents: "none",
                          whiteSpace: "nowrap",
                          display: "flex",
                          flexDirection: "column",
                          gap: 5,
                          animation: "b-fade-in 0.15s ease",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-1)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: 4, marginBottom: 2 }}>
                          ⏰ {hoveredLinePoint.hour}:00 ~ {hoveredLinePoint.hour + 1}:00
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--b-fg-2)", display: "flex", justifyContent: "space-between", gap: 15 }}>
                          <span>{t("monitor:report.tooltipScore")}</span>
                          <strong style={{ color: "var(--b-sig)", fontSize: 13 }}>
                            {t("monitor:report.points", { n: hoveredLinePoint.score })}
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--b-fg-3)", marginLeft: 5 }}>
                              ({(() => {
                                const s = hoveredLinePoint.score;
                                if (s >= 95) return t("monitor:report.gradeLabel", { grade: "S" });
                                if (s >= 90) return t("monitor:report.gradeLabel", { grade: "A" });
                                if (s >= 80) return t("monitor:report.gradeLabel", { grade: "B" });
                                if (s >= 70) return t("monitor:report.gradeLabel", { grade: "C" });
                                return t("monitor:report.gradeLabel", { grade: "D" });
                              })()})
                            </span>
                          </strong>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--b-fg-3)", display: "flex", justifyContent: "space-between", gap: 15 }}>
                          <span>{t("monitor:report.sitTime")}</span>
                          <span>{t("monitor:report.mins", { m: Math.round(hoveredLinePoint.activeSecs / 60) })}</span>
                        </div>
                        {hoveredLinePoint.badSecs !== undefined && (
                          <div style={{ fontSize: 11.5, color: "var(--b-fg-3)", display: "flex", justifyContent: "space-between", gap: 15 }}>
                            <span>{t("monitor:report.badPostureTime")}</span>
                            <span style={{ color: hoveredLinePoint.badSecs > 0 ? "var(--b-warn)" : "inherit" }}>
                              {(() => {
                                const secs = hoveredLinePoint.badSecs;
                                if (secs === 0) return t("monitor:secs", { s: 0 });
                                if (secs < 60) return t("monitor:secs", { s: secs });
                                const m = Math.floor(secs / 60);
                                const s = secs % 60;
                                return s > 0 ? t("monitor:minsSecs", { m, s }) : t("monitor:report.mins", { m });
                              })()}
                            </span>
                          </div>
                        )}
                        {hoveredLinePoint.badSecs !== undefined && hoveredLinePoint.activeSecs > 0 && (
                          <div style={{ fontSize: 11.5, color: "var(--b-fg-3)", display: "flex", justifyContent: "space-between", gap: 15 }}>
                            <span>{t("monitor:report.violationRatio")}</span>
                            <span style={{ color: hoveredLinePoint.badSecs > 0 ? "var(--b-warn)" : "inherit" }}>
                              {(hoveredLinePoint.badSecs / hoveredLinePoint.activeSecs * 100).toFixed(1)}%
                            </span>
                          </div>
                        )}
                        <div style={{ fontSize: 11.5, color: "var(--b-fg-3)", display: "flex", justifyContent: "space-between", gap: 15 }}>
                          <span>{t("monitor:report.violationCount")}</span>
                          <span>{t("monitor:report.times", { n: hoveredLinePoint.violations })}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 📊 구간별 자세 등급 척추역학 범례 가이드 배너 */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                      paddingTop: 12,
                      marginTop: 6,
                      borderTop: "1px solid var(--b-line)",
                    }}
                  >
                    {[
                      { range: t("monitor:report.legend.sRange"), grade: "S", label: t("monitor:grade.S.label"), color: "var(--b-sig)", bg: "rgba(46, 163, 141, 0.08)", desc: t("monitor:report.legend.sDesc") },
                      { range: t("monitor:report.legend.aRange"), grade: "A", label: t("monitor:grade.A.label"), color: "var(--b-sig)", bg: "rgba(46, 163, 141, 0.04)", desc: t("monitor:report.legend.aDesc") },
                      { range: t("monitor:report.legend.bRange"), grade: "B", label: t("monitor:grade.B.label"), color: "var(--b-fg-2)", bg: "rgba(255, 255, 255, 0.03)", desc: t("monitor:report.legend.bDesc") },
                      { range: t("monitor:report.legend.cRange"), grade: "C", label: t("monitor:grade.C.label"), color: "var(--b-warn)", bg: "rgba(234, 88, 12, 0.06)", desc: t("monitor:report.legend.cDesc") },
                      { range: t("monitor:report.legend.dRange"), grade: "D", label: t("monitor:grade.D.label"), color: "var(--b-warn)", bg: "rgba(239, 68, 68, 0.08)", desc: t("monitor:report.legend.dDesc") },
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 2,
                          fontSize: 10,
                          color: "var(--b-fg-3)",
                          background: item.bg,
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: `1px solid ${item.color}18`,
                          flex: 1,
                          minWidth: 80,
                          textAlign: "center",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 3, fontWeight: 800, color: item.color }}>
                          <span>{t("monitor:report.gradeLabel", { grade: item.grade })}</span>
                          <span style={{ fontSize: 9, fontWeight: 700 }}>({item.label})</span>
                        </div>
                        <div style={{ fontSize: 8.5, color: "var(--b-fg-4)", fontWeight: 500 }}>{item.range}</div>
                        <div style={{ fontSize: 8, color: item.color, opacity: 0.9, fontWeight: 600 }}>{item.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 2.8: 12개월 전주기 일별 자세 건강 분포 그리드 */}
                <div
                  data-calendar-card
                  style={{
                    padding: "16px 20px",
                    borderRadius: 14,
                    background: "var(--b-surface-2)",
                    border: "1px solid var(--b-line)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-2)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>📅</span>
                      <span>{t("monitor:report.yearCompare")}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--b-fg-3)" }}>
                      {t("monitor:report.monthDayDist")}
                    </div>
                  </div>

                  {/* Grid Container */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, overflowX: "auto", paddingBottom: 6 }} className="b-scroll">
                    {/* Header Days Labels */}
                    <div style={{ display: "flex", alignItems: "center", paddingLeft: 40, marginBottom: 2 }}>
                      {Array.from({ length: 31 }).map((_, colIdx) => {
                        const day = colIdx + 1;
                        const showLabel = day === 1 || day === 5 || day === 10 || day === 15 || day === 20 || day === 25 || day === 30 || day === 31;
                        return (
                          <div
                            key={colIdx}
                            style={{
                              width: 13,
                              textAlign: "center",
                              fontSize: 8,
                              fontWeight: 700,
                              color: "var(--b-fg-4)",
                              visibility: showLabel ? "visible" : "hidden",
                            }}
                          >
                            {day}
                          </div>
                        );
                      })}
                    </div>

                    {/* 12 Months Rows */}
                    {(() => {
                      const months = Array.from({ length: 12 }).map((_, i) => i + 1);
                      const currentYear = new Date().getFullYear();
                      
                      // 실제 로컬 스토리지 역사 DB 로드
                      let history: Record<string, { r: number; v: number; s: number; a: number }> = {};
                      try {
                        history = JSON.parse(localStorage.getItem("barosit_daily_history") || "{}");
                      } catch (e) {
                        /* noop */
                      }

                      return (
                        <div style={{ position: "relative" }}>
                          {months.map((month) => {
                            return (
                              <div key={month} style={{ display: "flex", alignItems: "center", gap: 0, height: 13 }}>
                                {/* Month Label */}
                                <div style={{ width: 40, fontSize: 9.5, fontWeight: 700, color: "var(--b-fg-3)" }}>
                                  {t("monitor:report.monthLabel", { m: month })}
                                </div>

                                {/* 31 Days Dots */}
                                {Array.from({ length: 31 }).map((_, dayIdx) => {
                                  const day = dayIdx + 1;
                                  
                                  // 유효하지 않은 일자 예외 처리 (예: 2월 30,31일 등)
                                  const maxDays = new Date(currentYear, month, 0).getDate();
                                  if (day > maxDays) {
                                    return (
                                      <div
                                        key={dayIdx}
                                        style={{
                                          width: 13,
                                          height: 13,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                        }}
                                      />
                                    );
                                  }

                                  // 날짜 문자열
                                  const dateStr = `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                  
                                  // 실제 데이터 연동 (과거 가짜 난수 완전 제거)
                                  let ratio = 0;
                                  let isToday = false;
                                  let hasData = false;
                                  
                                  // 오늘 날짜인지 체크
                                  const todayDateObj = new Date();
                                  if (todayDateObj.getFullYear() === currentYear && (todayDateObj.getMonth() + 1) === month && todayDateObj.getDate() === day) {
                                    isToday = true;
                                    const todayActiveSecs = activeDurationTodayCount;
                                    if (todayActiveSecs > 0) {
                                      hasData = true;
                                      const todayGoodSecs = goodDurationTodayCount;
                                      ratio = Math.round((todayGoodSecs / todayActiveSecs) * 100);
                                    }
                                  } else if (history[dateStr]) {
                                    // 역사 저장소에 실제 기록이 있는 경우
                                    hasData = true;
                                    ratio = history[dateStr].r;
                                  }

                                  const cellGradeInfo = hasData ? getPostureGrade(ratio) : null;
                                  
                                  // 호버 시 정보 바인딩 (이벤트 객체를 통해 상대 좌표 도출)
                                  const handleMouseEnter = (e: React.MouseEvent) => {
                                    if (!hasData || !cellGradeInfo) return;
                                    
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const parentDom = e.currentTarget.closest("[data-calendar-card]");
                                    const parentRect = parentDom ? parentDom.getBoundingClientRect() : null;
                                    
                                    const x = rect.left - (parentRect ? parentRect.left : 0) + rect.width / 2;
                                    const y = rect.top - (parentRect ? parentRect.top : 0);

                                    setHoveredCell({
                                      month,
                                      day,
                                      ratio,
                                      grade: cellGradeInfo.grade,
                                      info: cellGradeInfo,
                                      x,
                                      y
                                    });
                                  };

                                  const handleMouseLeave = () => {
                                    setHoveredCell(null);
                                  };

                                  return (
                                    <div
                                      key={dayIdx}
                                      onMouseEnter={hasData ? handleMouseEnter : undefined}
                                      onMouseLeave={hasData ? handleMouseLeave : undefined}
                                      style={{
                                        width: 13,
                                        height: 13,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        cursor: hasData ? "pointer" : "default",
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: hasData ? (isToday ? 9 : 8) : 5,
                                          height: hasData ? (isToday ? 9 : 8) : 5,
                                          borderRadius: "50%",
                                          background: hasData && cellGradeInfo ? cellGradeInfo.color : "var(--b-line-2)",
                                          border: hasData && isToday ? "2px solid #ffffff" : "none",
                                          opacity: hasData ? (ratio >= 80 ? 0.95 : 0.7) : 0.6,
                                          boxShadow: hasData && isToday ? "0 0 6px #ffffff" : "none",
                                          transition: "transform 0.15s ease",
                                        }}
                                        className={hasData ? "b-dot" : undefined}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Heatmap Legend */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                      paddingTop: 8,
                      fontSize: 9.5,
                      color: "var(--b-fg-3)",
                    }}
                  >
                    <span>{t("monitor:report.legendTitle")}</span>
                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--b-sig)" }} />
                        <span>{t("monitor:report.legendSA")}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--b-fg-1)" }} />
                        <span>{t("monitor:report.legendB")}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--b-warn)", opacity: 0.7 }} />
                        <span>{t("monitor:report.legendC")}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--b-warn)" }} />
                        <span>{t("monitor:report.legendD")}</span>
                      </div>
                    </div>
                  </div>

                  {/* 🚨 스크롤 밖에서 잘리지 않는 Hover Tooltip Render */}
                  {hoveredCell && (
                    <div
                      style={{
                        position: "absolute",
                        left: hoveredCell.x,
                        top: hoveredCell.y,
                        transform: "translateX(-50%) translateY(-100%) translateY(-8px)",
                        width: 220,
                        background: "var(--b-elev)",
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                        border: "1px solid var(--b-line-2)",
                        borderRadius: 10,
                        padding: "10px 12px",
                        boxShadow: "var(--b-shadow-elev)",
                        zIndex: 1000,
                        pointerEvents: "none",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        animation: "b-fade-in 0.1s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--b-line)", paddingBottom: 4, marginBottom: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--b-fg-1)" }}>
                          {t("monitor:report.cellAnalysis", { m: hoveredCell.month, d: hoveredCell.day })}
                        </span>
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: hoveredCell.info.color }}>
                          {t("monitor:report.cellGrade", { grade: hoveredCell.grade, label: hoveredCell.info.label })}
                        </span>
                      </div>
                      <div style={{ fontSize: 9.5, color: "var(--b-fg-2)", display: "flex", justifyContent: "space-between" }}>
                        <span>{t("monitor:report.tooltipScore")}</span>
                        <strong style={{ color: "var(--b-fg-1)" }}>{t("monitor:report.points", { n: hoveredCell.ratio })}</strong>
                      </div>
                      <div style={{ fontSize: 8.5, color: "var(--b-fg-3)", lineHeight: 1.35, marginTop: 2 }}>
                        💡 {hoveredCell.info.desc}
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 3: 일별 자세 위반 트렌드 잔디(Heatmap) 매트릭스 & 아코디언 타임라인 */}
                <div style={{ position: "relative" }}>
                  {/* 날짜 선택 컨트롤러 */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 14,
                      background: "var(--b-surface)",
                      border: "1px solid var(--b-line)",
                      borderRadius: 12,
                      padding: "8px 16px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--b-fg-1)" }}>
                        {t("monitor:report.pickDate")}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button
                        onClick={() => {
                          const d = new Date(selectedDate);
                          d.setDate(d.getDate() - 1);
                          setSelectedDate(d);
                        }}
                        style={{
                          background: "var(--b-surface-2)",
                          color: "var(--b-fg-2)",
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: 6,
                          cursor: "pointer",
                          border: "1px solid var(--b-line)",
                        }}
                      >
                        {t("monitor:report.prevDay")}
                      </button>
                      <span
                        className="calendar-toggle-btn"
                        onClick={() => {
                          setCalendarOpen(!calendarOpen);
                          setCalendarNavDate(new Date(selectedDate));
                        }}
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--b-fg-1)",
                          cursor: "pointer",
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: calendarOpen ? "var(--b-surface-3)" : "transparent",
                          border: "1px dashed var(--b-line)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          userSelect: "none",
                          transition: "all 0.15s ease-in-out",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--b-surface-2)";
                          e.currentTarget.style.border = "1px solid var(--b-line)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = calendarOpen ? "var(--b-surface-3)" : "transparent";
                          e.currentTarget.style.border = calendarOpen ? "1px solid var(--b-line)" : "1px dashed var(--b-line)";
                        }}
                      >
                        {(() => {
                          const yyyy = selectedDate.getFullYear();
                          const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
                          const dd = String(selectedDate.getDate()).padStart(2, "0");
                          const dayNames = t("monitor:report.weekdays").split(",");
                          const dayName = dayNames[selectedDate.getDay()];
                          const today = new Date();
                          const isToday = today.getFullYear() === selectedDate.getFullYear() &&
                            today.getMonth() === selectedDate.getMonth() &&
                            today.getDate() === selectedDate.getDate();
                          return t("monitor:report.dateLabel", {
                            date: `${yyyy}-${mm}-${dd}`,
                            day: dayName,
                            suffix: isToday ? t("monitor:report.todaySuffix") : "",
                          });
                        })()}
                      </span>
                      <button
                        onClick={() => {
                          const d = new Date(selectedDate);
                          d.setDate(d.getDate() + 1);
                          const today = new Date();
                          today.setHours(23, 59, 59, 999);
                          if (d.getTime() > today.getTime()) return;
                          setSelectedDate(d);
                        }}
                        disabled={(() => {
                          const today = new Date();
                          return today.getFullYear() === selectedDate.getFullYear() &&
                            today.getMonth() === selectedDate.getMonth() &&
                            today.getDate() === selectedDate.getDate();
                        })()}
                        style={{
                          background: "var(--b-surface-2)",
                          color: "var(--b-fg-2)",
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: 6,
                          cursor: (() => {
                            const today = new Date();
                            const isToday = today.getFullYear() === selectedDate.getFullYear() &&
                              today.getMonth() === selectedDate.getMonth() &&
                              today.getDate() === selectedDate.getDate();
                            return isToday ? "not-allowed" : "pointer";
                          })(),
                          opacity: (() => {
                            const today = new Date();
                            const isToday = today.getFullYear() === selectedDate.getFullYear() &&
                              today.getMonth() === selectedDate.getMonth() &&
                              today.getDate() === selectedDate.getDate();
                            return isToday ? 0.4 : 1;
                          })(),
                          border: "1px solid var(--b-line)",
                        }}
                      >
                        {t("monitor:report.nextDay")}
                      </button>
                    </div>
                  </div>

                  {/* 미니 달력 팝오버 컴포넌트 */}
                  {calendarOpen && (
                    <div
                      className="calendar-popover"
                      style={{
                        position: "absolute",
                        top: 48,
                        right: 16,
                        zIndex: 9000,
                        width: 280,
                        background: "rgba(15, 17, 19, 0.85)",
                        backdropFilter: "blur(16px)",
                        WebkitBackdropFilter: "blur(16px)",
                        border: "1px solid var(--b-line)",
                        borderRadius: 16,
                        padding: 16,
                        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        animation: "fadeIn 0.2s ease-out",
                      }}
                    >
                      {/* 달력 헤더 */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          paddingBottom: 8,
                          borderBottom: "1px solid var(--b-line)",
                        }}
                      >
                        <button
                          onClick={() => {
                            const d = new Date(calendarNavDate);
                            d.setMonth(d.getMonth() - 1);
                            setCalendarNavDate(d);
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--b-fg-2)",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: "bold",
                            padding: 4,
                          }}
                        >
                          ◀
                        </button>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--b-fg-1)" }}>
                          {t("monitor:report.calYearMonth", { y: calendarNavDate.getFullYear(), m: calendarNavDate.getMonth() + 1 })}
                        </span>
                        <button
                          onClick={() => {
                            const d = new Date(calendarNavDate);
                            d.setMonth(d.getMonth() + 1);
                            const today = new Date();
                            if (d.getFullYear() > today.getFullYear() || 
                                (d.getFullYear() === today.getFullYear() && d.getMonth() > today.getMonth())) {
                              return;
                            }
                            setCalendarNavDate(d);
                          }}
                          disabled={(() => {
                            const today = new Date();
                            return calendarNavDate.getFullYear() === today.getFullYear() &&
                              calendarNavDate.getMonth() === today.getMonth();
                          })()}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--b-fg-2)",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: "bold",
                            padding: 4,
                            opacity: (calendarNavDate.getFullYear() === new Date().getFullYear() && calendarNavDate.getMonth() === new Date().getMonth()) ? 0.3 : 1,
                          }}
                        >
                          ▶
                        </button>
                      </div>

                      {/* 요일 헤더 */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(7, 1fr)",
                          textAlign: "center",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--b-fg-3)",
                          gap: 4,
                        }}
                      >
                        {t("monitor:report.weekdays").split(",").map((day, idx) => (
                          <span key={day} style={{ color: idx === 0 ? "#ff5b5b" : idx === 6 ? "#5b9cff" : undefined }}>
                            {day}
                          </span>
                        ))}
                      </div>

                      {/* 날짜 그리드 */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(7, 1fr)",
                          gap: 4,
                        }}
                      >
                        {(() => {
                          const year = calendarNavDate.getFullYear();
                          const month = calendarNavDate.getMonth();
                          const daysInMonth = getDaysInMonth(year, month);
                          const firstDay = getFirstDayOfMonth(year, month);
                          const cells = [];

                          for (let i = 0; i < firstDay; i++) {
                            cells.push(<div key={`empty-${i}`} />);
                          }

                          for (let day = 1; day <= daysInMonth; day++) {
                            const curDate = new Date(year, month, day);
                            const today = new Date();
                            const isToday = curDate.getFullYear() === today.getFullYear() &&
                              curDate.getMonth() === today.getMonth() &&
                              curDate.getDate() === today.getDate();
                            const isFuture = curDate.getTime() > today.getTime();
                            const isSelected = curDate.getFullYear() === selectedDate.getFullYear() &&
                              curDate.getMonth() === selectedDate.getMonth() &&
                              curDate.getDate() === selectedDate.getDate();

                            const vSecs = getViolationSecsForDate(year, month, day);

                            let densityBg = "rgba(255, 255, 255, 0.04)";
                            if (vSecs > 0) {
                              if (vSecs <= 30) densityBg = "rgba(234, 88, 12, 0.25)";
                              else if (vSecs <= 120) densityBg = "rgba(234, 88, 12, 0.5)";
                              else if (vSecs <= 300) densityBg = "rgba(234, 88, 12, 0.75)";
                              else densityBg = "rgba(234, 88, 12, 1)";
                            }

                            const formatVTime = (secs: number) => {
                              if (secs === 0) return t("monitor:report.perfectDay");
                              if (secs < 60) return t("monitor:report.violationSecs", { s: secs });
                              const m = Math.floor(secs / 60);
                              const s = secs % 60;
                              return t("monitor:report.violationMinsSecs", { m, s });
                            };

                            cells.push(
                              <div
                                key={`day-${day}`}
                                onClick={() => {
                                  if (isFuture) return;
                                  setSelectedDate(curDate);
                                  setCalendarOpen(false);
                                }}
                                title={`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}\n${formatVTime(vSecs)}`}
                                style={{
                                  position: "relative",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  height: 28,
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: isFuture ? "not-allowed" : "pointer",
                                  opacity: isFuture ? 0.25 : 1,
                                  background: isSelected ? "var(--b-theme)" : densityBg,
                                  color: isSelected ? "var(--b-theme-fg)" : isToday ? "#7eb09c" : "var(--b-fg-1)",
                                  border: isSelected ? "1px solid var(--b-theme)" : isToday ? "1px solid #7eb09c" : "1px solid transparent",
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  if (isFuture) return;
                                  e.currentTarget.style.transform = "scale(1.1)";
                                  e.currentTarget.style.zIndex = "10";
                                  if (!isSelected) {
                                    e.currentTarget.style.border = "1px solid rgba(255, 255, 255, 0.2)";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (isFuture) return;
                                  e.currentTarget.style.transform = "scale(1)";
                                  e.currentTarget.style.zIndex = "1";
                                  if (!isSelected) {
                                    e.currentTarget.style.border = "1px solid transparent";
                                  }
                                }}
                              >
                                {day}
                              </div>
                            );
                          }

                          return cells;
                        })()}
                      </div>
                    </div>
                  )}

                  {/* 히트맵 잔디 매트릭스 */}
                  {(() => {
                    const startTs = new Date(selectedDate);
                    startTs.setHours(0, 0, 0, 0);
                    const startMs = startTs.getTime();

                    const endTs = new Date(selectedDate);
                    endTs.setHours(23, 59, 59, 999);
                    const endMs = endTs.getTime();

                    const dayEvents = loadEvents().filter(e => e.startedAt >= startMs && e.startedAt <= endMs);

                    const statsByType: Record<PostureType, { count: number; totalSecs: number; hourlySecs: number[]; events: any[] }> = {
                      forward_head: { count: 0, totalSecs: 0, hourlySecs: Array(24).fill(0), events: [] },
                      chin_resting: { count: 0, totalSecs: 0, hourlySecs: Array(24).fill(0), events: [] },
                      shoulder_tilt: { count: 0, totalSecs: 0, hourlySecs: Array(24).fill(0), events: [] },
                      slouching: { count: 0, totalSecs: 0, hourlySecs: Array(24).fill(0), events: [] },
                      monitor_too_close: { count: 0, totalSecs: 0, hourlySecs: Array(24).fill(0), events: [] },
                      shoulder_asymmetry: { count: 0, totalSecs: 0, hourlySecs: Array(24).fill(0), events: [] },
                      head_roll: { count: 0, totalSecs: 0, hourlySecs: Array(24).fill(0), events: [] },
                    };

                    dayEvents.forEach(e => {
                      if (statsByType[e.type as PostureType]) {
                        const duration = e.durationSecs;
                        statsByType[e.type as PostureType].count += 1;
                        statsByType[e.type as PostureType].totalSecs += duration;
                        statsByType[e.type as PostureType].events.push(e);

                        const hour = new Date(e.startedAt).getHours();
                        if (hour >= 0 && hour < 24) {
                          statsByType[e.type as PostureType].hourlySecs[hour] += duration;
                        }
                      }
                    });

                    Object.keys(statsByType).forEach(k => {
                      statsByType[k as PostureType].events.sort((a, b) => b.startedAt - a.startedAt);
                    });

                    const biomechanicalWarnings: Record<PostureType, string> = {
                      forward_head: t("monitor:report.clinicalWarn.forward_head"),
                      chin_resting: t("monitor:report.clinicalWarn.chin_resting"),
                      shoulder_tilt: t("monitor:report.clinicalWarn.shoulder_tilt"),
                      slouching: t("monitor:report.clinicalWarn.slouching"),
                      monitor_too_close: t("monitor:report.clinicalWarn.monitor_too_close"),
                      shoulder_asymmetry: t("monitor:report.clinicalWarn.shoulder_asymmetry"),
                      head_roll: t("monitor:report.clinicalWarn.head_roll"),
                    };

                    const getDensityBg = (secs: number) => {
                      if (secs === 0) return "rgba(255, 255, 255, 0.04)";
                      if (secs <= 10) return "rgba(234, 88, 12, 0.2)";
                      if (secs <= 30) return "rgba(234, 88, 12, 0.45)";
                      if (secs <= 60) return "rgba(234, 88, 12, 0.75)";
                      return "rgba(234, 88, 12, 1)";
                    };

                    const formatEventTime = (timestamp: number) => {
                      const d = new Date(timestamp);
                      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
                    };

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div
                          style={{
                            background: "var(--b-surface)",
                            border: "1px solid var(--b-line)",
                            borderRadius: 14,
                            padding: "16px 20px",
                            boxShadow: "var(--b-shadow-card)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              borderBottom: "1px solid var(--b-line)",
                              paddingBottom: 10,
                              marginBottom: 12,
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 800, color: "var(--b-fg-2)" }}>
                              {t("monitor:report.hourlyTrendTitle")}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "var(--b-fg-4)" }}>
                              <span>{t("monitor:report.safe")}</span>
                              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "rgba(255, 255, 255, 0.04)" }} />
                              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "rgba(234, 88, 12, 0.2)" }} />
                              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "rgba(234, 88, 12, 0.45)" }} />
                              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "rgba(234, 88, 12, 0.75)" }} />
                              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "rgba(234, 88, 12, 1)" }} />
                              <span>{t("monitor:report.warn")}</span>
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <div style={{ width: 100 }} />
                              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 3, textAlign: "center" }}>
                                {Array.from({ length: 24 }).map((_, h) => {
                                  const showText = h % 4 === 0;
                                  return (
                                    <span key={h} style={{ fontSize: 8.5, fontWeight: 700, color: "var(--b-fg-4)", opacity: showText ? 1 : 0.2 }}>
                                      {String(h).padStart(2, "0")}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>

                            {POSTURE_TYPES.map((type) => {
                              const label = t(`posture:label.${type}`);
                              const stats = statsByType[type];
                              const isSelected = activePostureDetail === type;

                              return (
                                <div key={type} style={{ display: "flex", flexDirection: "column" }}>
                                  <div
                                    onClick={() => setActivePostureDetail(isSelected ? null : type)}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      padding: "6px 8px",
                                      borderRadius: 8,
                                      background: isSelected ? "var(--b-surface-2)" : "transparent",
                                      cursor: "pointer",
                                      transition: "all 0.15s ease",
                                      border: isSelected ? "1px solid var(--b-line)" : "1px solid transparent",
                                    }}
                                    className="b-trend-row"
                                  >
                                    <div style={{ width: 100, display: "flex", flexDirection: "column", gap: 1 }}>
                                      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--b-fg-2)" }}>
                                        {label}
                                      </span>
                                      <span style={{ fontSize: 8.5, color: stats.count > 0 ? "var(--b-warn)" : "var(--b-sig)", fontWeight: 700 }}>
                                        {stats.count > 0 ? t("monitor:report.cumulative", { duration: formatDuration(stats.totalSecs) }) : t("monitor:report.perfectAlign")}
                                      </span>
                                    </div>

                                    <div
                                      style={{
                                        flex: 1,
                                        display: "grid",
                                        gridTemplateColumns: "repeat(24, 1fr)",
                                        gap: 3,
                                        height: 18,
                                      }}
                                    >
                                      {stats.hourlySecs.map((secs, hour) => {
                                        const bg = getDensityBg(secs);
                                        return (
                                          <div
                                            key={hour}
                                            onMouseEnter={(e) => {
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              const parentRect = e.currentTarget.offsetParent?.getBoundingClientRect();
                                              const x = rect.left - (parentRect?.left || 0) + rect.width / 2;
                                              const y = rect.top - (parentRect?.top || 0) - 8;
                                              setHoveredHeatmapCell({ label, hour, secs, x, y });
                                            }}
                                            onMouseLeave={() => setHoveredHeatmapCell(null)}
                                            style={{
                                              background: bg,
                                              borderRadius: 3,
                                              transition: "transform 0.1s ease",
                                              transform: hoveredHeatmapCell?.label === label && hoveredHeatmapCell?.hour === hour ? "scale(1.2)" : "scale(1)",
                                              boxShadow: hoveredHeatmapCell?.label === label && hoveredHeatmapCell?.hour === hour ? "0 0 6px var(--b-warn)" : "none",
                                            }}
                                          />
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {isSelected && (
                                    <div
                                      style={{
                                        background: "var(--b-surface-2)",
                                        border: "1px solid var(--b-line)",
                                        borderRadius: 10,
                                        margin: "4px 8px 12px 108px",
                                        padding: "12px 14px",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 8,
                                        animation: "b-fade-in 0.2s ease, b-slide-in 0.2s ease",
                                      }}
                                    >
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--b-line)", paddingBottom: 6 }}>
                                        <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--b-fg-1)" }}>
                                          {t("monitor:report.timestampTitle", { label, count: stats.count })}
                                        </span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActivePostureDetail(null);
                                          }}
                                          style={{ border: "none", background: "transparent", fontSize: 9, color: "var(--b-fg-3)", fontWeight: 700, cursor: "pointer" }}
                                        >
                                          {t("monitor:report.closeX")}
                                        </button>
                                      </div>

                                      <div
                                        style={{
                                          background: stats.count > 0 ? "rgba(234, 88, 12, 0.04)" : "rgba(46, 163, 141, 0.04)",
                                          border: `1px solid ${stats.count > 0 ? "rgba(234, 88, 12, 0.08)" : "rgba(46, 163, 141, 0.08)"}`,
                                          borderRadius: 6,
                                          padding: "6px 10px",
                                          fontSize: 9.5,
                                          color: stats.count > 0 ? "var(--b-warn)" : "var(--b-sig)",
                                          lineHeight: 1.4,
                                          fontWeight: 600,
                                        }}
                                      >
                                        💡 <strong>{t("monitor:report.clinicalLabel")}</strong> {biomechanicalWarnings[type]}
                                      </div>

                                      {stats.events.length === 0 ? (
                                        <div style={{ textAlign: "center", padding: "14px 0", fontSize: 10.5, color: "var(--b-sig)", fontWeight: 700 }}>
                                          {t("monitor:report.noViolationOnDate", { label })}
                                        </div>
                                      ) : (
                                        <div
                                          style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: 6,
                                            maxHeight: 120,
                                            overflowY: "auto",
                                            paddingRight: 4,
                                          }}
                                          className="b-scroll"
                                        >
                                          {stats.events.map((e, idx) => (
                                            <span
                                              key={idx}
                                              style={{
                                                fontSize: 9.5,
                                                fontWeight: 600,
                                                padding: "3px 8px",
                                                borderRadius: 6,
                                                background: "var(--b-surface)",
                                                border: "1px solid var(--b-line)",
                                                color: "var(--b-fg-2)",
                                                fontFamily: "ui-monospace, monospace",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 4,
                                              }}
                                            >
                                              ⏰ {formatEventTime(e.startedAt)}
                                              <strong style={{ color: "var(--b-warn)" }}>{t("monitor:report.secsParen", { s: e.durationSecs })}</strong>
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {hoveredHeatmapCell && (
                    <div
                      style={{
                        position: "absolute",
                        left: hoveredHeatmapCell.x,
                        top: hoveredHeatmapCell.y,
                        transform: "translate(-50%, -100%)",
                        background: "rgba(18, 18, 24, 0.95)",
                        backdropFilter: "blur(8px)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: 8,
                        padding: "6px 10px",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
                        zIndex: 200,
                        pointerEvents: "none",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        width: 140,
                      }}
                    >
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--b-fg-1)" }}>
                        💡 {hoveredHeatmapCell.label}
                      </div>
                      <div style={{ fontSize: 8.5, color: "var(--b-fg-3)", display: "flex", justifyContent: "space-between" }}>
                        <span>{t("monitor:report.timeSlot")}</span>
                        <strong style={{ color: "var(--b-fg-2)" }}>{t("monitor:report.hourRange", { from: String(hoveredHeatmapCell.hour).padStart(2, "0"), to: String(hoveredHeatmapCell.hour + 1).padStart(2, "0") })}</strong>
                      </div>
                      <div style={{ fontSize: 8.5, color: "var(--b-fg-3)", display: "flex", justifyContent: "space-between" }}>
                        <span>{t("monitor:report.violationDuration")}</span>
                        <strong style={{ color: "var(--b-warn)" }}>{formatDuration(hoveredHeatmapCell.secs)}</strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* FREE Plan - Premium Upgrade pitch */
              <div style={{ padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 54,
                    height: 54,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, var(--b-amber), var(--b-warn))",
                    color: "#ffffff",
                    fontSize: 26,
                    marginBottom: 16,
                    boxShadow: "0 6px 20px rgba(229, 137, 36, 0.3)",
                  }}
                >
                  👑
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--b-fg-1)", marginBottom: 8, letterSpacing: "-0.015em" }}>
                  {isBetaFree() ? t("monitor:report.proOnlyTitle_beta") : t("monitor:report.proOnlyTitle")}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--b-fg-3)", lineHeight: 1.6, marginBottom: 24, maxWidth: 360 }}>
                  {isBetaFree() ? t("monitor:report.proOnlyDesc_beta") : t("monitor:report.proOnlyDesc")}
                </div>
                <div
                  style={{
                    width: "100%",
                    padding: "16px 20px",
                    borderRadius: 14,
                    background: "var(--b-surface-2)",
                    border: "1px solid var(--b-line)",
                    textAlign: "left",
                    marginBottom: 28,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--b-fg-2)" }}>{t("monitor:report.proGiftTitle")}</div>
                  <div style={{ fontSize: 11.5, color: "var(--b-fg-3)", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div>{t("monitor:report.proGift1")}</div>
                    <div>{t("monitor:report.proGift2")}</div>
                    <div>{t("monitor:report.proGift3")}</div>
                    <div>{t("monitor:report.proGift4")}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, width: "100%" }}>
                  <button
                    className="b-btn b-btn-ghost"
                    onClick={() => setDetailedReportOpen(false)}
                    style={{ flex: 1, justifyContent: "center", fontSize: 12.5, height: 38 }}
                  >
                    {t("monitor:report.later")}
                  </button>
                  <button
                    className="b-btn"
                    onClick={() => {
                      setDetailedReportOpen(false);
                      if (isBetaFree()) {
                        window.location.hash = "#/community";
                      } else {
                        onOpenPricing();
                      }
                    }}
                    style={{
                      flex: 1.5,
                      justifyContent: "center",
                      fontSize: 12.5,
                      height: 38,
                      background: "linear-gradient(135deg, var(--b-sig), #2ea38d)",
                      color: "#ffffff",
                      border: "none",
                      fontWeight: 700,
                      borderRadius: 8,
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(45, 143, 126, 0.3)",
                    }}
                  >
                    {isBetaFree() ? t("monitor:report.checkPro_beta") : t("monitor:report.checkPro")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
interface HourlyHeatmapProps {
  yesterdayByHour: number[];
  activeDurationByHour: number[];
  yesterdayActiveDurationByHour: number[];
  goodDurationByHour: number[];
}

function HourlyHeatmap({
  yesterdayByHour,
  activeDurationByHour,
  yesterdayActiveDurationByHour,
  goodDurationByHour,
}: HourlyHeatmapProps) {
  const { t } = useTranslation(["monitor", "posture"]);
  // 00:00 ~ 24:00 (24개 슬롯 전체). 각 슬롯에 착석 시간(배경 바)과 자세 위반(전경 바)을 중첩 표시.
  // 데이터가 적을 때는 어제 데이터를 옅게 함께 보여 비교 가능하게.
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // 실시간 현재 시간 타이머 추가
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const START = 0;
  const END = 24;
  const SLOTS = END - START;

  // 오늘/어제 착석 시간 (초)
  const todaySittingBuckets = Array.from({ length: SLOTS }, (_, i) => activeDurationByHour[START + i] ?? 0);
  const yesterdaySittingBuckets = Array.from({ length: SLOTS }, (_, i) => yesterdayActiveDurationByHour[START + i] ?? 0);

  // 오늘/어제 자세 위반 횟수
  const todayViolationBuckets = Array.from({ length: SLOTS }, (_, i) => stats.byHour[START + i] ?? 0);
  const yesterdayViolationBuckets = Array.from({ length: SLOTS }, (_, i) => yesterdayByHour[START + i] ?? 0);

  // 위반 최댓값 산출 (바 높이 상대 스케일링용)
  const maxViolations = Math.max(1, ...todayViolationBuckets, ...yesterdayViolationBuckets);

  // 현재 시간 소수점 및 가로 슬롯 위치(%) 계산
  const curHour = now.getHours();
  const curMin = now.getMinutes();
  const curSec = now.getSeconds();
  const curTimeDecimal = curHour + curMin / 60 + curSec / 3600;
  const isCurrentTimeInRange = curTimeDecimal >= START && curTimeDecimal <= END;
  const currentTimePercentage = isCurrentTimeInRange
    ? ((curTimeDecimal - START) / (END - START)) * 100
    : 0;

  function formatSeatingTime(seconds: number): string {
    if (seconds === 0) return t("monitor:minsSecs", { m: 0, s: 0 });
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return t("monitor:minsSecs", { m: mins, s: secs });
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 4,
          height: 132,
          marginBottom: 10,
          position: "relative", // 실시간 인디케이터 절대 정렬용
        }}
      >
        {todaySittingBuckets.map((vSitting, i) => {
          const vViolation = todayViolationBuckets[i];
          const ySitting = yesterdaySittingBuckets[i];
          const yViolation = yesterdayViolationBuckets[i];

          // 1. 착석 시간 바 높이 (최대 1시간(3,600초) 대비 비율, 데이터 없을 시 6px 가이드)
          const sittingRatio = vSitting / 3600;
          const hSitting = vSitting === 0 ? 6 : Math.max(8, sittingRatio * 100);

          // 2. 자세 위반 바 높이 (최대 위반 횟수 대비 비율, 최소 높이 6px)
          const violationRatio = vViolation / maxViolations;
          const hViolations = Math.max(6, violationRatio * 100);

          // 어제 데이터 높이 계산
          const ySittingRatio = ySitting / 3600;
          const yhSitting = ySitting === 0 ? 0 : Math.max(8, ySittingRatio * 100);
          const yViolationRatio = yViolation / maxViolations;
          const yhViolations = Math.max(6, yViolationRatio * 100);

          // 자세 위반 빈도별 컬러 배정 (바른 자세 유지율 연동)
          const slotActiveSecs = vSitting;
          const slotGoodSecs = goodDurationByHour[START + i] ?? 0;
          const slotGoodRatio = slotActiveSecs > 0 ? (slotGoodSecs / slotActiveSecs) * 100 : 100;

          const violationColor =
            vViolation === 0
              ? "transparent"
              : slotGoodRatio >= 90
                ? "var(--b-sig)"   // NASA 중립 자세 기준 S/A 등급 (초록)
                : slotGoodRatio >= 80
                  ? "var(--b-amber)" // 근육 피로 누적 B 등급 (주황)
                  : "var(--b-warn)";  // 척추 디스크 수직 부하 가중 C/D 등급 (빨강)

          const yesterdayViolationColor =
            yViolationRatio === 0
              ? "transparent"
              : yViolationRatio > 0.66
                ? "var(--b-warn)"
                : yViolationRatio > 0.33
                  ? "var(--b-amber)"
                  : "var(--b-sig)";

          return (
            <div
              key={i}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{
                flex: 1,
                position: "relative",
                height: 100,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center", // 전경/배경 기둥 가로축 중앙 정렬
                gap: 2,
                cursor: "pointer",
                transform: hoveredIdx === i ? "scaleY(1.03) scaleX(1.03)" : "none",
                filter: hoveredIdx === i ? "brightness(1.08)" : "none",
                transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), filter 0.2s ease",
                zIndex: hoveredIdx === i ? 10 : 1,
              }}
            >
              {/* [배경 바] 착석 시간 (더 넓고 은은함, 둥근 모서리) */}
              <div
                style={{
                  width: "100%",
                  height: hSitting,
                  background: "var(--b-sig)",
                  opacity: vSitting === 0 ? 0.06 : 0.28,
                  borderRadius: 3,
                  transition: "height .3s ease",
                }}
              />

              {/* [전경 바] 자세 위반 (더 좁고 선명함, 착석 바 내부에 중첩) */}
              {vViolation > 0 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    width: "45%",
                    height: hViolations,
                    background: violationColor,
                    borderRadius: 2,
                    opacity: 0.95,
                    transition: "height .3s ease",
                  }}
                />
              )}

              {/* [어제 가이드 선] 착석 시간(세로선) & 위반 횟수(선 위의 도트) */}
              {(ySitting > 0 || yViolation > 0) && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: -1.5, // 슬롯 간격 우측 끝에 배치하여 충돌 방지
                    width: 2.5,
                    height: yhSitting,
                    background: "var(--b-fg-4)",
                    opacity: 0.45,
                    borderRadius: 1,
                  }}
                >
                  {/* 어제 자세 위반이 있다면 앵커 컬러 도트 렌더링 */}
                  {yViolation > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: Math.max(0, yhViolations - 4), // 위반 횟수 지점에 도트 안착
                        left: -1,
                        width: 4.5,
                        height: 4.5,
                        borderRadius: "50%",
                        background: yesterdayViolationColor,
                        boxShadow: `0 0 6px ${yesterdayViolationColor}`,
                      }}
                    />
                  )}
                </div>
              )}

              {/* Elegant floating tooltip on hover */}
              {hoveredIdx === i && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: "50%",
                    transform: "translateX(-50%) translateY(-8px)",
                    background: "var(--b-elev)",
                    border: "1px solid var(--b-line-2)",
                    borderRadius: 12,
                    padding: "10px 14px",
                    boxShadow: "var(--b-shadow-elev)",
                    zIndex: 100,
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 6,
                    animation: "b-fade-in 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-1)", marginBottom: 3 }}>
                    {START + i}:00 ~ {START + i + 1}:00
                  </div>
                  
                  {/* 오늘 상세 착석 & 위반 피드백 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 6, borderBottom: "1px solid rgba(255, 255, 255, 0.06)", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--b-fg-2)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--b-sig)" }} />
                      {t("monitor:report.todaySeating")}<span className="b-num" style={{ fontWeight: 700, fontSize: 13 }}>{formatSeatingTime(vSitting)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--b-fg-2)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: vViolation > 0 ? violationColor : "rgba(255, 255, 255, 0.15)" }} />
                      {t("monitor:report.todayViolation")}<span className="b-num" style={{ fontWeight: 700, fontSize: 13, color: vViolation > 0 ? violationColor : "inherit" }}>{t("monitor:report.times", { n: vViolation })}</span>
                    </div>
                  </div>

                  {/* 어제 상세 착석 & 위반 피드백 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", paddingTop: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--b-fg-3)", opacity: 0.85 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--b-fg-4)", opacity: 0.5 }} />
                      {t("monitor:report.yesterdaySeating")}<span className="b-num" style={{ fontWeight: 700, fontSize: 12 }}>{formatSeatingTime(ySitting)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--b-fg-3)", opacity: 0.85 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: yViolation > 0 ? yesterdayViolationColor : "rgba(255, 255, 255, 0.15)", opacity: 0.7 }} />
                      {t("monitor:report.yesterdayViolation")}<span className="b-num" style={{ fontWeight: 700, fontSize: 12 }}>{t("monitor:report.times", { n: yViolation })}</span>
                    </div>
                  </div>

                  {/* Caret / Arrow */}
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 0,
                      height: 0,
                      borderLeft: "6px solid transparent",
                      borderRight: "6px solid transparent",
                      borderTop: "6px solid var(--b-line-2)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: "50%",
                      transform: "translateX(-50%) translateY(-1px)",
                      width: 0,
                      height: 0,
                      borderLeft: "5px solid transparent",
                      borderRight: "5px solid transparent",
                      borderTop: "5px solid var(--b-elev)",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* 🌟 실시간 현재 시각 수직 지시선 (Dashed Vertical Line) */}
        {isCurrentTimeInRange && (() => {
          const transformX = currentTimePercentage < 6
            ? "0%"
            : currentTimePercentage > 94
              ? "-100%"
              : "-50%";
          return (
            <div
              style={{
                position: "absolute",
                left: `${currentTimePercentage}%`,
                top: 0,
                bottom: 0,
                width: 1,
                zIndex: 8,
                pointerEvents: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {/* 실시간 시간 말풍선 핀 */}
              <div
                style={{
                  position: "absolute",
                  top: 6,
                  background: "var(--b-sig)",
                  color: "#0f141c",
                  fontSize: 8.5,
                  fontWeight: 800,
                  padding: "1px 5px",
                  borderRadius: 4,
                  whiteSpace: "nowrap",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.4)",
                  transform: `translateX(${transformX})`,
                  letterSpacing: "-0.01em",
                  zIndex: 10,
                }}
              >
                {t("monitor:report.nowTime", { time: `${String(curHour).padStart(2, "0")}:${String(curMin).padStart(2, "0")}` })}
              </div>

              {/* 🌟 현재 시간 표시 아래에서부터 시작하는 수직 점선 */}
              <div
                style={{
                  position: "absolute",
                  top: 22, // 말풍선 핀 밑에서부터 점선 시작
                  bottom: 0,
                  width: 1,
                  borderLeft: "1.5px dashed var(--b-sig)",
                  boxShadow: "0 0 6px var(--b-sig)",
                  transform: "translateX(-50%)",
                  zIndex: 8,
                }}
              />

              {/* 점선 하단의 은은한 LED 앵커 포인트 */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--b-sig)",
                  boxShadow: "0 0 6px var(--b-sig)",
                  transform: "translateX(-50%)",
                  zIndex: 9,
                }}
              />
            </div>
          );
        })()}
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
        {[0, 4, 8, 12, 16, 20, 24].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}:00</span>
        ))}
      </div>

      {/* 🌟 실시간 프리미엄 LED 타이머 바닥 패널 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 10,
          borderTop: "1px solid rgba(255, 255, 255, 0.05)",
          paddingTop: 8,
        }}
      >
        <span style={{ fontSize: 10, color: "var(--b-fg-4)" }}>
          * 넓은 기둥은 시간대별 집중(착석) 시간이며, 내부의 진한 기둥은 자세 위반 횟수입니다.
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            className="b-pulse-dot"
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--b-sig)",
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--b-fg-2)" }}>
            {t("monitor:report.currentTimeLabel")}<span className="b-num" style={{ color: "var(--b-sig)", fontSize: 11 }}>{String(curHour).padStart(2, "0")}:{String(curMin).padStart(2, "0")}:{String(curSec).padStart(2, "0")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function PostureBars() {
  const { t } = useTranslation(["monitor", "posture"]);
  const [hoveredType, setHoveredType] = useState<PostureType | null>(null);

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
    { label: t("posture:label.forward_head"), count: stats.byType.forward_head, type: "forward_head" },
    { label: t("posture:label.slouching"), count: stats.byType.slouching, type: "slouching" },
    { label: t("posture:label.shoulder_tilt"), count: stats.byType.shoulder_tilt, type: "shoulder_tilt" },
    { label: t("posture:label.chin_resting"), count: stats.byType.chin_resting, type: "chin_resting" },
    { label: t("posture:label.monitor_too_close"), count: stats.byType.monitor_too_close, type: "monitor_too_close" },
    { label: t("posture:label.shoulder_asymmetry"), count: stats.byType.shoulder_asymmetry, type: "shoulder_asymmetry" },
    { label: t("posture:label.head_roll"), count: stats.byType.head_roll, type: "head_roll" },
  ];

  const max = Math.max(1, ...items.map((i) => i.count));

  function getPostureTip(type: PostureType): string {
    const key = ([
      "forward_head", "slouching", "shoulder_tilt", "chin_resting",
      "monitor_too_close", "shoulder_asymmetry", "head_roll",
    ] as PostureType[]).includes(type) ? type : "default";
    return t(`monitor:report.biomechDetail.${key}`);
  }

  const totalCount = items.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div>
      {items.map((p) => {
        const percent = totalCount > 0 ? ((p.count / totalCount) * 100).toFixed(1) : "0.0";
        return (
          <div
            key={p.type}
            onMouseEnter={() => setHoveredType(p.type)}
            onMouseLeave={() => setHoveredType(null)}
            style={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flex: 1,
                transform: hoveredType === p.type ? "translateX(4px)" : "none",
                transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: hoveredType === p.type ? "var(--b-warn)" : "var(--b-fg-2)",
                  width: 80,
                  fontWeight: hoveredType === p.type ? 800 : 500,
                  transition: "all 0.2s ease",
                }}
              >
                {p.label}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  background: "var(--b-surface-2)",
                  overflow: "visible", // 툴팁 노출을 위해 visible로 설정
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: `${(p.count / max) * 100}%`,
                    height: "100%",
                    background: "var(--b-warn)",
                    opacity: hoveredType === p.type ? 0.95 : 0.65,
                    borderRadius: 3,
                    transition: "width .3s ease, opacity .2s ease",
                    boxShadow: hoveredType === p.type ? "0 0 8px var(--b-warn)" : "none",
                  }}
                />

                {/* 🌟 마우스 호버 시 떠오르는 인체공학 코멘트 말풍선 툴팁 */}
                {hoveredType === p.type && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: `${Math.min(100, Math.max(0, ((p.count / max) * 100) / 2))}%`, // 바 중간 위치 조준
                      transform: "translateX(-50%) translateY(-8px)",
                      background: "var(--b-elev)",
                      backdropFilter: "blur(12px)",
                      border: "1px solid var(--b-line-2)",
                      borderRadius: 8,
                      padding: "8px 12px",
                      boxShadow: "var(--b-shadow-elev)",
                      zIndex: 100,
                      pointerEvents: "none",
                      whiteSpace: "nowrap",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 4,
                      animation: "b-fade-in 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--b-fg-1)" }}>
                      {p.label}: <span className="b-num" style={{ color: "var(--b-warn)", fontWeight: 900 }}>{t("monitor:report.byTypeCount", { count: p.count, percent })}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--b-fg-3)", maxWidth: 220, whiteSpace: "normal", lineHeight: "1.4" }}>
                      {getPostureTip(p.type)}
                    </div>

                    {/* 말풍선 꼬리 핀 */}
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 0,
                        height: 0,
                        borderLeft: "6px solid transparent",
                        borderRight: "6px solid transparent",
                        borderTop: "6px solid var(--b-line-2)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: "50%",
                        transform: "translateX(-50%) translateY(-1px)",
                        width: 0,
                        height: 0,
                        borderLeft: "5px solid transparent",
                        borderRight: "5px solid transparent",
                        borderTop: "5px solid var(--b-elev)",
                      }}
                    />
                  </div>
                )}
              </div>
              <span
                className="b-num"
                style={{
                  fontSize: 12,
                  color: hoveredType === p.type ? "var(--b-warn)" : "var(--b-fg-3)",
                  width: 24,
                  textAlign: "right",
                  fontWeight: hoveredType === p.type ? 800 : 500,
                  transition: "all 0.2s ease",
                }}
              >
                {p.count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
