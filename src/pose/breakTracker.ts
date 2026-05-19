/**
 * 정기 휴식 알림 추적기 (Phase 1 — Scheduled Recovery).
 *
 * 운동학·물리치료 권고에 기반한 연속 착석 시간 추적:
 *   - KOSHA GUIDE H-30: 50분 작업 + 10분 휴식
 *   - Cornell 50/10, Hedge 20-8-2
 *   - McGill: "The best posture is the next posture"
 *
 * 자세 위반 알림과는 별개 카테고리. 자세 점수에 영향 주지 않음.
 */

export type BreakStage = "none" | "micro" | "standup" | "deep";

export interface BreakConfig {
  /** 가벼운 마이크로 무브먼트 권유까지의 연속 착석 분 (기본 30) */
  microMinutes: number;
  /** 일어서기 권유까지의 연속 착석 분 (기본 50, KOSHA H-30 기준) */
  standupMinutes: number;
  /** 강한 휴식 권유까지의 연속 착석 분 (기본 120) */
  deepMinutes: number;
  enabled: { micro: boolean; standup: boolean; deep: boolean };
}

export const DEFAULT_BREAK_CONFIG: BreakConfig = {
  microMinutes: 30,
  standupMinutes: 50,
  deepMinutes: 120,
  enabled: { micro: true, standup: true, deep: true },
};

export interface BreakStatus {
  /** 연속 착석 누적 시간(초). 자리비움 또는 깊은 휴식 5분+로 리셋. */
  secsSeated: number;
  /** 현재 발사된 단계. 단계는 micro → standup → deep 순으로만 진행. */
  stage: BreakStage;
  /** 단계가 발사된 시각(ms epoch). UI 표시·재알림 타이밍에 사용. */
  stageFiredAt: number | null;
}

export interface BreakFiredEvent {
  stage: Exclude<BreakStage, "none">;
  secs: number;
}

/** 자리비움 누적이 이 이상이면 secsSeated 리셋 (일어났다 본 것으로 간주) */
const ABSENCE_RESET_SECS = 5 * 60;
/** 깊은 휴식(isResting) 누적이 이 이상이면 secsSeated 리셋 (충분한 휴식으로 간주) */
const RESTING_RESET_SECS = 5 * 60;

export class BreakTracker {
  private secsSeated = 0;
  private secsAbsent = 0;
  private secsResting = 0;
  private stage: BreakStage = "none";
  private stageFiredAt: number | null = null;
  private lastPushAt: number | null = null;

  /**
   * 매 프레임 호출. dt 는 lastPushAt 기준 자동 계산 — 호출 빈도와 무관하게
   * 실시간 누적이 보장됨 (15Hz 든 1Hz 든 동일하게 동작).
   *
   * 반환값:
   *   - status: 현재 누적 상태 (UI 표시용)
   *   - fired: 이번 push 에서 새로 단계 진입했으면 이벤트, 아니면 null (1회성)
   */
  push(
    now: number,
    personPresent: boolean,
    isResting: boolean,
    stretchFired: boolean,
    config: BreakConfig,
  ): { status: BreakStatus; fired: BreakFiredEvent | null } {
    const dt =
      this.lastPushAt == null
        ? 0
        : Math.max(0, (now - this.lastPushAt) / 1000);
    this.lastPushAt = now;

    // 첫 호출 또는 dt 가 비정상적으로 크면(>30초, 슬립 후 복귀 등) 누적 스킵.
    // 슬립 동안 안 앉아 있던 것으로 봐 정확도 우선.
    const safeDt = dt > 30 ? 0 : dt;

    if (!personPresent) {
      this.secsAbsent += safeDt;
      this.secsResting = 0;
    } else if (isResting) {
      this.secsResting += safeDt;
      this.secsAbsent = 0;
    } else {
      this.secsAbsent = 0;
      this.secsResting = 0;
      this.secsSeated += safeDt;
    }

    // 자리비움/장시간 휴식 → 누적 리셋. 일어났다 본 것으로 간주.
    if (
      this.secsAbsent >= ABSENCE_RESET_SECS ||
      this.secsResting >= RESTING_RESET_SECS
    ) {
      this.reset();
      return {
        status: { secsSeated: 0, stage: "none", stageFiredAt: null },
        fired: null,
      };
    }

    // 스트레치 감지 → 현재 단계 dismiss. 다음 단계로 진행 가능.
    // 누적 시간 자체는 유지 (스트레치 한 번으로 timer 초기화하면 사용자가 회피 가능).
    if (stretchFired && this.stage !== "none") {
      this.stage = "none";
      this.stageFiredAt = null;
    }

    // 단계 진행 — 높은 단계부터 검사. micro → standup → deep 으로만.
    let fired: BreakFiredEvent | null = null;
    const microThresh = config.microMinutes * 60;
    const standupThresh = config.standupMinutes * 60;
    const deepThresh = config.deepMinutes * 60;

    if (
      config.enabled.deep &&
      this.secsSeated >= deepThresh &&
      this.stage !== "deep"
    ) {
      this.stage = "deep";
      this.stageFiredAt = now;
      fired = { stage: "deep", secs: Math.floor(this.secsSeated) };
    } else if (
      config.enabled.standup &&
      this.secsSeated >= standupThresh &&
      this.stage !== "standup" &&
      this.stage !== "deep"
    ) {
      this.stage = "standup";
      this.stageFiredAt = now;
      fired = { stage: "standup", secs: Math.floor(this.secsSeated) };
    } else if (
      config.enabled.micro &&
      this.secsSeated >= microThresh &&
      this.stage === "none"
    ) {
      this.stage = "micro";
      this.stageFiredAt = now;
      fired = { stage: "micro", secs: Math.floor(this.secsSeated) };
    }

    return {
      status: {
        secsSeated: this.secsSeated,
        stage: this.stage,
        stageFiredAt: this.stageFiredAt,
      },
      fired,
    };
  }

  reset(): void {
    this.secsSeated = 0;
    this.secsAbsent = 0;
    this.secsResting = 0;
    this.stage = "none";
    this.stageFiredAt = null;
    // lastPushAt 은 의도적으로 유지 — dt 연속성 보존
  }

  snapshot(): BreakStatus {
    return {
      secsSeated: this.secsSeated,
      stage: this.stage,
      stageFiredAt: this.stageFiredAt,
    };
  }
}

// ─── localStorage 저장·로드 ─────────────────────────────────────────────────

const STORAGE_KEY = "break_config";
export const BREAK_CONFIG_CHANGED_EVENT = "barosit:break-config-changed";

export function loadBreakConfig(): BreakConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_BREAK_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<BreakConfig>;
    return {
      ...DEFAULT_BREAK_CONFIG,
      ...parsed,
      enabled: {
        ...DEFAULT_BREAK_CONFIG.enabled,
        ...(parsed.enabled ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_BREAK_CONFIG };
  }
}

export function saveBreakConfig(c: BreakConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  try {
    window.dispatchEvent(
      new CustomEvent(BREAK_CONFIG_CHANGED_EVENT, { detail: c }),
    );
  } catch {
    /* noop */
  }
}
