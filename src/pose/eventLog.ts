import type { PostureType } from "./types";

export interface PostureEvent {
  id: string;
  type: PostureType;
  startedAt: number;
  durationSecs: number;
}

const STORAGE_KEY = "posture_events";
const CORRUPT_BACKUP_KEY = "posture_events_corrupt_backup";
// DATA-1: 활발한 사용자도 장기 보존하도록 상한 상향(과거 5000 ≈ 2주).
// 약 20000건 × ~100B ≈ 2MB 로 localStorage 한도(~5MB) 내.
const MAX_EVENTS = 20000;

// DATA-1: 데이터 유실/손상이 "조용히" 일어나지 않도록 사용자/관측에 알리는 신호.
// 상위(App)에서 이 이벤트를 받아 배너 표시 + OPS-1 리포트로 연결한다.
export const DATA_WARNING_EVENT = "posture-data-warning";
export type DataWarningKind = "corrupt" | "quota" | "truncated";
export interface DataWarningDetail {
  kind: DataWarningKind;
  message: string;
}

const warnedKinds = new Set<DataWarningKind>();

/** 테스트 전용 — 세션 단위 경고 상태 초기화 */
export function __resetDataWarnings(): void {
  warnedKinds.clear();
}

function emitWarning(kind: DataWarningKind, message: string): void {
  if (warnedKinds.has(kind)) return; // 종류별 세션 1회(스팸 방지)
  warnedKinds.add(kind);
  try {
    window.dispatchEvent(
      new CustomEvent<DataWarningDetail>(DATA_WARNING_EVENT, { detail: { kind, message } }),
    );
  } catch {
    /* 비브라우저 환경 무시 */
  }
}

/** 손상된 JSON 문자열에서 개별 이벤트 객체만 정규식으로 건져 부분 복구 */
function salvageEvents(raw: string): PostureEvent[] {
  const out: PostureEvent[] = [];
  const matches = raw.match(/\{[^{}]*\}/g) || [];
  for (const m of matches) {
    try {
      const o = JSON.parse(m);
      if (o && typeof o.startedAt === "number" && typeof o.durationSecs === "number" && o.type) {
        out.push({
          id: typeof o.id === "string" ? o.id : `${o.startedAt}-${o.type}`,
          type: o.type as PostureType,
          startedAt: o.startedAt,
          durationSecs: o.durationSecs,
        });
      }
    } catch {
      /* 깨진 조각은 건너뜀 */
    }
  }
  return out;
}

export function loadEvents(): PostureEvent[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("posture_events is not an array");
    return parsed as PostureEvent[];
  } catch {
    // DATA-1: 무음 폐기 금지 — 원본을 먼저 백업(최초 1회)하고 부분 복구 시도.
    try {
      if (localStorage.getItem(CORRUPT_BACKUP_KEY) == null) {
        localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
      }
    } catch {
      /* 백업도 실패하면(용량 등) 별도 처리 없이 진행 */
    }
    const recovered = salvageEvents(raw);
    emitWarning(
      "corrupt",
      recovered.length
        ? `자세 기록 일부가 손상되어 ${recovered.length}건을 복구했습니다. (원본은 백업됨)`
        : `자세 기록을 읽지 못했습니다(손상). 원본은 백업되었습니다.`,
    );
    return recovered;
  }
}

/** localStorage 쓰기 시도 — 실패(용량 초과 등) 시 false */
function trySetEvents(events: PostureEvent[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    return true;
  } catch {
    return false;
  }
}

export function appendEvent(event: Omit<PostureEvent, "id">): PostureEvent {
  const stored = loadEvents();
  const full: PostureEvent = {
    ...event,
    id: `${event.startedAt}-${event.type}`,
  };
  const next = [...stored, full];

  let truncated = 0;
  if (next.length > MAX_EVENTS) {
    truncated = next.length - MAX_EVENTS;
    next.splice(0, truncated);
  }

  if (!trySetEvents(next)) {
    // DATA-1: 용량 초과 — 쓰기 자체가 실패하면 그 이벤트가 통째로 유실됨.
    // 최근 절반만 남기고 1회 재시도해 "쓰기 성공"을 우선 확보(일부 정리하더라도).
    const kept = next.slice(Math.floor(next.length / 2));
    if (trySetEvents(kept)) {
      emitWarning("quota", `저장 공간이 부족하여 오래된 기록 ${next.length - kept.length}건을 정리했습니다.`);
    } else {
      emitWarning("quota", `저장 공간이 가득 차 자세 기록을 저장하지 못했습니다.`);
    }
  } else if (truncated > 0) {
    emitWarning(
      "truncated",
      `자세 기록이 최대치(${MAX_EVENTS}건)를 넘어 가장 오래된 ${truncated}건이 정리되었습니다.`,
    );
  }

  return full;
}

export function clearEvents(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export interface DailyStats {
  total: number;
  byType: Record<PostureType, number>;
  byHour: number[]; // length 24
}

const ZERO_BY_TYPE: Record<PostureType, number> = {
  forward_head: 0,
  chin_resting: 0,
  shoulder_tilt: 0,
  slouching: 0,
  monitor_too_close: 0,
  shoulder_asymmetry: 0,
  head_roll: 0,
};

export function computeDailyStats(
  events: PostureEvent[],
  rangeStart: number,
  rangeEnd: number,
): DailyStats {
  const stats: DailyStats = {
    total: 0,
    byType: { ...ZERO_BY_TYPE },
    byHour: new Array(24).fill(0),
  };
  for (const e of events) {
    if (e.startedAt < rangeStart || e.startedAt >= rangeEnd) continue;
    stats.total += 1;
    stats.byType[e.type] += 1;
    stats.byHour[new Date(e.startedAt).getHours()] += 1;
  }
  return stats;
}

export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfWeek(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export function updateEventDuration(id: string, nextDurationSecs: number): void {
  const stored = loadEvents();
  const index = stored.findIndex((e) => e.id === id);
  if (index !== -1) {
    stored[index].durationSecs = nextDurationSecs;
    if (!trySetEvents(stored)) {
      emitWarning("quota", `저장 공간이 부족하여 자세 기록 갱신에 실패했습니다.`);
      return;
    }
    // 다른 윈도우 동기화를 위해 storage 이벤트 수동 디스패치
    try {
      window.dispatchEvent(new StorageEvent("storage", {
        key: STORAGE_KEY,
        newValue: JSON.stringify(stored),
      }));
    } catch {
      /* noop */
    }
  }
}
