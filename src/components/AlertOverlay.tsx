import { useEffect, useRef, useState } from "react";
import {
  ALERT_EVENT,
  BREAK_REMINDER_EVENT,
  CUMULATIVE_ALERT_EVENT,
  VARIABILITY_ALERT_EVENT,
  loadAlertModes,
  type AlertFiredDetail,
  type AlertModes,
  type BreakReminderDetail,
  type CumulativeAlertDetail,
  type VariabilityAlertDetail,
} from "../alertConfig";
import {
  emitAlertFired,
  emitBreakReminder,
  emitCumulativeAlert,
  emitVariabilityAlert,
  hideAlertWindow,
  showAlertWindow,
} from "../ipc";
import { platform } from "../platform";
import type { PostureType } from "../pose/types";

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

// 정기 휴식 알림 — 단계별 메시지 (KOSHA H-30, Cornell 50/10, McGill 권고 기반)
const BREAK_LABEL: Record<BreakReminderDetail["stage"], string> = {
  micro: "잠깐 환기해볼까요",
  standup: "한 번 일어서볼까요",
  deep: "긴 휴식이 필요해요",
};
const BREAK_COACHING: Record<BreakReminderDetail["stage"], string> = {
  micro: "어깨 으쓱·목 좌우 회전·깊은 호흡 10초",
  standup: "1분 걷기 또는 가벼운 스트레칭",
  deep: "5분 휴식. 물 한 잔 + 창밖 응시 (20-20-20)",
};

// Phase 2 — 누적 부하 코칭 (자세 종류별)
const CUMULATIVE_COACHING: Record<PostureType, string> = {
  forward_head: "최근 30분 거북목이 잦았어요. 의식적으로 턱을 당겨볼까요",
  chin_resting: "최근 30분 턱 괴임이 잦았어요. 손을 책상 위로 두는 습관 권유",
  shoulder_tilt: "최근 30분 어깨 기울임이 잦았어요. 모니터 위치 재점검",
  slouching: "최근 30분 등 구부정이 잦았어요. 의자 깊이 들어가 앉기",
  monitor_too_close: "최근 30분 모니터 과근접이 잦았어요. 한 뼘 더 멀리",
  shoulder_asymmetry: "최근 30분 좌우 비대칭이 잦았어요. 책상 좌우 정리",
  head_roll: "최근 30분 머리 좌우 기울임이 잦았어요. 보조 모니터 정렬 확인",
};

interface ActiveAlert {
  id: number;
  detail: AlertFiredDetail;
  expiresAt: number;
}

interface ActiveBreak {
  id: number;
  detail: BreakReminderDetail;
  expiresAt: number;
}

interface ActiveCumulative {
  id: number;
  detail: CumulativeAlertDetail;
  expiresAt: number;
}

interface ActiveVariability {
  id: number;
  detail: VariabilityAlertDetail;
  expiresAt: number;
}

let audioCtx: AudioContext | null = null;
function playSoundCue(intensity: number): void {
  try {
    if (!audioCtx) {
      const Ctx =
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext || window.AudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => undefined);
    // 강도에 따라 톤 수와 길이 조정 — 약하면 한 번, 강하면 두 번
    const beeps = intensity >= 0.7 ? 2 : 1;
    for (let i = 0; i < beeps; i++) {
      const start = audioCtx.currentTime + i * 0.18;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = 660 + intensity * 220;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18 + intensity * 0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    }
  } catch {
    // 사운드 실패는 조용히 무시 — 알림의 본질이 아님
  }
}

// 강도 → 색상. 옅음(낮음)에서 진함(높음)으로.
function glowColor(intensity: number): string {
  // 노란/주황(낮음·짧음) → 진한 주황/빨강(높음·길음)
  const hue = Math.round(50 - intensity * 50); // 50 → 0
  const sat = 80;
  const light = Math.round(60 - intensity * 15); // 60 → 45
  return `hsl(${hue} ${sat}% ${light}%)`;
}

