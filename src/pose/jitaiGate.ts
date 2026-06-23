/**
 * JITAI 발사 게이트 (Just-In-Time Adaptive Intervention) — Phase 6.
 *
 * 근거(docs/posture-nudge-design.md §2-3): 맥락 인식(센서 추론) 전달이 고정 스케줄보다
 * 순응도 유지에 우월(pooled OR 1.71). 알림 "개수"는 예측력 없음 — 중요한 건 타이밍.
 * → 휴식 알림이 발사 시점에 도달해도 즉시 쏘지 않고, 카메라가 감지한
 *    "방해 가능 순간"(고개 돌림·움직임 등 자연스러운 주의 전환)까지 잠깐 보류했다가
 *    그때 전달한다. 단, 좋은 순간이 maxHold 안에 없으면 놓치지 않도록 그냥 발사한다.
 *
 * 변동성 알림에는 쓰지 않는다 — 그 트리거 자체가 "정지"라, 보류 중 사용자가 움직이면
 * 알림이 무의미해지기 때문(휴식 알림 전용).
 */

export interface JitaiConfig {
  enabled: boolean;
  /** 좋은 순간을 기다리는 최대 보류 시간(초). 초과하면 그냥 발사. 기본 90. */
  maxHoldSecs: number;
}

export const DEFAULT_JITAI_CONFIG: JitaiConfig = {
  enabled: true,
  maxHoldSecs: 90,
};

/** 고개 돌림 임계(rad, ~15°). baseline 대비 yaw 가 이보다 크면 시선이 작업에서
 *  벗어난 "방해 가능 순간"으로 본다(analyzer 의 FREE_YAW deadzone 과 동일 값). */
export const JITAI_INTERRUPTIBLE_YAW_RAD = 0.26;

export interface JitaiSignals {
  /** 지금이 방해해도 되는 순간인가(고개 돌림·움직임·전환 등). */
  interruptible: boolean;
}

/** 보류했다가 좋은 순간에 payload 를 방출하는 게이트. T 는 발사 페이로드 타입. */
export class JitaiGate<T> {
  private pending: { payload: T; dueAt: number } | null = null;

  /** 발사 시점이 됐을 때 즉시 보내지 않고 보류. 이미 보류 중이면 최신으로 교체. */
  hold(payload: T, now: number): void {
    this.pending = { payload, dueAt: now };
  }

  /**
   * 매 프레임 호출. 방해 가능 순간이거나 maxHold 초과면 payload 를 방출한다.
   * 비활성(enabled=false)이면 즉시 방출(고정 스케줄 동작).
   * @returns 방출할 payload, 없으면 null.
   */
  push(now: number, signals: JitaiSignals, config: JitaiConfig): T | null {
    if (!this.pending) return null;
    if (!config.enabled) return this.release();

    const heldSecs = (now - this.pending.dueAt) / 1000;
    if (signals.interruptible || heldSecs >= config.maxHoldSecs) {
      return this.release();
    }
    return null;
  }

  private release(): T | null {
    if (!this.pending) return null;
    const { payload } = this.pending;
    this.pending = null;
    return payload;
  }

  get isPending(): boolean {
    return this.pending !== null;
  }

  /** 보류 중인 알림을 폐기(사용자가 이미 휴식을 취해 알림이 무의미해진 경우 등). */
  reset(): void {
    this.pending = null;
  }
}
