import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { LogicalPosition, PhysicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { listen as tauriListen } from "@tauri-apps/api/event";
import {
  isMinibarVisible,
  onAlertFired,
  onPauseEvent,
  onResumeEvent,
  onTogglePauseEvent,
  onWidgetState,
  switchToMainMode,
  type WidgetState,
} from "../ipc";
import { useHeartbeat, useWatchdog } from "../watchdog";
import { reportFalseAlarm } from "../pose/thresholds";
import type { PostureType } from "../pose/types";
import { useMonitoringEngine } from "../hooks/useMonitoringEngine";
import { useScoreTween } from "../hooks/useScoreTween";
import {
  loadAlertModes,
  type AlertFiredDetail,
} from "../alertConfig";
import { Icon } from "../components/Icon";
import { PostureFigure, type PostureFigureState } from "../components/PostureFigure";
import { AlertOverlay } from "../components/AlertOverlay";

const POSTURE_FIGURE: Record<PostureType, PostureFigureState> = {
  forward_head: "forward-head",
  chin_resting: "chin-prop",
  shoulder_tilt: "shoulder-tilt",
  slouching: "slouch",
  monitor_too_close: "forward-head",
  shoulder_asymmetry: "shoulder-tilt",
  head_roll: "shoulder-tilt",
};

function formatTimeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
  if (sec < 60) return rtf.format(-sec, "second");
  const min = Math.floor(sec / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.floor(min / 60);
  return rtf.format(-hr, "hour");
}

const darkHoverBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 26,
  padding: "0 10px",
  borderRadius: 6,
  background: "transparent",
  color: "rgba(240,238,232,0.7)",
  border: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 11,
  fontWeight: 600,
  transition: "background .12s ease",
};

function formatDuration(secs: number): string {
  if (secs < 60) return i18n.t("widget:secs", { s: Math.round(secs) });
  return i18n.t("widget:minsSecs", {
    m: Math.floor(secs / 60),
    s: Math.round(secs % 60),
  });
}

