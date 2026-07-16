/**
 * 정기 휴식 알림 추적기 (Phase 1 — Scheduled Recovery).
 *
 * 운동학·물리치료 권고에 기반한 연속 착석 시간 추적:
 *   - KOSHA GUIDE H-30: 50분 작업 + 10분 휴식
 *   - Cornell 50/10, Hedge 20-8-2
 *   - McGill: "The best posture is the next posture"
 *
 * 자세 위반 알림과는 별개 카테고리. 자세 점수에 영향 주지 않음.
 *
 * 시간 장부의 두 가지 견고화 장치:
 *   1. 부재 유예 버퍼 — 미검출을 즉시 부재로 배정하지 않고 보류. 유예
 *      (PRESENCE_GRACE_SECS) 내 복귀면 착석으로 소급 인정(검출 노이즈),
 *      초과면 이탈 시작 시각부터 부재로 소급 확정. 어깨 visibility 진동이
 *      착석 시계를 실제보다 느리게 만들던 문제 + 알림 발사 후 가짜 부재가
 *      움직임 목표(60초)를 오염시켜 시계를 조용히 리셋하던 문제를 함께 해결.
 *   2. localStorage 영속화(옵트인) — reload(Cmd+R·메모리 회수·watchdog)에도
 *      시계가 살아남고, 메인 창·위젯 창 두 엔진이 같은 스냅샷을 이어받아
 *      단일 시계처럼 동작한다.
 */

import { PRESENCE_GRACE_SECS } from "./presenceStabilizer";

export type BreakStage = "none" | "micro" | "standup" | "deep";

export interface BreakConfig {
  /** 가벼운 마이크로 무브먼트 권유까지의 연속 착석 분 (기본 30) */
  microMinutes: number;
  /** 일어서기 권유까지의 연속 착석 분 (기본 50, KOSHA H-30 기준) */
  standupMinutes: number;
  /** 강한 휴식 권유까지의 연속 착석 분 (기본 120) */
  deepMinutes: number;
  /**
   * 알림을 "완료"로 인정하는 데 필요한 누적 움직임 초 (기본 60 = "30-1").
   * 근거: 순간 움직임 1회가 아니라 ~1분 지속 활동이 dose (대사 하한선 ≈ 1분
   * chair stands, 20-8-2 의 "2분 움직임"). 목표를 채워야 secsSeated 리셋+보상.
   */
  movementGoalSecs: number;
  enabled: { micro: boolean; standup: boolean; deep: boolean };
}

export const DEFAULT_BREAK_CONFIG: BreakConfig = {
  microMinutes: 30,
  standupMinutes: 50,
  deepMinutes: 120,
  movementGoalSecs: 60,
  enabled: { micro: true, standup: true, deep: true },
};

export interface BreakStatus {
  /** 연속 착석 누적 시간(초). 자리비움 또는 깊은 휴식 5분+로 리셋. */
  secsSeated: number;
  /** 현재 발사된 단계. 단계는 micro → standup → deep 순으로만 진행. */
  stage: BreakStage;
  /** 단계가 발사된 시각(ms epoch). UI 표시·재알림 타이밍에 사용. */
  stageFiredAt: number | null;
  /** 알림 단계가 뜬 뒤 누적한 움직임 초. 목표(goalSecs) 도달 시 완료+리셋. */
  movementSecs: number;
  /** 움직임 목표 초 (config.movementGoalSecs 미러 — UI 진행률 표시용). */
  goalSecs: number;
}

export interface BreakFiredEvent {
  stage: Exclude<BreakStage, "none">;
  secs: number;
}

/** 시간 배분 누적 통계 — "시계가 느리게 간다" 류 증상의 원인 판별용. */
export interface BreakDiagnostics {
  /** 착석으로 배분된 총 초 (유예 내 복귀로 소급 인정된 분량 포함) */
  secsSeated: number;
  /** 진짜 부재로 확정 배분된 총 초 */
  secsAbsent: number;
  /** 휴식(등 기대기)으로 배분된 총 초 */
  secsResting: number;
  /** 선 자세로 배분된 총 초 */
  secsStanding: number;
  /** 유예 내 복귀로 착석 소급 인정된 초 (secsSeated 에 포함된 부분집합) */
  secsReclaimed: number;
  /** 30초 초과 push 갭으로 어느 쪽에도 배분되지 않은 초 */
  secsDroppedGap: number;
}

