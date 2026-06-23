import type { PostureType } from "./types";
import type { ThresholdMap } from "./thresholds";

export interface ViolationEvent {
  id: string;
  type: PostureType;
  startedAt: number;
  durationSecs: number;
}

interface OngoingViolation {
  id: string;
  startedAt: number;
  alerted: boolean;
  lastAlertAt: number;
}

const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * 움직임 인지 완화 (movement-aware relaxation).
 *
 * 근거(docs/posture-nudge-design.md): "변동성을 벌하지 말고 보상하라". 좋은 자세든
 * 나쁜 자세든 *오래 고정*이 문제이고, 잠깐 다른 자세를 지나가는 것은 건강한 변동성이다.
 * 최근 활발히 움직인(변동성 높은) 사용자는 잠깐 나쁜 모양을 지나가도 봐주고, 한 자세에
 * 정말 눌러앉았을 때(움직임 낮음)만 정상 임계로 알람하도록 위반 durationSecs 를 늘린다.
 *
 * @param movementIndex 변동성 트래커의 movement index (높을수록 활발)
 * @param variabilityThreshold 변동성 알림 임계(이 값 미만이면 "정지"로 판정)
 * @returns durationSecs 에 곱할 배수 1.0(정지)~2.0(임계의 2배 이상으로 활발).
 */
export function computeMovementRelaxation(
  movementIndex: number,
  variabilityThreshold: number,
): number {
  if (variabilityThreshold <= 0) return 1;
  const over = movementIndex / variabilityThreshold - 1; // 임계 대비 초과분
  return 1 + Math.min(Math.max(over, 0), 1); // 1.0 ~ 2.0
}

/** durationSecs 에만 배수를 적용한 threshold map 반환(sensitivity 등은 보존). */
export function relaxThresholdDurations(
  thresholds: ThresholdMap,
  multiplier: number,
): ThresholdMap {
  if (multiplier === 1) return thresholds;
  const out = {} as ThresholdMap;
  for (const key of Object.keys(thresholds) as PostureType[]) {
    out[key] = {
      ...thresholds[key],
      durationSecs: thresholds[key].durationSecs * multiplier,
    };
  }
  return out;
}

/**
 * Tracks per-posture violation duration and decides when to fire an alert.
 *
 * - A violation must persist for at least `thresholds[type].durationSecs`
 *   before its first alert.
 * - After alerting, the same violation type is suppressed for ALERT_COOLDOWN_MS.
 * - If the violation clears for a full second, the timer resets.
 * - Tracks total elapsed duration when a violation clears for backtracking.
 */
export class ViolationTracker {
  private active: Partial<Record<PostureType, OngoingViolation>> = {};
  private recentCleared: ViolationEvent[] = [];

  update(
    activeViolations: Set<PostureType>,
    thresholds: ThresholdMap,
    now = Date.now(),
  ): ViolationEvent[] {
    const fired: ViolationEvent[] = [];
    this.recentCleared = []; // reset every update cycle

    // 1. Detect cleared violations and calculate their actual total duration
    for (const type of Object.keys(this.active) as PostureType[]) {
      if (!activeViolations.has(type)) {
        const existing = this.active[type];
        if (existing && existing.alerted) {
          const totalElapsed = now - existing.startedAt;
          this.recentCleared.push({
            id: existing.id,
            type,
            startedAt: existing.startedAt,
            durationSecs: Math.round(totalElapsed / 1000),
          });
        }
        delete this.active[type];
      }
    }

    // 2. Track currently ongoing active violations
    for (const type of activeViolations) {
      const existing = this.active[type];
      const cooldownMs = thresholds[type].durationSecs * 1000;
      if (!existing) {
        this.active[type] = {
          id: `${now}-${type}`,
          startedAt: now,
          alerted: false,
          lastAlertAt: 0,
        };
        continue;
      }
      const elapsed = now - existing.startedAt;
      if (elapsed < cooldownMs) continue;
      const sinceLastAlert = now - existing.lastAlertAt;
      if (existing.alerted && sinceLastAlert < ALERT_COOLDOWN_MS) continue;

      existing.alerted = true;
      existing.lastAlertAt = now;
      fired.push({
        id: existing.id,
        type,
        startedAt: existing.startedAt,
        durationSecs: Math.round(elapsed / 1000),
      });
    }

    return fired;
  }

  /** Retrieves the violations that were cleared in the most recent update, then flushes the buffer. */
  getAndClearRecentCleared(): ViolationEvent[] {
    const cleared = [...this.recentCleared];
    this.recentCleared = [];
    return cleared;
  }

  /** True if any currently-active violation has already fired its first alert. */
  hasAlertedActive(): boolean {
    return Object.values(this.active).some((v) => v?.alerted === true);
  }

  reset(): void {
    this.active = {};
    this.recentCleared = [];
  }
}
