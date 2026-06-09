import { describe, it, expect } from "vitest";
import { isMonitoringEntitled } from "./entitlement";

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