export function AlertOverlay() {
  const [modes, setModes] = useState<AlertModes>(() => loadAlertModes());
  const [active, setActive] = useState<ActiveAlert | null>(null);
  const [activeBreak, setActiveBreak] = useState<ActiveBreak | null>(null);
  const [activeCumulative, setActiveCumulative] = useState<ActiveCumulative | null>(null);
  const [activeVariability, setActiveVariability] = useState<ActiveVariability | null>(null);
  const idRef = useRef(0);
  const breakIdRef = useRef(0);
  const cumIdRef = useRef(0);
  const varIdRef = useRef(0);

  // alert_modes 가 settings에서 바뀌면 storage 이벤트로 받아 반영
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "alert_modes") return;
      setModes(loadAlertModes());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const onFire = (e: Event) => {
      const detail = (e as CustomEvent<AlertFiredDetail>).detail;
      if (!detail) return;
      const current = loadAlertModes();
      // 사운드는 사용자 제스처 없으면 막힐 수 있음 — 시도만 함 (메인 윈도우에서 처리)
      if (current.sound) playSoundCue(detail.intensity);

      // 데스크탑: 풀스크린 글로우/토스트는 alwaysOnTop alert 윈도우에 위임.
      // 메인 윈도우가 다른 앱 아래 있어도 알림이 가려지지 않음.
      if (platform.features.multiWindow) {
        if (current.edgeGlow || current.fullscreenToast) {
          showAlertWindow()
            .then(() =>
              emitAlertFired({
                posture_type: detail.postureType,
                duration_secs: detail.durationSecs,
                intensity: detail.intensity,
                coaching_message: detail.coachingMessage,
              }),
            )
            .catch(() => undefined);
          // 안전 fallback — 글로우/토스트 길이 + 여유 후 강제 hide
          const duration = 1800 + Math.round(detail.intensity * 1800) + 400;
          window.setTimeout(() => {
            hideAlertWindow().catch(() => undefined);
          }, duration);
        }
        return;
      }

      // 웹(단일 윈도우): 자기 자신이 풀스크린 렌더 (브라우저 탭 안에서만 보임)
      if (!current.edgeGlow && !current.fullscreenToast) return;
      const duration = 1600 + Math.round(detail.intensity * 1600);
      const id = ++idRef.current;
      setActive({ id, detail, expiresAt: Date.now() + duration });
      window.setTimeout(() => {
        setActive((prev) => (prev?.id === id ? null : prev));
      }, duration);
    };
    window.addEventListener(ALERT_EVENT, onFire);
    return () => window.removeEventListener(ALERT_EVENT, onFire);
  }, []);

  // 정기 휴식 알림 (Phase 1) — 단계별 토스트 + 멀티윈도우 시 alert 윈도우에 전파
  useEffect(() => {
    const onFire = (e: Event) => {
      const detail = (e as CustomEvent<BreakReminderDetail>).detail;
      if (!detail) return;

      // 단계별 토스트 노출 시간: micro 짧게, standup 중간, deep 길게
      const duration =
        detail.stage === "deep"
          ? 7000
          : detail.stage === "standup"
            ? 5000
            : 3500;

      // 멀티윈도우: standup/deep 은 alert 윈도우에도 전파 — 풀스크린 메시지로 강조
      if (
        platform.features.multiWindow &&
        (detail.stage === "standup" || detail.stage === "deep")
      ) {
        showAlertWindow()
          .then(() => emitBreakReminder({ stage: detail.stage, secs: detail.secs }))
          .catch(() => undefined);
        window.setTimeout(() => {
          hideAlertWindow().catch(() => undefined);
        }, duration + 400);
      }

      // 메인 윈도우 자체에도 in-page 토스트 (subtle, 자세 알림과 다른 시각)
      const id = ++breakIdRef.current;
      setActiveBreak({ id, detail, expiresAt: Date.now() + duration });
      window.setTimeout(() => {
        setActiveBreak((prev) => (prev?.id === id ? null : prev));
      }, duration);
    };
    window.addEventListener(BREAK_REMINDER_EVENT, onFire);
    return () => window.removeEventListener(BREAK_REMINDER_EVENT, onFire);
  }, []);

  // Phase 2 — 누적 부하 알림. 자세 알림과 break 사이 무게 — 토스트만, alert 윈도우 X.
  useEffect(() => {
    const onFire = (e: Event) => {
      const detail = (e as CustomEvent<CumulativeAlertDetail>).detail;
      if (!detail) return;
      const duration = 5000;
      if (platform.features.multiWindow) {
        showAlertWindow()
          .then(() =>
            emitCumulativeAlert({
              posture_type: detail.postureType,
              secs: detail.secs,
              ratio: detail.ratio,
            }),
          )
          .catch(() => undefined);
        window.setTimeout(() => {
          hideAlertWindow().catch(() => undefined);
        }, duration + 400);
      }
      const id = ++cumIdRef.current;
      setActiveCumulative({ id, detail, expiresAt: Date.now() + duration });
      window.setTimeout(() => {
        setActiveCumulative((prev) => (prev?.id === id ? null : prev));
      }, duration);
    };
    window.addEventListener(CUMULATIVE_ALERT_EVENT, onFire);
    return () => window.removeEventListener(CUMULATIVE_ALERT_EVENT, onFire);
  }, []);

  // Phase 3 — 자세 변동성 알림. 가장 부드러운 톤 — break micro 와 유사.
  useEffect(() => {
    const onFire = (e: Event) => {
      const detail = (e as CustomEvent<VariabilityAlertDetail>).detail;
      if (!detail) return;
      const duration = 4000;
      if (platform.features.multiWindow) {
        showAlertWindow()
          .then(() =>
            emitVariabilityAlert({
              movement_index: detail.movementIndex,
              duration_secs: detail.durationSecs,
            }),
          )
          .catch(() => undefined);
        window.setTimeout(() => {
          hideAlertWindow().catch(() => undefined);
        }, duration + 400);
      }
      const id = ++varIdRef.current;
      setActiveVariability({ id, detail, expiresAt: Date.now() + duration });
      window.setTimeout(() => {
        setActiveVariability((prev) => (prev?.id === id ? null : prev));
      }, duration);
    };
    window.addEventListener(VARIABILITY_ALERT_EVENT, onFire);
    return () => window.removeEventListener(VARIABILITY_ALERT_EVENT, onFire);
  }, []);

  if (!active && !activeBreak && !activeCumulative && !activeVariability)
    return null;

  // 자세 위반 알림 렌더 데이터 (active 가 있을 때만 사용)
  const postureRender = active
    ? (() => {
        const { detail } = active;
        const color = glowColor(detail.intensity);
        return {
          detail,
          color,
          label: POSTURE_LABEL[detail.postureType],
          coaching: detail.coachingMessage ?? COACHING[detail.postureType],
          thickness: Math.round(60 + detail.intensity * 90),
          alpha: 0.25 + detail.intensity * 0.45,
          animDur: detail.intensity >= 0.7 ? "0.9s" : "1.4s",
        };
      })()
    : null;

  // 휴식 알림 렌더 데이터 (activeBreak 가 있을 때만 사용). 운동학적으로 다른 카테고리
  // 임을 시각적으로 구분 — 자세 알림이 경고색(주황·빨강) 이라면 휴식은 회복 톤(녹·청).
  const breakRender = activeBreak
    ? {
        detail: activeBreak.detail,
        label: BREAK_LABEL[activeBreak.detail.stage],
        coaching: BREAK_COACHING[activeBreak.detail.stage],
        accent:
          activeBreak.detail.stage === "deep"
            ? "#2d8f7e"
            : activeBreak.detail.stage === "standup"
              ? "#3a9d8c"
              : "#5db49f",
        elapsedMin: Math.round(activeBreak.detail.secs / 60),
      }
    : null;

  // 누적 부하 — 자세 위반 알림과 break 의 중간 무게. 황색 톤 (주의).
  const cumulativeRender = activeCumulative
    ? {
        detail: activeCumulative.detail,
        label: POSTURE_LABEL[activeCumulative.detail.postureType],
        coaching: CUMULATIVE_COACHING[activeCumulative.detail.postureType],
        accent: "#c8964f",
        percent: Math.round(activeCumulative.detail.ratio * 100),
        secs: activeCumulative.detail.secs,
      }
    : null;

  // 변동성 — 가장 부드러운 톤 (positive). 청록색.
  const variabilityRender = activeVariability
    ? {
        detail: activeVariability.detail,
        label: "잘 유지 중이에요",
        coaching: "잠깐 어깨·목을 풀고 자세 바꿔볼까요",
        accent: "#5b8fa8",
        durationMin: Math.round(activeVariability.detail.durationSecs / 60),
      }
    : null;

  return (
    <>
      {postureRender && modes.edgeGlow && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 9998,
            boxShadow: `inset 0 0 ${postureRender.thickness}px ${Math.round(postureRender.thickness * 0.4)}px ${postureRender.color}`,
            opacity: postureRender.alpha,
            animation: `barosit-edge-pulse ${postureRender.animDur} ease-in-out infinite alternate`,
          }}
        />
      )}
      {postureRender && modes.fullscreenToast && (
        <div
          aria-live="assertive"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "rgba(20, 20, 24, 0.92)",
              color: "#fff",
              padding: "18px 28px",
              borderRadius: 16,
              border: `2px solid ${postureRender.color}`,
              boxShadow: `0 12px 36px rgba(0,0,0,0.4), 0 0 0 8px ${postureRender.color}22`,
              maxWidth: "60vw",
              textAlign: "center",
              animation: "barosit-toast-in 0.25s ease-out",
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: postureRender.color,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              {Math.round(postureRender.detail.durationSecs)}초째
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
              {postureRender.label}
            </div>
            <div style={{ fontSize: 14, opacity: 0.85 }}>
              {postureRender.coaching}
            </div>
          </div>
        </div>
      )}
      {breakRender && (
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            top: 24,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 9997,
          }}
        >
          <div
            style={{
              background: "rgba(20, 24, 22, 0.92)",
              color: "#fff",
              padding: "14px 22px",
              borderRadius: 14,
              border: `2px solid ${breakRender.accent}`,
              boxShadow: `0 8px 28px rgba(0,0,0,0.35), 0 0 0 6px ${breakRender.accent}22`,
              maxWidth: "60vw",
              textAlign: "center",
              animation: "barosit-toast-in 0.25s ease-out",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: breakRender.accent,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              {breakRender.elapsedMin}분 연속 착석
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {breakRender.label}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              {breakRender.coaching}
            </div>
          </div>
        </div>
      )}
      {cumulativeRender && (
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            top: 90,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 9996,
          }}
        >
          <div
            style={{
              background: "rgba(24, 22, 20, 0.92)",
              color: "#fff",
              padding: "14px 22px",
              borderRadius: 14,
              border: `2px solid ${cumulativeRender.accent}`,
              boxShadow: `0 8px 28px rgba(0,0,0,0.35), 0 0 0 6px ${cumulativeRender.accent}22`,
              maxWidth: "60vw",
              textAlign: "center",
              animation: "barosit-toast-in 0.25s ease-out",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: cumulativeRender.accent,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              누적 부하 · 30분 중 {cumulativeRender.percent}%
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {cumulativeRender.label} 잦음
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              {cumulativeRender.coaching}
            </div>
          </div>
        </div>
      )}
      {variabilityRender && (
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            top: 156,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 9995,
          }}
        >
          <div
            style={{
              background: "rgba(20, 22, 24, 0.92)",
              color: "#fff",
              padding: "14px 22px",
              borderRadius: 14,
              border: `2px solid ${variabilityRender.accent}`,
              boxShadow: `0 8px 28px rgba(0,0,0,0.35), 0 0 0 6px ${variabilityRender.accent}22`,
              maxWidth: "60vw",
              textAlign: "center",
              animation: "barosit-toast-in 0.25s ease-out",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: variabilityRender.accent,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              {variabilityRender.durationMin}분 정자세 유지
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {variabilityRender.label}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              {variabilityRender.coaching}
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes barosit-edge-pulse {
          from { filter: brightness(0.85); }
          to   { filter: brightness(1.2); }
        }
        @keyframes barosit-toast-in {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
