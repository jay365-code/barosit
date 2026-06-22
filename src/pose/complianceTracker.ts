/**
 * 준수 추적 (Nudge Compliance) — Phase 5.
 *
 * 근거 (docs/posture-nudge-design.md §2):
 * - 알림 순응도는 시간이 갈수록 하락하며, 무시율 가속은 이탈(churn)의 조기경보다.
 *   → 알림이 발사된 뒤 사용자가 실제로 움직였는지(준수)를 기록해 순응률·연속무시를
 *      산출하고, 적응형 백오프·보상 루프의 입력으로 쓴다.
 * - 보상 > 처벌(자기결정이론): 준수 시 긍정 강화, 미준수 시 죄책감 없이 조용히 백오프.
 *
 * 동작:
 * - 변동성/휴식 알림이 발사되면 notifyFired() 로 "응답 대기"를 연다.
 * - 매 프레임 push() 에 행동 신호를 넘긴다. 응답 윈도우(기본 60초) 안에
 *   움직임이 감지되면 준수(complied), 윈도우가 지나도록 없으면 미준수(ignored)로
 *   확정하고 resolved 이벤트를 한 번 방출한다.
 * - 최근 이력(rolling)으로 순응률과 연속 무시(ignoreStreak)를 노출한다.
 *
 * 준수 판정:
 * - 휴식 알림(break_*): 실제로 쉬어야 하므로 스트레칭·기립·등받이 휴식·자리비움만 인정.
 * - 변동성 알림(variability): "자세를 바꿔라"이므로 위 + 유의미한 움직임(자세 변동)도 인정.
 */

export type NudgeKind =
  | "variability"
  | "break_micro"
  | "break_standup"
  | "break_deep";

export interface ComplianceConfig {
  enabled: boolean;
  /** 알림 후 준수 여부를 판정하는 응답 윈도우(초). 기본 60. */
  responseWindowSecs: number;
  /** 순응률·연속무시 산출에 쓰는 최근 이력 길이. 기본 20. */
  historySize: number;
}

export const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
  enabled: true,
  responseWindowSecs: 60,
  historySize: 20,
};

/** 매 프레임 전달하는 행동 신호. */
export interface ComplianceSignals {
  /** 스트레칭·기립·등받이 휴식·자리비움 등 "휴식을 취함". */
  tookBreak: boolean;
  /** 유의미한 자세 변동(움직임). 변동성 알림 준수에만 인정. */
  movedSlightly: boolean;
}

export interface ComplianceResolved {
  kind: NudgeKind;
  complied: boolean;
  /** 발사~확정까지 걸린 시간(초). */
  latencySecs: number;
}

export interface ComplianceStatus {
  /** 응답 대기 중인 알림이 있는지. */
  pending: boolean;
  /** 최근 이력 기준 순응률 (0~1). 이력 없으면 1. */
  recentComplianceRate: number;
  /** 연속 무시 횟수. 준수 시 0으로 리셋. */
  ignoreStreak: number;
}

interface Pending {
  kind: NudgeKind;
  firedAt: number;
}

export class ComplianceTracker {
  private pending: Pending | null = null;
  private history: boolean[] = [];
  private ignoreStreak = 0;

  /** 알림이 발사되면 호출. 직전 대기 중인 알림이 있으면 미준수로 확정하지 않고
   *  새 알림으로 교체한다(가장 최근 알림 기준으로 판정). */
  notifyFired(kind: NudgeKind, now: number): void {
    this.pending = { kind, firedAt: now };
  }

  /**
   * 매 프레임 호출. 응답 윈도우 내 행동을 보고 준수/미준수를 확정한다.
   * @returns resolved 는 확정된 그 프레임에만 값이 있고, 그 외엔 null.
   */
  push(
    now: number,
    signals: ComplianceSignals,
    config: ComplianceConfig,
  ): { status: ComplianceStatus; resolved: ComplianceResolved | null } {
    let resolved: ComplianceResolved | null = null;

    if (this.pending) {
      const elapsed = (now - this.pending.firedAt) / 1000;
      const acted =
        this.pending.kind === "variability"
          ? signals.tookBreak || signals.movedSlightly
          : signals.tookBreak;

      if (acted) {
        resolved = { kind: this.pending.kind, complied: true, latencySecs: elapsed };
        this.record(true, config);
        this.pending = null;
      } else if (elapsed >= config.responseWindowSecs) {
        resolved = { kind: this.pending.kind, complied: false, latencySecs: elapsed };
        this.record(false, config);
        this.pending = null;
      }
    }

    return { status: this.status(), resolved };
  }

  private record(complied: boolean, config: ComplianceConfig): void {
    this.history.push(complied);
    while (this.history.length > config.historySize) this.history.shift();
    this.ignoreStreak = complied ? 0 : this.ignoreStreak + 1;
  }

  status(): ComplianceStatus {
    const n = this.history.length;
    const rate = n === 0 ? 1 : this.history.filter(Boolean).length / n;
    return {
      pending: this.pending !== null,
      recentComplianceRate: rate,
      ignoreStreak: this.ignoreStreak,
    };
  }

  reset(): void {
    this.pending = null;
    // 이력·연속무시는 보존 — 세션 전체의 순응 경향이므로.
  }
}

// ─── 적응형 백오프 ───────────────────────────────────────────────────────────
// 근거(docs/posture-nudge-design.md §2-2): 무시 가속은 알림 피로·이탈의 조기경보.
// 연속 무시가 쌓이면 알림 빈도를 조용히 낮춰(쿨다운·임계 확대) 자율성을 지킨다.
// (처벌 아님 — 단지 덜 귀찮게.)

/** 연속 무시(ignoreStreak)에 따른 빈도 배수. 1.0(정상)~2.0(최대 백오프).
 *  streak 0→1.0, 1→1.25, 2→1.5, 3→1.75, 4+→2.0 (선형, 상한 2). */
export function computeBackoffMultiplier(status: ComplianceStatus): number {
  return 1 + Math.min(Math.max(status.ignoreStreak, 0), 4) * 0.25;
}

// ─── 일일 준수 집계(영속화) ──────────────────────────────────────────────────
// churn 분석·리포트용. 날짜가 바뀌면 자동 리셋.

interface DailyCompliance {
  date: string; // YYYY-MM-DD
  complied: number;
  ignored: number;
}

const DAILY_KEY = "nudge_compliance_today";

function todayStr(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function recordDailyCompliance(complied: boolean, now: number): void {
  try {
    const date = todayStr(now);
    let d: DailyCompliance;
    const raw = localStorage.getItem(DAILY_KEY);
    d = raw ? (JSON.parse(raw) as DailyCompliance) : { date, complied: 0, ignored: 0 };
    if (d.date !== date) d = { date, complied: 0, ignored: 0 };
    if (complied) d.complied += 1;
    else d.ignored += 1;
    localStorage.setItem(DAILY_KEY, JSON.stringify(d));
  } catch {
    /* noop */
  }
}

export function loadDailyCompliance(now: number): DailyCompliance {
  const date = todayStr(now);
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) {
      const d = JSON.parse(raw) as DailyCompliance;
      if (d.date === date) return d;
    }
  } catch {
    /* noop */
  }
  return { date, complied: 0, ignored: 0 };
}
