// SYNC-1: 클라우드 동기화 상태를 한 곳에서 관리·가시화.
// syncService 가 상태를 갱신하고, UI(설정 등)가 구독해 표시한다.
// "조용히 실패"하지 않도록 offline/error 상태를 사용자에게 노출하는 것이 목적.

export type SyncState = "idle" | "syncing" | "synced" | "offline" | "error";

export const SYNC_STATUS_EVENT = "barosit:sync-status";
const LAST_SYNCED_KEY = "barosit:last_synced_at";

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null;
  error: string | null;
}

function readLastSynced(): number | null {
  try {
    const v = localStorage.getItem(LAST_SYNCED_KEY);
    return v ? Number(v) || null : null;
  } catch {
    return null;
  }
}

let current: SyncStatus = {
  state: "idle",
  lastSyncedAt: readLastSynced(),
  error: null,
};

export function getSyncStatus(): SyncStatus {
  return current;
}

export function setSyncState(state: SyncState, error: string | null = null): void {
  current = { state, lastSyncedAt: current.lastSyncedAt, error };
  if (state === "synced") {
    current.lastSyncedAt = Date.now();
    try {
      localStorage.setItem(LAST_SYNCED_KEY, String(current.lastSyncedAt));
    } catch {
      /* 저장 실패 무시 */
    }
  }
  try {
    window.dispatchEvent(new CustomEvent<SyncStatus>(SYNC_STATUS_EVENT, { detail: { ...current } }));
  } catch {
    /* 비브라우저 무시 */
  }
}

export function subscribeSyncStatus(cb: (s: SyncStatus) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<SyncStatus>).detail);
  window.addEventListener(SYNC_STATUS_EVENT, handler);
  return () => window.removeEventListener(SYNC_STATUS_EVENT, handler);
}

/** 테스트 전용 — 상태 초기화 */
export function __resetSyncStatus(): void {
  current = { state: "idle", lastSyncedAt: null, error: null };
}