/** 자리비움 누적이 이 이상이면 secsSeated 리셋 (일어났다 본 것으로 간주) */
const ABSENCE_RESET_SECS = 5 * 60;
/** 깊은 휴식(isResting) 누적이 이 이상이면 secsSeated 리셋 (충분한 휴식으로 간주) */
const RESTING_RESET_SECS = 5 * 60;
/** 선 자세(isStanding) 누적이 이 이상이면 secsSeated 리셋 (완전한 일어서기 휴식으로 간주) */
const STANDING_RESET_SECS = 5 * 60;

// ─── 영속 상태 ──────────────────────────────────────────────────────────────

/** 착석 시계 영속 키. 메인 창·위젯 창이 공유해 핸드오버 시 단일 시계처럼 이어받는다. */
const STATE_KEY = "break_tracker_state_v1";
/**
 * 스냅샷이 이보다 오래되면 이어받지 않고 0에서 시작 — 그 공백 동안 앉아
 * 있었다는 보장이 없다(정확도 우선). ABSENCE_RESET_SECS 와 같은 5분 기준.
 */
const STATE_STALE_MS = ABSENCE_RESET_SECS * 1000;
/** push 중 주기 저장 간격. 상태 전환 즉시 저장 + pagehide flush 가 보완한다. */
const SAVE_INTERVAL_MS = 5_000;
/** 진단 통계 콘솔 로그 간격 */
const DIAG_LOG_INTERVAL_MS = 60_000;

interface PersistedBreakState {
  v: 1;
  savedAt: number;
  secsSeated: number;
  secsAbsent: number;
  secsResting: number;
  secsStanding: number;
  absenceConfirmed: boolean;
  stage: BreakStage;
  stageFiredAt: number | null;
  movementSecs: number;
  diag: BreakDiagnostics;
}

function emptyDiag(): BreakDiagnostics {
  return {
    secsSeated: 0,
    secsAbsent: 0,
    secsResting: 0,
    secsStanding: 0,
    secsReclaimed: 0,
    secsDroppedGap: 0,
  };
}

