// 위반 알림 강화 — 4가지 모드 다중 선택. 사용자는 일에 집중하다 미니바를
// 놓치므로 시야를 더 강하게 끄는 알림을 옵션으로 켤 수 있다.

import type { PostureType } from "./pose/types";
import type { BreakFiredEvent } from "./pose/breakTracker";
import type { CumulativeFiredEvent } from "./pose/cumulativeLoadTracker";
import type { VariabilityFiredEvent } from "./pose/variabilityTracker";
import type { NudgeKind } from "./pose/complianceTracker";

export interface AlertModes {
  /** 화면 가장자리 펄스 글로우 (default On) */
  edgeGlow: boolean;
  /** 위젯 일시 확장 (default On, multiWindow 환경) */
  widgetExpand: boolean;
  /** 풀스크린 중앙 토스트 (default Off) */
  fullscreenToast: boolean;
  /** 사운드 큐 (default Off) */
  sound: boolean;
  /** 집중모드 — 휴식 알림을 무시하면 더 단호한(비잠금) 에스컬레이션 프롬프트.
   *  근거(§2-1)상 강제성은 옵트인 권장이나, 본 구현은 화면을 잠그지 않는
   *  8초 자동소멸 카드(하드스톱 아님)라 제품 결정상 기본 On 으로 둔다.
   *  사용자가 설정에서 끌 수 있음. */
  focusMode: boolean;
  /** 강제 모드(옵트인, 기본 Off) — 휴식·변동성 넛지를 무시하면 화면을 흐리게
   *  덮어 움직임을 강하게 유도. 화면 잠금이 아니라 **click-through 반투명 블러**라
   *  뒤 작업은 계속 가능(비잠금). 움직이면 즉시 걷히고, 안 움직여도 자동 시간제한
   *  후 사라짐 → 절대 갇히지 않음. 근거(§2-1) 강제성=옵트인 권장에 정합. */
  forceMode: boolean;
}

export const DEFAULT_ALERT_MODES: AlertModes = {
  edgeGlow: true,
  widgetExpand: true,
  fullscreenToast: false,
  sound: false,
  focusMode: true,
  forceMode: false,
};

const STORAGE_KEY = "alert_modes";

export function loadAlertModes(): AlertModes {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_ALERT_MODES };
  try {
    return { ...DEFAULT_ALERT_MODES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_ALERT_MODES };
  }
}

export function saveAlertModes(m: AlertModes): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
}

// 점진 강도 — duration_secs를 0..1로 정규화.
// 0-15s: 0.3 (옅음), 15-30s: 0.55, 30-60s: 0.75, 60s+: 1.0
export function intensityFromDuration(durationSecs: number): number {
  if (durationSecs >= 60) return 1.0;
  if (durationSecs >= 30) return 0.75;
  if (durationSecs >= 15) return 0.55;
  return 0.3;
}

export interface AlertFiredDetail {
  postureType: PostureType;
  durationSecs: number;
  intensity: number;
  coachingMessage: string | null;
}

export const ALERT_EVENT = "barosit:posture-alert-fired";

export function dispatchAlertFired(detail: AlertFiredDetail): void {
  window.dispatchEvent(new CustomEvent(ALERT_EVENT, { detail }));
}

// ─── 정기 휴식 알림 (Phase 1 — Scheduled Recovery) ────────────────────────────

export interface BreakReminderDetail {
  stage: BreakFiredEvent["stage"];
  /** 연속 착석 누적 시간(초) — 알림 시점 기준 */
  secs: number;
}

export const BREAK_REMINDER_EVENT = "barosit:break-reminder";

export function dispatchBreakReminder(event: BreakFiredEvent): void {
  const detail: BreakReminderDetail = { stage: event.stage, secs: event.secs };
  window.dispatchEvent(
    new CustomEvent(BREAK_REMINDER_EVENT, { detail }),
  );
}

// ─── Phase 2 — 누적 부하 알림 ─────────────────────────────────────────────────

