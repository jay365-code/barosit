import { describe, it, expect } from "vitest";
import { isLifetimeComp } from "./lifetimeComp";

// 평생 무료 뱃지와 등급 드롭다운이 같은 판정을 쓰기 때문에, 여기가 어긋나면
// "뱃지는 PRO 인데 드롭다운은 FREE" 같은 상태 오인이 다시 생긴다.
describe("isLifetimeComp", () => {
  it("pro + active + 먼 미래 만료일 → 평생 무료", () => {
    expect(isLifetimeComp({ plan_id: "pro", status: "active", current_period_end: "2099-01-01T00:00:00.000Z" })).toBe(true);
  });

  it("DB 가 돌려주는 타임존 표기(+00)도 인식한다", () => {
    expect(isLifetimeComp({ plan_id: "pro", status: "active", current_period_end: "2099-01-01 00:00:00+00" })).toBe(true);
  });

  it("만료일 없는 pro/active 는 평생 무료가 아니다 — 이 상태는 등급 판정에서 free 로 떨어진다", () => {
    expect(isLifetimeComp({ plan_id: "pro", status: "active", current_period_end: null })).toBe(false);
  });

  it("실제 유료 구독(가까운 미래 만료)은 평생 무료가 아니다", () => {
    const nextMonth = new Date(Date.now() + 30 * 864e5).toISOString();
    expect(isLifetimeComp({ plan_id: "pro", status: "active", current_period_end: nextMonth })).toBe(false);
  });

  it("free 이거나 비활성이면 만료일이 2099 여도 평생 무료가 아니다", () => {
    expect(isLifetimeComp({ plan_id: "free", status: "active", current_period_end: "2099-01-01T00:00:00.000Z" })).toBe(false);
    expect(isLifetimeComp({ plan_id: "pro", status: "canceled", current_period_end: "2099-01-01T00:00:00.000Z" })).toBe(false);
  });

  it("깨진 만료일은 평생 무료로 치지 않는다", () => {
    expect(isLifetimeComp({ plan_id: "pro", status: "active", current_period_end: "not-a-date" })).toBe(false);
  });
});
