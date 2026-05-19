// 풀스크린 alert 윈도우 — alwaysOnTop + click-through.
// 메인 윈도우의 AlertOverlay 가 발사 시 showAlertWindow + Tauri event emit 하면
// 이 윈도우가 받아 풀스크린으로 글로우/토스트를 그리고 일정 시간 후 자동 hide.

import { useEffect, useRef, useState } from "react";
import { loadAlertModes, type AlertModes } from "../alertConfig";
import {
  hideAlertWindow,
  onAlertFired,
  onBreakReminder,
  onCumulativeAlert,
  onVariabilityAlert,
} from "../ipc";
import type { PostureType } from "../pose/types";
import type { BreakStage } from "../pose/breakTracker";

const POSTURE_LABEL: Record<PostureType, string> = {
  forward_head: "거북목",
  chin_resting: "턱 괴임",
  shoulder_tilt: "어깨 기울임",
  slouching: "등 구부정",
  monitor_too_close: "모니터가 너무 가까워요",
  shoulder_asymmetry: "어깨 비대칭",
  head_roll: "머리 좌우 기울임",
};

const COACHING: Record<PostureType, string> = {
  forward_head: "턱을 살짝 당겨볼까요",
  chin_resting: "손을 책상 위로 내려볼까요",
  shoulder_tilt: "어깨를 수평으로",
  slouching: "등을 펴고 가슴을 열어요",
  monitor_too_close: "모니터에서 한 뼘 더 멀어져볼까요",
  shoulder_asymmetry: "양쪽 어깨에 고르게 힘을 빼볼까요",
  head_roll: "머리를 수직으로 세워볼까요",
};

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

const BREAK_LABEL: Record<Exclude<BreakStage, "none">, string> = {
  micro: "잠깐 환기해볼까요",
  standup: "한 번 일어서볼까요",
  deep: "긴 휴식이 필요해요",
};
const BREAK_COACHING: Record<Exclude<BreakStage, "none">, string> = {
  micro: "어깨 으쓱·목 좌우 회전·깊은 호흡 10초",
  standup: "1분 걷기 또는 가벼운 스트레칭",
  deep: "5분 휴식. 물 한 잔 + 창밖 응시 (20-20-20)",
};
const BREAK_ACCENT: Record<Exclude<BreakStage, "none">, string> = {
  micro: "#5db49f",
  standup: "#3a9d8c",
  deep: "#2d8f7e",
};

const CUMULATIVE_COACHING: Record<PostureType, string> = {
  forward_head: "최근 30분 거북목이 잦았어요. 의식적으로 턱을 당겨볼까요",
  chin_resting: "최근 30분 턱 괴임이 잦았어요. 손을 책상 위로 두는 습관 권유",
  shoulder_tilt: "최근 30분 어깨 기울임이 잦았어요. 모니터 위치 재점검",
  slouching: "최근 30분 등 구부정이 잦았어요. 의자 깊이 들어가 앉기",
  monitor_too_close: "최근 30분 모니터 과근접이 잦았어요. 한 뼘 더 멀리",
  shoulder_asymmetry: "최근 30분 좌우 비대칭이 잦았어요. 책상 좌우 정리",
  head_roll: "최근 30분 머리 좌우 기울임이 잦었어요. 보조 모니터 정렬 확인",
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
  const [modes, setModes] = useState<AlertModes>(() => loadAlertModes());
  const [active, setActive] = useState<Active | null>(null);
  const [activeBreak, setActiveBreak] = useState<ActiveBreak | null>(null);
  const [activeCumulative, setActiveCumulative] = useState<ActiveCumulative | null>(null);
  const [activeVariability, setActiveVariability] = useState<ActiveVariability | null>(null);
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

  // 자세 위반 표시용 파생값
  const posture = active
    ? {
        color: glowColor(active.intensity),
        label: POSTURE_LABEL[active.postureType],
        coaching: active.coachingMessage ?? COACHING[active.postureType],
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
              {Math.round(active.durationSecs)}초째
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
              {Math.round(activeBreak.secs / 60)}분 연속 착석
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
              {BREAK_LABEL[activeBreak.stage]}
            </div>
            <div style={{ fontSize: 16, opacity: 0.88 }}>
              {BREAK_COACHING[activeBreak.stage]}
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
              누적 부하 · 30분 중 {Math.round(activeCumulative.ratio * 100)}%
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
              {POSTURE_LABEL[activeCumulative.postureType]} 잦음
            </div>
            <div style={{ fontSize: 16, opacity: 0.88 }}>
              {CUMULATIVE_COACHING[activeCumulative.postureType]}
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
              {Math.round(activeVariability.durationSecs / 60)}분 정자세 유지
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
              잘 유지 중이에요
            </div>
            <div style={{ fontSize: 16, opacity: 0.88 }}>
              잠깐 어깨·목을 풀고 자세 바꿔볼까요
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