export interface CumulativeAlertDetail {
  postureType: PostureType;
  /** 누적 위반 시간(초) */
  secs: number;
  /** 윈도우 대비 비율 (0.25 = 25%) */
  ratio: number;
}

export const CUMULATIVE_ALERT_EVENT = "barosit:cumulative-alert";

export function dispatchCumulativeAlert(event: CumulativeFiredEvent): void {
  const detail: CumulativeAlertDetail = {
    postureType: event.type,
    secs: event.secs,
    ratio: event.ratio,
  };
  window.dispatchEvent(
    new CustomEvent(CUMULATIVE_ALERT_EVENT, { detail }),
  );
}

// ─── Phase 3 — 자세 변동성 알림 ───────────────────────────────────────────────

export interface VariabilityAlertDetail {
  movementIndex: number;
  durationSecs: number;
}

export const VARIABILITY_ALERT_EVENT = "barosit:variability-alert";

export function dispatchVariabilityAlert(event: VariabilityFiredEvent): void {
  const detail: VariabilityAlertDetail = {
    movementIndex: event.movementIndex,
    durationSecs: event.durationSecs,
  };
  window.dispatchEvent(
    new CustomEvent(VARIABILITY_ALERT_EVENT, { detail }),
  );
}

// ─── Phase 5 — 알림 준수 보상 (긍정 강화) ─────────────────────────────────────
// 근거: 보상 > 처벌(자기결정이론). 알림을 따랐을 때만 긍정 피드백 + 점수 보너스.

/** 준수 1건당 부여하는 점수 보너스. 스트레칭 보너스(3~5)보다 작게. */
export const COMPLIANCE_REWARD_POINTS = 2;

export interface ComplianceRewardDetail {
  kind: NudgeKind;
  points: number;
}

export const COMPLIANCE_REWARD_EVENT = "barosit:nudge-complied";

export function dispatchComplianceReward(kind: NudgeKind): void {
  // 점수 시스템은 기존 `posture-bonus` 이벤트를 듣는다 → 점수 가산.
  window.dispatchEvent(
    new CustomEvent("posture-bonus", { detail: COMPLIANCE_REWARD_POINTS }),
  );
  // 긍정 토스트용 별도 이벤트.
  const detail: ComplianceRewardDetail = {
    kind,
    points: COMPLIANCE_REWARD_POINTS,
  };
  window.dispatchEvent(new CustomEvent(COMPLIANCE_REWARD_EVENT, { detail }));
}

// ─── 집중모드 에스컬레이션 (옵트인, 비잠금) ───────────────────────────────────
// 근거(§2-1): 강제는 단기 순응↑이나 장기 이탈/해악↑ → 기본 Off, 옵트인만. 화면 잠금
// 같은 하드 강제가 아니라 "단호하지만 닫을 수 있는" 프롬프트로 구현한다.

export interface EscalationDetail {
  kind: NudgeKind;
}

export const ESCALATION_ALERT_EVENT = "barosit:escalation-alert";

export function dispatchEscalationAlert(kind: NudgeKind): void {
  const detail: EscalationDetail = { kind };
  window.dispatchEvent(new CustomEvent(ESCALATION_ALERT_EVENT, { detail }));
}

// ─── 강제 모드 블러 (옵트인, 비잠금) ──────────────────────────────────────────
// 무시된 넛지에 대해 화면을 흐리게 덮는 click-through 블러. 루프가 lifecycle 을
// 소유하고(움직임/시간제한 시 active=false) UI(AlertOverlay/AlertWindow)는 이
// 이벤트만 듣고 켜고 끈다. 데스크톱 풀스크린 브리지는 AlertOverlay 가 담당.

export interface ForceBlurDetail {
  active: boolean;
}

export const FORCE_BLUR_EVENT = "barosit:force-blur";

export function dispatchForceBlur(active: boolean): void {
  const detail: ForceBlurDetail = { active };
  window.dispatchEvent(new CustomEvent(FORCE_BLUR_EVENT, { detail }));
}
