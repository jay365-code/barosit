// 풀스크린 alert 윈도우 — alwaysOnTop + click-through.
// 메인 윈도우의 AlertOverlay 가 발사 시 showAlertWindow + Tauri event emit 하면
// 이 윈도우가 받아 풀스크린으로 글로우/토스트를 그리고 일정 시간 후 자동 hide.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadAlertModes, type AlertModes } from "../alertConfig";
import {
  hideAlertWindow,
  onAlertFired,
  onBreakReminder,
  onCumulativeAlert,
  onVariabilityAlert,
  onForceBlur,
} from "../ipc";
import type { PostureType } from "../pose/types";
import type { BreakStage } from "../pose/breakTracker";

interface Active {
  id: number;
  postureType: PostureType;
  durationSecs: number;
  intensity: number;
  coachingMessage: string | null;
  expiresAt: number;
}

interface ActiveBreak {
  id: number;
  stage: Exclude<BreakStage, "none">;
  secs: number;
  expiresAt: number;
}

const BREAK_ACCENT: Record<Exclude<BreakStage, "none">, string> = {
  micro: "#5db49f",
  standup: "#3a9d8c",
  deep: "#2d8f7e",
};

interface ActiveCumulative {
  id: number;
  postureType: PostureType;
  secs: number;
  ratio: number;
  expiresAt: number;
}

interface ActiveVariability {
  id: number;
  movementIndex: number;
  durationSecs: number;
  expiresAt: number;
}

function glowColor(intensity: number): string {
  const hue = Math.round(50 - intensity * 50);
  const sat = 80;
  const light = Math.round(60 - intensity * 15);
  return `hsl(${hue} ${sat}% ${light}%)`;
}

