import { describe, it, expect, beforeEach } from "vitest";
import {
  getSyncStatus,
  setSyncState,
  subscribeSyncStatus,
  __resetSyncStatus,
  SYNC_STATUS_EVENT,
  type SyncStatus,
} from "./syncStatus";

beforeEach(() => {
  localStorage.clear();
  __resetSyncStatus();
});

describe("syncStatus", () => {
  it("초기 상태는 idle", () => {
    expect(getSyncStatus().state).toBe("idle");
  });

  it("상태 변경 시 구독자에게 통지", () => {
    const seen: SyncStatus[] = [];
    const unsub = subscribeSyncStatus((s) => seen.push(s));
    setSyncState("syncing");
    setSyncState("error", "boom");
    unsub();
    expect(seen.map((s) => s.state)).toEqual(["syncing", "error"]);
    expect(seen[1].error).toBe("boom");
  });

  it("synced 로 바뀌면 lastSyncedAt 기록 + localStorage 영속화", () => {
    expect(getSyncStatus().lastSyncedAt).toBeNull();
    setSyncState("synced");
    const s = getSyncStatus();
    expect(s.state).toBe("synced");
    expect(typeof s.lastSyncedAt).toBe("number");
    expect(localStorage.getItem("barosit:last_synced_at")).toBe(String(s.lastSyncedAt));
  });

  it("offline/error 는 lastSyncedAt 을 덮어쓰지 않는다", () => {
    setSyncState("synced");
    const t = getSyncStatus().lastSyncedAt;
    setSyncState("error", "x");
    expect(getSyncStatus().lastSyncedAt).toBe(t);
    setSyncState("offline");
    expect(getSyncStatus().lastSyncedAt).toBe(t);
  });

  it("CustomEvent 로 detail 을 전달한다", () => {
    let detail: SyncStatus | null = null;
    const h = (e: Event) => { detail = (e as CustomEvent<SyncStatus>).detail; };
    window.addEventListener(SYNC_STATUS_EVENT, h);
    setSyncState("syncing");
    window.removeEventListener(SYNC_STATUS_EVENT, h);
    expect(detail).not.toBeNull();
    expect(detail!.state).toBe("syncing");
  });
});
