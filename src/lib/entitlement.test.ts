import { describe, it, expect } from "vitest";
import { isMonitoringEntitled, isOfflineGraceExpired, OFFLINE_GRACE_MS } from "./entitlement";

const user = { id: "u1" };

// 앱=로그인+PRO 전용 게이트(§7 E3). 회귀 시 무단 모니터링 누수를 잡는다.
describe("isMonitoringEntitled", () => {
  it("로그인 + PRO → 허용", () => {
    expect(isMonitoringEntitled(user, "pro")).toBe(true);
  });
  it("로그인 + FREE → 차단", () => {
    expect(isMonitoringEntitled(user, "free")).toBe(false);
  });
  it("비로그인(게스트) → PRO 캐시여도 차단", () => {
    expect(isMonitoringEntitled(null, "pro")).toBe(false);
    expect(isMonitoringEntitled(undefined, "pro")).toBe(false);
  });
  it("이상값 plan → 차단", () => {
    expect(isMonitoringEntitled(user, null)).toBe(false);
    expect(isMonitoringEntitled(user, "")).toBe(false);
    expect(isMonitoringEntitled(user, "premium")).toBe(false);
  });
});

// 오프라인 재검증 유예 상한(14일). 해지/환불 계정이 무한정 오프라인으로 PRO 유지하는 걸 차단.
describe("isOfflineGraceExpired", () => {
  const now = 1_800_000_000_000; // 고정 기준 시각(ms)
  it("검증 이력 없음(0/음수) → 만료(강등)", () => {
    expect(isOfflineGraceExpired(0, now)).toBe(true);
    expect(isOfflineGraceExpired(-1, now)).toBe(true);
  });
  it("유예 내(방금 검증) → 유지", () => {
    expect(isOfflineGraceExpired(now, now)).toBe(false);
    expect(isOfflineGraceExpired(now - OFFLINE_GRACE_MS + 1000, now)).toBe(false);
  });
  it("정확히 유예 경계 → 유지(초과만 강등)", () => {
    expect(isOfflineGraceExpired(now - OFFLINE_GRACE_MS, now)).toBe(false);
  });
  it("유예 초과(14일+1ms) → 만료(강등)", () => {
    expect(isOfflineGraceExpired(now - OFFLINE_GRACE_MS - 1, now)).toBe(true);
  });
  it("13일 오프라인 → 유지 / 15일 → 강등", () => {
    const DAY = 24 * 60 * 60 * 1000;
    expect(isOfflineGraceExpired(now - 13 * DAY, now)).toBe(false);
    expect(isOfflineGraceExpired(now - 15 * DAY, now)).toBe(true);
  });
});