export function AlertWindow() {
  const { t } = useTranslation(["posture", "coaching", "alerts"]);
  const [modes, setModes] = useState<AlertModes>(() => loadAlertModes());
  const [active, setActive] = useState<Active | null>(null);
  const [activeBreak, setActiveBreak] = useState<ActiveBreak | null>(null);
  const [activeCumulative, setActiveCumulative] = useState<ActiveCumulative | null>(null);
  const [activeVariability, setActiveVariability] = useState<ActiveVariability | null>(null);
  const [forceBlur, setForceBlur] = useState(false);
  const idRef = useRef(0);
  const breakIdRef = useRef(0);
  const cumIdRef = useRef(0);
  const varIdRef = useRef(0);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "alert_modes") return;
      setModes(loadAlertModes());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    onAlertFired((payload) => {
      const current = loadAlertModes();
      setModes(current);
      if (!current.edgeGlow && !current.fullscreenToast) {
        hideAlertWindow().catch(() => undefined);
        return;
      }
      const id = ++idRef.current;
      const duration = 1800 + Math.round(payload.intensity * 1800);
      setActive({
        id,
        postureType: payload.posture_type,
        durationSecs: payload.duration_secs,
        intensity: payload.intensity,
        coachingMessage: payload.coaching_message,
        expiresAt: Date.now() + duration,
      });
      window.setTimeout(() => {
        setActive((prev) => {
          if (prev?.id !== id) return prev;
          hideAlertWindow().catch(() => undefined);
          return null;
        });
      }, duration);
    }).then((u) => {
      unsub = u;
    });
    return () => {
      unsub?.();
    };
  }, []);

  // 정기 휴식 알림 (Phase 1) — standup/deep 만 풀스크린 윈도우 표시 (micro 는 inline 토스트만)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    onBreakReminder((payload) => {
      const id = ++breakIdRef.current;
      const duration =
        payload.stage === "deep"
          ? 7000
          : payload.stage === "standup"
            ? 5000
            : 3500;
      setActiveBreak({
        id,
        stage: payload.stage,
        secs: payload.secs,
        expiresAt: Date.now() + duration,
      });
      window.setTimeout(() => {
        setActiveBreak((prev) => {
          if (prev?.id !== id) return prev;
          hideAlertWindow().catch(() => undefined);
          return null;
        });
      }, duration);
    }).then((u) => {
      unsub = u;
    });
    return () => {
      unsub?.();
    };
  }, []);

  // Phase 2 — 누적 부하 알림 IPC 수신
  useEffect(() => {
    let unsub: (() => void) | undefined;
    onCumulativeAlert((payload) => {
      const id = ++cumIdRef.current;
      const duration = 5000;
      setActiveCumulative({
        id,
        postureType: payload.posture_type,
        secs: payload.secs,
        ratio: payload.ratio,
        expiresAt: Date.now() + duration,
      });
      window.setTimeout(() => {
        setActiveCumulative((prev) => {
          if (prev?.id !== id) return prev;
          hideAlertWindow().catch(() => undefined);
          return null;
        });
      }, duration);
    }).then((u) => {
      unsub = u;
    });
    return () => {
      unsub?.();
    };
  }, []);

  // Phase 3 — 변동성 알림 IPC 수신
  useEffect(() => {
    let unsub: (() => void) | undefined;
    onVariabilityAlert((payload) => {
      const id = ++varIdRef.current;
      const duration = 4000;
      setActiveVariability({
        id,
        movementIndex: payload.movement_index,
        durationSecs: payload.duration_secs,
        expiresAt: Date.now() + duration,
      });
      window.setTimeout(() => {
        setActiveVariability((prev) => {
          if (prev?.id !== id) return prev;
          hideAlertWindow().catch(() => undefined);
          return null;
        });
      }, duration);
    }).then((u) => {
      unsub = u;
    });
    return () => {
      unsub?.();
    };
  }, []);

  // 강제 모드 블러 — 루프가 on/off 소유. 단, 루프가 멈춰(일시정지 등) 해제
  // 이벤트를 못 쏘면 veil 이 갇히므로 UI 실패안전 타이머로 반드시 자동 해제.
  const forceBlurTimerRef = useRef<number | null>(null);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    onForceBlur((payload) => {
      setForceBlur(payload.active);
      if (forceBlurTimerRef.current) {
        clearTimeout(forceBlurTimerRef.current);
        forceBlurTimerRef.current = null;
      }
      if (payload.active) {
        forceBlurTimerRef.current = window.setTimeout(() => {
          setForceBlur(false);
          hideAlertWindow().catch(() => undefined);
        }, 35000);
      } else {
        hideAlertWindow().catch(() => undefined);
      }
    }).then((u) => {
      unsub = u;
    });
    return () => {
      unsub?.();
      if (forceBlurTimerRef.current) clearTimeout(forceBlurTimerRef.current);
    };
  }, []);

  // 자세 위반 표시용 파생값
  const posture = active
    ? {
        color: glowColor(active.intensity),
        label: t(`posture:label.${active.postureType}`),
        coaching: active.coachingMessage ?? t(`coaching:tip.${active.postureType}`),
        thickness: Math.round(80 + active.intensity * 140),
        alpha: 0.35 + active.intensity * 0.45,
        animDur: active.intensity >= 0.7 ? "0.8s" : "1.3s",
      }
    : null;

  return (
    <>
      {active && posture && modes.edgeGlow && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            boxShadow: `inset 0 0 ${posture.thickness}px ${Math.round(posture.thickness * 0.45)}px ${posture.color}`,
            opacity: posture.alpha,
            animation: `barosit-edge-pulse ${posture.animDur} ease-in-out infinite alternate`,
          }}
        />
      )}
      {active && posture && modes.fullscreenToast && (
        <div
          aria-live="assertive"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(20, 20, 24, 0.94)",
              color: "#fff",
              padding: "22px 36px",
              borderRadius: 20,
              border: `3px solid ${posture.color}`,
              boxShadow: `0 16px 48px rgba(0,0,0,0.55), 0 0 0 12px ${posture.color}22`,
              maxWidth: "60vw",
              textAlign: "center",
              animation: "barosit-toast-in 0.25s ease-out",
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: posture.color,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              {t("alerts:durationSec", { sec: Math.round(active.durationSecs) })}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
              {posture.label}
            </div>
            <div style={{ fontSize: 16, opacity: 0.88 }}>
              {posture.coaching}
            </div>
          </div>
        </div>
      )}
      {activeBreak && (
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(20, 24, 22, 0.94)",
              color: "#fff",
              padding: "22px 36px",
              borderRadius: 20,
              border: `3px solid ${BREAK_ACCENT[activeBreak.stage]}`,
              boxShadow: `0 16px 48px rgba(0,0,0,0.55), 0 0 0 12px ${BREAK_ACCENT[activeBreak.stage]}22`,
              maxWidth: "60vw",
              textAlign: "center",
              animation: "barosit-toast-in 0.25s ease-out",
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: BREAK_ACCENT[activeBreak.stage],
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              {t("alerts:sittingMinutes", { min: Math.round(activeBreak.secs / 60) })}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
              {t(`coaching:breakLabel.${activeBreak.stage}`)}
            </div>
            <div style={{ fontSize: 16, opacity: 0.88 }}>
              {t(`coaching:break.${activeBreak.stage}`)}
            </div>
          </div>
        </div>
      )}
      {activeCumulative && (
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(24, 22, 20, 0.94)",
              color: "#fff",
              padding: "22px 36px",
              borderRadius: 20,
              border: "3px solid #c8964f",
              boxShadow: "0 16px 48px rgba(0,0,0,0.55), 0 0 0 12px #c8964f22",
              maxWidth: "60vw",
              textAlign: "center",
              animation: "barosit-toast-in 0.25s ease-out",
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: "#c8964f",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              {t("alerts:cumulativeBadge", { pct: Math.round(activeCumulative.ratio * 100) })}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
              {t("alerts:cumulativeFrequent", { label: t(`posture:label.${activeCumulative.postureType}`) })}
            </div>
            <div style={{ fontSize: 16, opacity: 0.88 }}>
              {t(`coaching:cumulative.${activeCumulative.postureType}`)}
            </div>
          </div>
        </div>
      )}
      {activeVariability && (
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(20, 22, 24, 0.94)",
              color: "#fff",
              padding: "22px 36px",
              borderRadius: 20,
              border: "3px solid #5b8fa8",
              boxShadow: "0 16px 48px rgba(0,0,0,0.55), 0 0 0 12px #5b8fa822",
              maxWidth: "60vw",
              textAlign: "center",
              animation: "barosit-toast-in 0.25s ease-out",
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: "#5b8fa8",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              {t("alerts:staticMinutes", { min: Math.round(activeVariability.durationSecs / 60) })}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
              {t("alerts:variabilityGood")}
            </div>
            <div style={{ fontSize: 16, opacity: 0.88 }}>
              {t("alerts:variabilityTip")}
            </div>
          </div>
        </div>
      )}
      {forceBlur && (
        // 강제 모드 풀스크린 블러 veil — click-through(pointerEvents none)라 뒤
        // 작업은 계속 가능(비잠금). 움직이면 루프가 해제, 안 움직여도 시간제한 후 해제.
        <div
          aria-live="assertive"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            background: "rgba(12, 14, 18, 0.5)",
            backdropFilter: "blur(9px)",
            WebkitBackdropFilter: "blur(9px)",
            animation: "barosit-toast-in 0.3s ease-out",
          }}
        >
          <div
            style={{
              background: "rgba(20, 24, 22, 0.92)",
              color: "#fff",
              padding: "26px 40px",
              borderRadius: 22,
              border: "3px solid #5db49f",
              boxShadow: "0 20px 56px rgba(0,0,0,0.6), 0 0 0 12px #5db49f22",
              maxWidth: "60vw",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 10 }}>
              {t("alerts:forceTitle")}
            </div>
            <div style={{ fontSize: 17, opacity: 0.9 }}>
              {t("alerts:forceMsg")}
            </div>
          </div>
        </div>
      )}
      <style>{`
        html, body { background: transparent !important; }
        @keyframes barosit-edge-pulse {
          from { filter: brightness(0.85); }
          to   { filter: brightness(1.25); }
        }
        @keyframes barosit-toast-in {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