export function Widget() {
  const { t } = useTranslation(["widget", "posture", "coaching"]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<WidgetState>({
    status: "good",
    score: 100,
    away: false,
    violations: [],
    lastAlarm: null,
    maxDurationSecs: 0,
    stage: 0,
    pose: null,
    breakStatus: null,
  });
  const [paused, setPaused] = useState<boolean>(() => {
    return localStorage.getItem("barosit:paused") === "true";
  });

  // ─── 모니터링 일시정지 상태 동기화 및 단축키(Space) ──────────────────
  useEffect(() => {
    localStorage.setItem("barosit:paused", String(paused));
    try {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "barosit:paused",
          newValue: String(paused),
        })
      );
    } catch { /* noop */ }
  }, [paused]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "barosit:paused") {
        setPaused(e.newValue === "true");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    let unsubPause: (() => void) | undefined;
    let unsubResume: (() => void) | undefined;
    let unsubTogglePause: (() => void) | undefined;

    onPauseEvent(() => setPaused(true)).then((u) => (unsubPause = u));
    onResumeEvent(() => setPaused(false)).then((u) => (unsubResume = u));
    onTogglePauseEvent(() => setPaused((p) => !p)).then((u) => (unsubTogglePause = u));

    return () => {
      unsubPause?.();
      unsubResume?.();
      unsubTogglePause?.();
    };
  }, []);

  // 위젯 윈도우 포커스 상태일 때 Space 키로 일시정지/재개 토글
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { displayed: tweenedScore, jumped: scoreJumped } = useScoreTween(
    state.score,
  );
  const [hover, setHover] = useState(false);
  const [alertExpand, setAlertExpand] = useState<AlertFiredDetail | null>(null);
  const [, force] = useState(0);

  // 위반 발사 시 일시 확장 — alert_modes.widgetExpand 가 켜져 있을 때만.
  // Tauri 이벤트로 listen — 메인 윈도우(또는 위젯 윈도우 자기 자신)가 emit한
  // alert:fired 를 윈도우 경계 넘어 받음. 같은 윈도우 CustomEvent로는 부족
  // (메인이 owner인 경우 위젯이 못 받음).
  useEffect(() => {
    let dismissTimer: number | null = null;
    let unsub: (() => void) | undefined;
    onAlertFired((payload) => {
      if (!loadAlertModes().widgetExpand) return;
      const detail: AlertFiredDetail = {
        postureType: payload.posture_type,
        durationSecs: payload.duration_secs,
        intensity: payload.intensity,
        coachingMessage: payload.coaching_message,
      };
      if (dismissTimer != null) window.clearTimeout(dismissTimer);
      setAlertExpand(detail);
      const dur = 2500 + Math.round(payload.intensity * 2500);
      dismissTimer = window.setTimeout(() => setAlertExpand(null), dur);
    }).then((u) => {
      unsub = u;
    });
    return () => {
      unsub?.();
      if (dismissTimer != null) window.clearTimeout(dismissTimer);
    };
  }, []);

  // Rust 측 커서 폴링 이벤트 — NSTrackingArea 가 key window 의존이라
  // 비활성 상태에서 호버 안 잡히는 문제를 우회. 글로벌 listen 으로 수신.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    tauriListen<boolean>("widget:hover-changed", (e) => {
      setHover(Boolean(e.payload));
    })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => undefined);
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // 호버 또는 위반 발사로 일시 확장 시 같은 크기로 리사이즈
  const expandedOpen = hover || !!alertExpand;
  useEffect(() => {
    const win = getCurrentWindow();
    const compact = new LogicalSize(250, 54);
    const expanded = new LogicalSize(340, 380);
    win.setSize(expandedOpen ? expanded : compact).catch(() => undefined);
  }, [expandedOpen]);
  const [showMinibar, setShowMinibar] = useState<boolean>(() =>
    isMinibarVisible(),
  );
  const [appMode, setAppMode] = useState<string>(() =>
    localStorage.getItem("app_mode") === "widget" ? "widget" : "main",
  );
  const [mainVisible, setMainVisible] = useState<boolean>(() => {
    return localStorage.getItem("main_visible") !== "false";
  });
  const showCameraIcon = appMode === "widget";

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "minibar_visible") setShowMinibar(isMinibarVisible());
      if (e.key === "app_mode")
        setAppMode(e.newValue === "widget" ? "widget" : "main");
      if (e.key === "main_visible")
        setMainVisible(e.newValue !== "false");
    };
    const onMode = (e: Event) => setAppMode((e as CustomEvent<string>).detail);
    window.addEventListener("storage", onStorage);
    window.addEventListener("app-mode-change", onMode);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("app-mode-change", onMode);
    };
  }, []);

  // 위젯 엔진은 위젯 모드이거나, 메인 모드인데 메인이 가려졌을 때 동작
  const engineActive = appMode === "widget" || (appMode === "main" && !mainVisible);

  const engine = useMonitoringEngine({
    enabled: engineActive,
    paused: paused,
    visible: true,
  });

  // widget_state 수신 시각 heartbeat. 메인이 publish 멈추거나(=메인 freeze) 자체
  // 엔진이 멈추면 update 없음 → watchdog 이 reload.
  const widgetStateHeartbeat = useHeartbeat();

  useEffect(() => {
    const apply = (s: WidgetState) => {
      widgetStateHeartbeat.tick();
      setState((prev) => ({ ...s, pose: s.pose ?? prev.pose }));
    };
    try {
      const raw = localStorage.getItem("widget_state");
      if (raw) apply(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "widget_state" || !e.newValue) return;
      try {
        apply(JSON.parse(e.newValue));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    let un: (() => void) | undefined;
    onWidgetState(apply).then((u) => {
      un = u;
    });
    return () => {
      window.removeEventListener("storage", onStorage);
      un?.();
    };
  }, []);

  // widget_state 가 60초+ 갱신 안 되면 reload — 메인이 freeze 됐거나 위젯 자체 엔진
  // 멈춤 모두 복구. (Widget 자체가 엔진 가질 때도 publish 가 매 프레임이라 OK.)
  useWatchdog("widget-state-freshness", widgetStateHeartbeat.getLastAt, {
    expectedIntervalMs: 1000,
    warnThresholdMs: 30_000,
    reloadThresholdMs: 60_000,
    active: true,
  });

  // ─── 위젯 미사용 유휴 시 자동 환수 로직 (Idle Auto-Recovery) ──────────────────────
  // 1. 위젯이 호버되어 있지 않고, 알림 팝업도 없음 (!hover && !alertExpand)
  // 2. 모니터링이 일시정지/휴식 중이거나 (state.status === "paused" / "resting" / state.away)
  //    또는 위젯 내부의 카메라 엔진이 비활성화 상태여서 (engineActive === false) 화면 갱신이 소극적일 때
  // 3. 이 상태가 5분(300,000ms) 이상 지속되면 위젯을 새로고침하여 WebGL/V8 메모리를 완전히 환수합니다.
  useEffect(() => {
    const isPausedOrPassive =
      state.status === "paused" ||
      state.status === "resting" ||
      state.away ||
      !engineActive;

    const isIdle = !hover && !alertExpand && isPausedOrPassive;
    if (!isIdle) return;

    const timerId = window.setTimeout(() => {
      console.info("[barosit:widget] Idle Auto-Recovery triggered - reloading to reclaim memory.");
      window.location.reload();
    }, 5 * 60 * 1000); // 5분

    return () => window.clearTimeout(timerId);
  }, [hover, alertExpand, state.status, state.away, engineActive]);

  useEffect(() => {
    if (!hover) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [hover]);

  // 위치 복원/저장
  useEffect(() => {
    const win = getCurrentWindow();
    let ignoreMoves = true;
    const place = async () => {
      try {
        const saved = localStorage.getItem("widget_position");
        if (saved) {
          const { x, y } = JSON.parse(saved);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            await win.setPosition(new PhysicalPosition(x, y));
            return;
          }
        }
        const monitor = await currentMonitor();
        if (!monitor) return;
        const size = await win.outerSize();
        const sf = monitor.scaleFactor;
        const screenW = monitor.size.width / sf;
        const winW = size.width / sf;
        await win.setPosition(
          new LogicalPosition(Math.round(screenW - winW - 20), 50),
        );
      } catch {
        /* ignore */
      }
    };
    place().finally(() => {
      setTimeout(() => {
        ignoreMoves = false;
      }, 400);
    });
    const unlistenPromise = win.onMoved(({ payload }) => {
      if (ignoreMoves) return;
      localStorage.setItem(
        "widget_position",
        JSON.stringify({ x: payload.x, y: payload.y }),
      );
    });
    return () => {
      unlistenPromise.then((u) => u());
    };
  }, []);

  // 알약 내부는 CSS 변수 의존 없이 직접 hex — OS 다크모드/검은 배경 무관 항상 라이트
  const PALETTE = {
    surface: "#ffffff",
    fg1: "#1a1a1a",
    fg2: "#4a4a48",
    fg3: "rgba(26,26,26,0.55)",
    sage: "#5b8c7a",
    sageSoft: "#e5efea",
    sageDeep: "#3f6e5e",
    amber: "#b07335",
    warn: "#c25a3a",
    away: "#7f7f7f",
  };
  // 단계별 dot/숫자 색 — 30s+ 위반이면 warn, 0-30s 위반이면 amber, 양호면 sage
  const stageDot = state.away
    ? PALETTE.away
    : state.stage >= 3
      ? PALETTE.warn
      : state.stage >= 1
        ? PALETTE.amber
        : PALETTE.sage;
  // 알약 보더: 평소에도 상태색(옅게), 호버 시 진하게 — 한눈에 상태 인지
  const stageRgb = state.away
    ? "127, 127, 127"
    : state.stage >= 3
      ? "194, 90, 58"
      : state.stage >= 1
        ? "176, 115, 53"
        : "91, 140, 122";
  const pillBorder = `rgba(${stageRgb}, ${hover ? 0.85 : 0.35})`;

  const handleClick = () => {
    switchToMainMode().catch(() => undefined);
  };

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    getCurrentWindow()
      .startDragging()
      .catch(() => undefined);
  };

  const primaryViolation = state.violations[0];
  const panelOpen = hover || !!alertExpand;

  // 정기 휴식 알림 배지 — 단계 진입 시 미니바에 작은 표식. 자세 알림과 시각적 분리.
  // 회복 톤(녹·청)으로 표현. micro 도 표시해서 사용자가 누적 인지하게 함.
  const breakStage = state.breakStatus?.stage ?? "none";
  const breakBadge =
    breakStage === "none"
      ? null
      : {
          accent:
            breakStage === "deep"
              ? "#2d8f7e"
              : breakStage === "standup"
                ? "#3a9d8c"
                : "#5db49f",
          label:
            breakStage === "deep"
              ? t("widget:breakBadge.deep")
              : breakStage === "standup"
                ? t("widget:breakBadge.standup")
                : t("widget:breakBadge.micro"),
          minutes: state.breakStatus
            ? Math.floor(state.breakStatus.secsSeated / 60)
            : 0,
          // 1분 움직임 목표(30-1) 진행. movementSecs>0 이면 배지가 진행률로 전환.
          movementSecs: Math.floor(state.breakStatus?.movementSecs ?? 0),
          goalSecs: Math.round(state.breakStatus?.goalSecs ?? 60),
        };

  // 상시 착석 타이머 — 앉은 순간(1분+)부터 경과를 미니바에 계속 표시. 단계 발사(30분)
  // 전 구간을 커버해 "얼마나 오래 고정 중인지" 상시 인지시킨다. 단계 뜨면 breakBadge 로
  // 전환(상호배타). 30분 근접에 따라 톤 상승 → 스스로 움직이도록 유도.
  const seatedSecs = Math.floor(state.breakStatus?.secsSeated ?? 0);
  const seatedTimer =
    breakStage === "none" && !state.away && seatedSecs >= 60
      ? {
          minutes: Math.floor(seatedSecs / 60),
          accent:
            seatedSecs >= 25 * 60
              ? "#d98a3d" // 25분+ 경고(주황)
              : seatedSecs >= 15 * 60
                ? "#c9a94a" // 15분+ 주의(황)
                : "#8a97a6", // 차분(회)
        }
      : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        margin: 0,
        padding: 0,
        // 거의 0에 가까운 알파값 — 시각적으로는 투명이지만 macOS 투명 윈도우의
        // 빈 영역에서도 mouseenter/leave가 발화하도록 픽셀을 깔아둠.
        // 0,0,0 으로 두면 빈 영역에 마우스가 와도 호버 이벤트가 안 잡혀
        // 사용자가 알약 위를 직접 클릭/터치해야 패널이 열리는 문제 발생.
        background: "transparent",
        fontFamily:
          '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={(e) => {
        if (!expandedOpen) return;
        if (contentRef.current) {
          const rect = contentRef.current.getBoundingClientRect();
          const isInside =
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom;
          if (!isInside) {
            setHover(false);
          }
        }
      }}
    >
      {/* 카메라 스트림용 hidden video */}
      <video
        ref={engine.videoRef}
        muted
        playsInline
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
      <div
        ref={contentRef}
        className="b-force-light"
        style={{
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* 미니바 알약 — 직접 hex로 라이트 톤 고정. CSS 변수 영향 없음 → OS 다크모드/검은 배경에서도 항상 흰 알약 */}
          {showMinibar && (
            <div
              data-tauri-drag-region
              onPointerDown={startDrag}
              className={`b-minibar-pill ${scoreJumped ? "b-pill-glow" : ""}`}
              style={{
                alignSelf: "flex-start",
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                padding: "0 4px 0 12px",
                height: 36,
                borderRadius: 999,
                background: "#ffffff",
                color: "#1a1a1a",
                border: "1.5px solid",
                borderColor: pillBorder,
                boxShadow:
                  "0 1px 3px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.06)",
                transform: "translate3d(0, 0, 0)",
                willChange: "transform",
                transition: "border-color .15s ease",
                cursor: "grab",
                boxSizing: "border-box",
              }}
            >
              <span
                aria-hidden
                className="b-pulse-dot"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: stageDot,
                  boxShadow: `0 0 0 3px rgba(${stageRgb}, 0.18), inset 0 1px 1px rgba(255,255,255,0.35), inset 0 -1px 1px rgba(0,0,0,0.15)`,
                  flexShrink: 0,
                  marginRight: 2,
                }}
              />
              {!state.away && (
                <span
                  key={scoreJumped ? "rise" : "calm"}
                  className={`b-num${scoreJumped ? " b-score-rise" : ""}`}
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: stageDot,
                    letterSpacing: "-0.02em",
                    transition: "color .6s ease",
                  }}
                >
                  {Math.round(tweenedScore)}
                </span>
              )}
              <span
                style={{
                  fontSize: 12,
                  color: PALETTE.fg2,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 130,
                }}
              >
                {state.away ? t("widget:away") : t(`widget:status.${state.status}`)}
              </span>
              {breakBadge && (
                <span
                  aria-label={t("widget:breakBadgeAria", {
                    minutes: breakBadge.minutes,
                    label: breakBadge.label,
                  })}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 7px",
                    borderRadius: 999,
                    background: `${breakBadge.accent}1a`,
                    color: breakBadge.accent,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    flexShrink: 0,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: breakBadge.accent,
                    }}
                  />
                  {breakBadge.movementSecs > 0
                    ? `${breakBadge.movementSecs}/${breakBadge.goalSecs}s`
                    : `${breakBadge.minutes}m`}
                </span>
              )}
              {seatedTimer && (
                <span
                  aria-label={t("widget:seatedTimerAria", {
                    minutes: seatedTimer.minutes,
                  })}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 7px",
                    borderRadius: 999,
                    background: `${seatedTimer.accent}14`,
                    color: seatedTimer.accent,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    flexShrink: 0,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: seatedTimer.accent,
                    }}
                  />
                  {seatedTimer.minutes}m
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPaused((p) => !p);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  border: 0,
                  cursor: "pointer",
                  background: paused ? PALETTE.sageSoft : "#fee2e2",
                  color: paused ? PALETTE.sageDeep : "#b91c1c",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "background .12s ease, color .12s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = paused ? PALETTE.sage : "#fca5a5";
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = paused ? PALETTE.sageSoft : "#fee2e2";
                  e.currentTarget.style.color = paused ? PALETTE.sageDeep : "#b91c1c";
                }}
                title={paused ? t("widget:title.resume") : t("widget:title.pause")}
              >
                <Icon name={paused ? "play" : "pause"} size={12} />
              </button>
              {showCameraIcon && (
                <button
                  onClick={handleClick}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border: 0,
                    cursor: "pointer",
                    background: PALETTE.sageSoft,
                    color: PALETTE.sageDeep,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "background .12s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = PALETTE.sage;
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = PALETTE.sageSoft;
                    e.currentTarget.style.color = PALETTE.sageDeep;
                  }}
                  title={t("widget:title.backToMain")}
                >
                  <Icon name="logo" size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* 위반 알림 — 위젯이 일시 확장됐을 때 호버 카드 위에 큰 배너 */}
        {alertExpand && (
          <div
            className="b-toast-in"
            style={{
              width: 264,
              padding: "14px 16px",
              marginBottom: 8,
              background: `linear-gradient(135deg, rgba(210,119,88,${0.7 + alertExpand.intensity * 0.25}), rgba(170,70,50,${0.85 + alertExpand.intensity * 0.1}))`,
              color: "#fff",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.25)",
              boxShadow: "0 12px 32px rgba(170,70,50,0.45)",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                opacity: 0.85,
                marginBottom: 4,
              }}
            >
              {t("widget:alertBanner", { sec: Math.round(alertExpand.durationSecs) })}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>
              {t(`posture:label.${alertExpand.postureType}`)}
            </div>
            <div style={{ fontSize: 12, opacity: 0.92, lineHeight: 1.4 }}>
              {alertExpand.coachingMessage ?? t(`coaching:tip.${alertExpand.postureType}`)}
            </div>
          </div>
        )}

        {/* 호버 디테일 카드 — 다크 톤 + 강한 외곽선 (검은 배경에서도 분리되어 보임) */}
        {panelOpen && (
          <div
            className="b-toast-in"
            style={{
              width: 264,
              padding: 14,
              background: "#2a2c2e",
              color: "#f0eee8",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow:
                "0 1px 3px rgba(0,0,0,0.4), 0 20px 50px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.4)",
              boxSizing: "border-box",
            }}
          >
            {/* 헤더 라벨 */}
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "rgba(240,238,232,0.5)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              {t("widget:currentPosture")}
            </div>

            {/* posture figure + 칩 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 9,
                  background: "rgba(255,255,255,0.06)",
                  color: stageDot,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <PostureFigure
                  state={
                    primaryViolation ? POSTURE_FIGURE[primaryViolation] : "good"
                  }
                  accent="currentColor"
                  warn="currentColor"
                  dim="rgba(255,255,255,0.18)"
                  size={40}
                  strokeWidth={4}
                />
              </div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "5px 11px",
                  borderRadius: 999,
                  background:
                    state.status === "standing" || state.violations.length === 0
                      ? "rgba(126,176,156,0.18)"
                      : state.stage >= 3
                        ? "rgba(224,136,102,0.18)"
                        : "rgba(212,162,106,0.18)",
                  color: stageDot,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {state.away
                  ? t("widget:away")
                  : state.status === "standing"
                    ? t("widget:chip.standing")
                    : state.violations.length === 0
                      ? t("widget:chip.good")
                      : primaryViolation
                        ? t(`posture:label.${primaryViolation}`)
                        : t("widget:chip.caution")}
              </span>
            </div>

            {/* 코칭 라인 */}
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                lineHeight: 1.45,
                letterSpacing: "-0.012em",
                marginBottom: 14,
                color: "#f0eee8",
              }}
            >
              {state.away
                ? t("widget:coach.away")
                : state.status === "standing"
                  ? t("widget:coach.standing")
                  : state.violations.length === 0
                    ? t("widget:coach.good")
                    : primaryViolation
                      ? t("widget:violationCoach", {
                          duration: formatDuration(state.maxDurationSecs),
                          tip: t(`coaching:tip.${primaryViolation}`),
                        })
                      : ""}
            </div>

            {/* 메타 — 마지막 알람 */}
            {state.lastAlarm && (
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(240,238,232,0.5)",
                  marginBottom: 10,
                }}
              >
                {t("widget:lastAlarm", {
                  label: t(`posture:label.${state.lastAlarm.type}`),
                  time: formatTimeAgo(state.lastAlarm.at),
                })}
              </div>
            )}

            {/* 액션 */}
            <div
              style={{
                display: "flex",
                gap: 6,
                paddingTop: 10,
                borderTop: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {state.lastAlarm && (
                <button
                  onClick={() => {
                    if (state.lastAlarm) reportFalseAlarm(state.lastAlarm.type);
                  }}
                  style={darkHoverBtnStyle}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.06)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <Icon name="flag" size={11} />
                  {t("widget:falseAlarm")}
                </button>
              )}
              <button
                onClick={handleClick}
                style={{
                  ...darkHoverBtnStyle,
                  marginLeft: "auto",
                  background: "rgba(255,255,255,0.08)",
                  color: "#f0eee8",
                }}
                title={t("widget:title.openMain")}
              >
                <Icon name="maximize" size={11} />
              </button>
            </div>
          </div>
        )}
      </div>
      <AlertOverlay />
    </div>
  );
}
