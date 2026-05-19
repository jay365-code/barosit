import type { PostureType } from "./types";
import type { ThresholdMap } from "./thresholds";

export interface ViolationEvent {
  type: PostureType;
  startedAt: number;
  durationSecs: number;
}

interface OngoingViolation {
  startedAt: number;
  alerted: boolean;
  lastAlertAt: number;
}

const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Tracks per-posture violation duration and decides when to fire an alert.
 *
 * - A violation must persist for at least `thresholds[type].durationSecs`
 *   before its first alert.
 * - After alerting, the same violation type is suppressed for ALERT_COOLDOWN_MS.
 * - If the violation clears for a full second, the timer resets.
 */
export class ViolationTracker {
  private active: Partial<Record<PostureType, OngoingViolation>> = {};

  update(
    activeViolations: Set<PostureType>,
    thresholds: ThresholdMap,
    now = Date.now(),
  ): ViolationEvent[] {
    const fired: ViolationEvent[] = [];

    for (const type of Object.keys(this.active) as PostureType[]) {
      if (!activeViolations.has(type)) {
        delete this.active[type];
      }
    }

    for (const type of activeViolations) {
      const existing = this.active[type];
      const cooldownMs = thresholds[type].durationSecs * 1000;
      if (!existing) {
        this.active[type] = {
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
        type,
        startedAt: existing.startedAt,
        durationSecs: Math.round(elapsed / 1000),
      });
    }

    return fired;
  }

  /** True if any currently-active violation has already fired its first alert. */
  hasAlertedActive(): boolean {
    return Object.values(this.active).some((v) => v?.alerted === true);
  }

  reset(): void {
    this.active = {};
  }
}
