import type { PostureType } from "./types";

export interface PostureEvent {
  id: string;
  type: PostureType;
  startedAt: number;
  durationSecs: number;
}

const STORAGE_KEY = "posture_events";
const MAX_EVENTS = 5000;

export function appendEvent(event: Omit<PostureEvent, "id">): PostureEvent {
  const stored = loadEvents();
  const full: PostureEvent = {
    ...event,
    id: `${event.startedAt}-${event.type}`,
  };
  const next = [...stored, full];
  if (next.length > MAX_EVENTS) next.splice(0, next.length - MAX_EVENTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return full;
}

export function loadEvents(): PostureEvent[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PostureEvent[];
  } catch {
    return [];
  }
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