function readPersistedState(): PersistedBreakState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedBreakState;
    if (parsed.v !== 1 || typeof parsed.savedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export class BreakTracker {
  private secsSeated = 0;
  /**
   * 연속 미검출 누적(초). PRESENCE_GRACE_SECS 미만이면 보류 상태 — 복귀 시
   * 착석으로 소급(settleAbsence), 이상이면 진짜 부재로 확정(absenceConfirmed).
   */
  private secsAbsent = 0;
  private absenceConfirmed = false;
  private secsResting = 0;
  private secsStanding = 0;
  private stage: BreakStage = "none";
  private stageFiredAt: number | null = null;
  private lastPushAt: number | null = null;
  /** 알림 단계가 뜬 뒤 누적한 움직임 초. 목표 도달 시 완료+리셋. */
  private movementSecs = 0;
  /** 마지막 push 의 목표 초 (snapshot 용 미러). */
  private goalSecs = DEFAULT_BREAK_CONFIG.movementGoalSecs;
  private diag = emptyDiag();

  private readonly persist: boolean;
  private lastSavedAt = 0;
  private lastDiagLogAt = 0;

  /**
   * @param opts.persist true 면 localStorage 로 상태를 영속화하고(reload 생존 +
   *   두 창 단일 시계), 생성 시 신선한(5분 내) 스냅샷을 이어받는다. 테스트나
   *   일회성 용도는 기본값(false)으로 순수 인메모리 동작.
   */
  constructor(opts: { persist?: boolean } = {}) {
    this.persist = !!opts.persist;
    if (this.persist) {
      this.adoptPersisted(Date.now());
      try {
        // reload(Cmd+R·메모리 회수) 직전 마지막 상태 flush — 손실 0초.
        window.addEventListener("pagehide", () => this.saveNow());
      } catch {
        /* noop — window 없는 환경 */
      }
    }
  }

  /**
   * 매 프레임 호출. dt 는 lastPushAt 기준 자동 계산 — 호출 빈도와 무관하게
   * 실시간 누적이 보장됨 (15Hz 든 1Hz 든 동일하게 동작).
   *
   * 반환값:
   *   - status: 현재 누적 상태 (UI 표시용)
   *   - fired: 이번 push 에서 새로 단계 진입했으면 이벤트, 아니면 null (1회성)
   *   - completed: 이번 push 에서 움직임 목표(1분)를 채워 단계를 완료했으면 그
   *     단계, 아니면 null (1회성). 완료 시 secsSeated 는 리셋됨 → 보상 지급용.
   *
   * @param personPresent analyzer 의 raw 검출 결과. 순간 노이즈는 내부 유예
   *   버퍼가 흡수하므로 호출부에서 디바운스할 필요 없음.
   * @param movingNow 이번 프레임에 유의미한 자세 변동/움직임이 감지됐는지
   *   (변동성 movementIndex ≥ 임계). 착석 중 활발한 움직임도 목표에 기여.
   */
  push(
    now: number,
    personPresent: boolean,
    isResting: boolean,
    isStanding: boolean,
    stretchFired: boolean,
    config: BreakConfig,
    movingNow = false,
  ): {
    status: BreakStatus;
    fired: BreakFiredEvent | null;
    completed: BreakStage | null;
  } {
    this.goalSecs = config.movementGoalSecs;
    const dt =
      this.lastPushAt == null
        ? 0
        : Math.max(0, (now - this.lastPushAt) / 1000);

    // 첫 호출 또는 dt 가 비정상적으로 크면(>30초, 슬립·창 핸드오버·엔진 휴면 후
    // 복귀 등) 그 갭은 누적 스킵 — 갭 동안 앉아 있었다는 보장이 없어 정확도 우선.
    // 단, 다른 창 엔진이 그 사이 계측해 저장한 신선한 스냅샷이 있으면 이어받고,
    // 아무도 계측하지 않은 채 5분+ 지났으면 리셋(일어났다 온 것으로 간주).
    if (dt > 30) {
      this.diag.secsDroppedGap += dt;
      const adopted = this.persist && this.adoptPersisted(now);
      if (!adopted && dt * 1000 >= STATE_STALE_MS) {
        this.reset();
      }
    }
    this.lastPushAt = now;
    const safeDt = dt > 30 ? 0 : dt;

    // ── 시간 배분 ──
    // 미검출은 즉시 부재가 아니라 보류(secsAbsent). 유예를 넘기는 순간 확정.
    let absenceConfirmedThisFrame = false;
    if (!personPresent) {
      const before = this.secsAbsent;
      this.secsAbsent += safeDt;
      this.secsResting = 0;
      this.secsStanding = 0;
      if (
        before < PRESENCE_GRACE_SECS &&
        this.secsAbsent >= PRESENCE_GRACE_SECS
      ) {
        // 진짜 부재 확정 — 보류분 전체를 이탈 시작 시각부터 부재로 소급.
        this.absenceConfirmed = true;
        absenceConfirmedThisFrame = true;
        this.diag.secsAbsent += this.secsAbsent;
      } else if (this.absenceConfirmed) {
        this.diag.secsAbsent += safeDt;
      }
    } else if (isStanding) {
      this.settleAbsence();
      this.secsStanding += safeDt;
      this.secsResting = 0;
      this.diag.secsStanding += safeDt;
    } else if (isResting) {
      this.settleAbsence();
      this.secsResting += safeDt;
      this.secsStanding = 0;
      this.diag.secsResting += safeDt;
    } else {
      this.settleAbsence();
      this.secsResting = 0;
      this.secsStanding = 0;
      this.secsSeated += safeDt;
      this.diag.secsSeated += safeDt;
    }

    // 자리비움/장시간 휴식/선 자세 → 누적 리셋. 일어났다 본 것으로 간주.
    if (
      this.secsAbsent >= ABSENCE_RESET_SECS ||
      this.secsResting >= RESTING_RESET_SECS ||
      this.secsStanding >= STANDING_RESET_SECS
    ) {
      this.reset();
      return {
        status: {
          secsSeated: 0,
          stage: "none",
          stageFiredAt: null,
          movementSecs: 0,
          goalSecs: config.movementGoalSecs,
        },
        fired: null,
        completed: null,
      };
    }

    // 움직임 목표 (30-1) — 알림 단계가 뜬 뒤 누적 움직임이 목표(기본 60초)에
    // 도달하면 "제대로 쉬었다"로 인정: secsSeated 리셋 + 완료 반환(보상용).
    // 스트레치 한 번(순간)으로는 리셋 안 됨 — 회피 방지 + 근거(≥1분 dose) 정합.
    // 부재는 확정된 경우에만 기여(확정 순간 보류분 소급) — 검출 노이즈로 생긴
    // 가짜 부재 프레임이 목표를 채워 시계를 조용히 리셋하는 것을 차단.
    if (this.stage !== "none") {
      let motionSecs = 0;
      if (!personPresent) {
        if (absenceConfirmedThisFrame) motionSecs = this.secsAbsent;
        else if (this.absenceConfirmed) motionSecs = safeDt;
      } else if (isStanding || isResting || movingNow || stretchFired) {
        motionSecs = safeDt;
      }
      this.movementSecs += motionSecs;
      if (this.movementSecs >= config.movementGoalSecs) {
        const completed = this.stage;
        this.reset();
        return {
          status: {
            secsSeated: 0,
            stage: "none",
            stageFiredAt: null,
            movementSecs: 0,
            goalSecs: config.movementGoalSecs,
          },
          fired: null,
          completed,
        };
      }
    } else {
      this.movementSecs = 0;
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

    // 단계 발사는 즉시, 평상시는 5초 throttle 저장.
    this.maybeSave(now, fired != null);

    return {
      status: {
        secsSeated: this.secsSeated,
        stage: this.stage,
        stageFiredAt: this.stageFiredAt,
        movementSecs: this.movementSecs,
        goalSecs: config.movementGoalSecs,
      },
      fired,
      completed: null,
    };
  }

  /**
   * 카메라가 꺼진 자리비움(idle-suspend) 구간을 복귀 시 일괄 정산.
   *
   * useIdleSuspend 가 "얼굴 없음 + OS 입력 장시간 없음"으로 카메라를 끄면 onFrame·
   * push 가 멈춰, 그 사이 이석이 움직임 목표/리셋에 반영되지 못한다(가장 좋은 휴식인
   * 자리 뜨기가 인정 안 되던 문제). 복귀 시 그 공백을 신뢰 가능한 부재로 인정 —
   * suspend 조건 자체가 카메라보다 확실한 휴식 증거라 카메라 없이도 정산 가능.
   * push 의 dt>30 갭 드롭에 걸려 그냥 버려지던 구간을 여기서 명시적으로 되살린다.
   *
   * @param awaySecs 카메라 OFF 지속 시간(초).
   * @returns completed: 이 정산으로 움직임 목표를 채워 단계를 완료했으면 그 단계.
   */
  creditAbsence(now: number, awaySecs: number): { completed: BreakStage | null } {
    // dt 연속성 — 복귀 첫 push 가 이 갭을 다시 세지 않도록 기준 시각을 당긴다.
    this.lastPushAt = now;
    if (awaySecs <= 0) return { completed: null };

    this.secsAbsent += awaySecs;
    this.absenceConfirmed = true;
    this.diag.secsAbsent += awaySecs;
    this.secsResting = 0;
    this.secsStanding = 0;

    // 5분 이상 이석 → 시계 리셋 (push 의 ABSENCE_RESET_SECS 기준과 동일).
    if (this.secsAbsent >= ABSENCE_RESET_SECS) {
      this.reset();
      return { completed: null };
    }
    // 알림 단계가 떠 있으면 움직임 목표에 적립 — 채우면 완료(+리셋+보상).
    if (this.stage !== "none") {
      this.movementSecs += awaySecs;
      if (this.movementSecs >= this.goalSecs) {
        const completed = this.stage;
        this.reset();
        return { completed };
      }
    }
    this.saveNow();
    return { completed: null };
  }

  reset(): void {
    this.secsSeated = 0;
    this.secsAbsent = 0;
    this.absenceConfirmed = false;
    this.secsResting = 0;
    this.secsStanding = 0;
    this.stage = "none";
    this.stageFiredAt = null;
    this.movementSecs = 0;
    // lastPushAt 은 의도적으로 유지 — dt 연속성 보존. diag 도 유지(수명 통계).
    // 리셋은 상태 전환이므로 즉시 저장 — 다른 창이 리셋 전 상태를 되살리지 않게.
    this.saveNow();
  }

  snapshot(): BreakStatus {
    return {
      secsSeated: this.secsSeated,
      stage: this.stage,
      stageFiredAt: this.stageFiredAt,
      movementSecs: this.movementSecs,
      goalSecs: this.goalSecs,
    };
  }

  /** 시간 배분 누적 통계 사본 — 진단용. */
  diagnostics(): BreakDiagnostics {
    return { ...this.diag };
  }

  // ── 내부 ──────────────────────────────────────────────────────────────────

  /**
   * 보류 중인 미검출 구간 정산. 유예 미만이면 검출 노이즈였던 것 — 착석으로
   * 소급 인정. 확정 부재였으면(복귀) 부재 종료로 카운터만 비운다.
   */
  private settleAbsence(): void {
    if (this.secsAbsent > 0 && !this.absenceConfirmed) {
      this.secsSeated += this.secsAbsent;
      this.diag.secsSeated += this.secsAbsent;
      this.diag.secsReclaimed += this.secsAbsent;
    }
    this.secsAbsent = 0;
    this.absenceConfirmed = false;
  }

  /**
   * 저장된 스냅샷이 내 상태보다 신선하고 5분 내면 이어받는다.
   * 생성 시(reload 복원)와 엔진 휴면 후 첫 push(창 핸드오버)에 호출.
   */
  private adoptPersisted(now: number): boolean {
    const s = readPersistedState();
    if (!s) return false;
    if (now - s.savedAt > STATE_STALE_MS) return false;
    if (this.lastPushAt != null && s.savedAt <= this.lastPushAt) return false;
    this.secsSeated = s.secsSeated;
    this.secsAbsent = s.secsAbsent;
    this.absenceConfirmed = s.absenceConfirmed;
    this.secsResting = s.secsResting;
    this.secsStanding = s.secsStanding;
    this.stage = s.stage;
    this.stageFiredAt = s.stageFiredAt;
    this.movementSecs = s.movementSecs;
    this.diag = { ...emptyDiag(), ...s.diag };
    return true;
  }

  private maybeSave(now: number, force: boolean): void {
    if (!this.persist) return;
    if (!force && now - this.lastSavedAt < SAVE_INTERVAL_MS) return;
    this.writeState(now);
    if (now - this.lastDiagLogAt >= DIAG_LOG_INTERVAL_MS) {
      this.lastDiagLogAt = now;
      try {
        console.info("[barosit:break] time allocation", this.diagnostics());
      } catch {
        /* noop */
      }
    }
  }

  /** 즉시 저장. 휴면 중(60초+ push 없음)이면 스킵 — 다른 창의 최신 상태를
   *  낡은 상태로 덮어쓰지 않게(pagehide 가 휴면 창에서도 발화하므로). */
  private saveNow(): void {
    if (!this.persist) return;
    if (this.lastPushAt == null) return;
    const now = Date.now();
    if (now - this.lastPushAt > 60_000) return;
    this.writeState(now);
  }

  private writeState(now: number): void {
    this.lastSavedAt = now;
    const state: PersistedBreakState = {
      v: 1,
      savedAt: now,
      secsSeated: this.secsSeated,
      secsAbsent: this.secsAbsent,
      absenceConfirmed: this.absenceConfirmed,
      secsResting: this.secsResting,
      secsStanding: this.secsStanding,
      stage: this.stage,
      stageFiredAt: this.stageFiredAt,
      movementSecs: this.movementSecs,
      diag: this.diag,
    };
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      /* noop */
    }
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
