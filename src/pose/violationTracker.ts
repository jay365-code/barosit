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
