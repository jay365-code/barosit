import { describe, it, expect } from "vitest";
import { PresenceDebouncer, PRESENCE_GRACE_SECS } from "./presenceStabilizer";

describe("PresenceDebouncer", () => {
  it("미검출이어도 유예 내에는 착석 유지", () => {
    const d = new PresenceDebouncer();
    const t0 = 100_000;
    expect(d.update(t0, true)).toBe(true);
    expect(d.update(t0 + 5_000, false)).toBe(true); // 5초 노이즈
    expect(d.update(t0 + (PRESENCE_GRACE_SECS - 1) * 1000, false)).toBe(true);
  });

  it("유예를 넘긴 연속 미검출은 부재로 전환", () => {
    const d = new PresenceDebouncer();
    const t0 = 100_000;
    d.update(t0, true);
    expect(d.update(t0 + (PRESENCE_GRACE_SECS + 1) * 1000, false)).toBe(false);
  });

  it("복귀하면 즉시 착석 + 유예 시계 재시작", () => {
    const d = new PresenceDebouncer();
    const t0 = 100_000;
    d.update(t0, true);
    d.update(t0 + 40_000, false); // 부재 확정
    expect(d.update(t0 + 41_000, true)).toBe(true); // 복귀
    expect(d.update(t0 + 50_000, false)).toBe(true); // 새 유예 창 안
  });

  it("시작부터 미검출이면 부재", () => {
    const d = new PresenceDebouncer();
    expect(d.update(100_000, false)).toBe(false);
  });

  it("reset 후에는 유예 이력 소멸", () => {
    const d = new PresenceDebouncer();
    d.update(100_000, true);
    d.reset();
    expect(d.update(101_000, false)).toBe(false);
  });
});
