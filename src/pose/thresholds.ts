import type { PostureType } from "./types";

export interface PostureThresholds {
  /** seconds the violation must persist before alerting */
  durationSecs: number;
  /** ratio multiplier vs baseline that triggers detection */
  sensitivity: number;
}

export type ThresholdMap = Record<PostureType, PostureThresholds>;

// 실사용 피드백 기준 sensitivity 1.4 가 "보통"으로 체감됨 (1.0 은 너무 민감).
export const DEFAULT_THRESHOLDS: ThresholdMap = {
  forward_head: { durationSecs: 5, sensitivity: 1.4 },
  chin_resting: { durationSecs: 5, sensitivity: 1.4 },
  shoulder_tilt: { durationSecs: 5, sensitivity: 1.4 },
  slouching: { durationSecs: 5, sensitivity: 1.4 },
  monitor_too_close: { durationSecs: 8, sensitivity: 1.4 },
  shoulder_asymmetry: { durationSecs: 8, sensitivity: 1.4 },
  head_roll: { durationSecs: 6, sensitivity: 1.4 },
};

const STORAGE_KEY = "thresholds";

export function loadThresholds(): ThresholdMap {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_THRESHOLDS };
  try {
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

export const THRESHOLDS_CHANGED_EVENT = "barosit:thresholds-changed";

export function saveThresholds(t: ThresholdMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  // 같은 윈도우 내 컴포넌트(메인 슬라이더 ↔ 드로어 슬라이더)도 동기화
  try {
    window.dispatchEvent(
      new CustomEvent(THRESHOLDS_CHANGED_EVENT, { detail: t }),
    );
  } catch {
    /* noop */
  }
}

/**
 * 사용자가 "잘못된 알림"으로 신고했을 때 해당 자세 종류의 sensitivity를 살짝 완화.
 * 매 신고당 +0.1 (덜 민감해짐), 최대 2.0 까지.
 */
export function reportFalseAlarm(type: PostureType): ThresholdMap {
  const current = loadThresholds();
  const newSensitivity = Math.min(2.0, current[type].sensitivity + 0.1);
  const updated: ThresholdMap = {
    ...current,
    [type]: { ...current[type], sensitivity: newSensitivity },
  };
  saveThresholds(updated);
  return updated;
}
