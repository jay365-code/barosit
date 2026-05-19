import type { PostureType } from "./types";

// 순서 = 화면 표시 우선순위. stable Set 이 이 순서로 build 되어 displayViolations[0]
// 에 첫째가 노출됨. 더 구체적·국소적인 자세 (턱괴임) 가 일반적 자세 (거북목) 보다
// 사용자 의도 분류에 정확하므로 앞에 둔다.
const ALL_TYPES: PostureType[] = [
  "chin_resting",
  "monitor_too_close",
  "forward_head",
  "slouching",
  "shoulder_tilt",
  "shoulder_asymmetry",
  "head_roll",
];

/**
 * 매 분석 프레임의 원시 위반 set을 받아 시간 기반 안정화 후 안정된 위반 set과
 * 각 위반의 지속 시간(초)을 반환한다.
 *
 * 정책 (사용자 직관에 맞춤):
 *   - 진입(비정상 발동): raw 신호가 `enterHoldMs`(기본 3초) 연속 지속되어야 stable
 *   - 이탈(정상 회복): raw 신호가 `exitDebounceMs`(기본 600ms) 동안 끊기면 즉시 해제
 *   - 짧은 끊김(<exitDebounceMs)은 무시 — 노이즈 보호
 *
 * EMA·히스테리시스 기반에서 직접 시간 기반으로 단순화. 자세 변화가 명확히
 * 지속될 때만 발동, 회복은 빠르게 — 사용자 체감 핑퐁 진동 차단.
 */
export class ViolationSmoother {
  /** raw 신호가 처음 잡힌 시각 — 진입 hold 카운트용 */
  private firstSeenAt: Partial<Record<PostureType, number>> = {};
  /** raw 신호가 마지막으로 끊긴 시각 — 이탈 debounce 카운트용 */
  private firstClearAt: Partial<Record<PostureType, number>> = {};
  /** stable 진입 상태 */
  private active: Partial<Record<PostureType, { enteredAt: number }>> = {};
  /** 위반에서 해제된 마지막 시점 — 회복 보너스 판단용 */
  private lastClearedAt = 0;
  /** 모든 위반 해제 상태가 시작된 시점 — good streak 계산용 */
  private allGoodSince = Date.now();

  private readonly enterHoldMs: number;
  private readonly exitDebounceMs: number;

  constructor(opts?: {
    enterHoldMs?: number;
    exitDebounceMs?: number;
  }) {
    this.enterHoldMs = opts?.enterHoldMs ?? 3000;
    this.exitDebounceMs = opts?.exitDebounceMs ?? 600;
  }

  push(raw: Set<PostureType>, now = Date.now()): {
    stable: Set<PostureType>;
    durations: Record<PostureType, number>;
    emas: Record<PostureType, number>;
    /** 모든 위반이 해제된 후 경과 시간(초). 위반 중이면 0. */
    goodStreakSecs: number;
    /** 직전 위반 해제로부터 경과 시간(초). 회복 보너스 윈도우 판정용. */
    secsSinceLastClear: number;
  } {
    const stable = new Set<PostureType>();
    const durations: Record<PostureType, number> = {
      forward_head: 0,
      chin_resting: 0,
      shoulder_tilt: 0,
      slouching: 0,
      monitor_too_close: 0,
      shoulder_asymmetry: 0,
      head_roll: 0,
    };
    const emas: Record<PostureType, number> = {
      forward_head: 0,
      chin_resting: 0,
      shoulder_tilt: 0,
      slouching: 0,
      monitor_too_close: 0,
      shoulder_asymmetry: 0,
      head_roll: 0,
    };

    for (const t of ALL_TYPES) {
      const present = raw.has(t);
      const wasActive = !!this.active[t];

      if (present) {
        // raw 신호 잡힘 — 진입 시계 갱신
        if (this.firstSeenAt[t] === undefined) {
          this.firstSeenAt[t] = now;
        }
        this.firstClearAt[t] = undefined;

        if (wasActive) {
          stable.add(t);
          durations[t] = (now - this.active[t]!.enteredAt) / 1000;
          emas[t] = 1;
        } else {
          // hold 시간 만족하면 진입
          const seenFor = now - (this.firstSeenAt[t] ?? now);
          if (seenFor >= this.enterHoldMs) {
            this.active[t] = { enteredAt: now };
            stable.add(t);
            durations[t] = 0;
            emas[t] = 1;
          } else {
            // 아직 진입 안 함 — 진행률을 emas에 노출 (디버그·시각화)
            emas[t] = seenFor / this.enterHoldMs;
          }
        }
      } else {
        // raw 신호 없음 — 이탈 시계 갱신
        if (this.firstClearAt[t] === undefined) {
          this.firstClearAt[t] = now;
        }
        this.firstSeenAt[t] = undefined;

        if (wasActive) {
          const clearedFor = now - (this.firstClearAt[t] ?? now);
          if (clearedFor >= this.exitDebounceMs) {
            // 이탈 — 정상 복귀
            delete this.active[t];
            this.lastClearedAt = now;
            emas[t] = 0;
          } else {
            // 짧은 끊김은 활성 유지 (노이즈)
            stable.add(t);
            durations[t] = (now - this.active[t]!.enteredAt) / 1000;
            emas[t] = 1;
          }
        } else {
          emas[t] = 0;
        }
      }
    }

    // good streak: 모든 위반이 해제된 상태일 때만 갱신
    if (Object.keys(this.active).length === 0) {
      if (this.lastClearedAt > this.allGoodSince) {
        this.allGoodSince = this.lastClearedAt;
      }
    } else {
      this.allGoodSince = now;
    }

    return {
      stable,
      durations,
      emas,
      goodStreakSecs: Math.max(0, (now - this.allGoodSince) / 1000),
      secsSinceLastClear:
        this.lastClearedAt === 0
          ? Infinity
          : (now - this.lastClearedAt) / 1000,
    };
  }

  reset(): void {
    this.firstSeenAt = {};
    this.firstClearAt = {};
    this.active = {};
    this.lastClearedAt = 0;
    this.allGoodSince = Date.now();
  }
}
