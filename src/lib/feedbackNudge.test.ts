import { describe, it, expect, beforeEach } from "vitest";
import {
  recordSession,
  shouldShowNudge,
  markNudgeDone,
  __resetNudge,
} from "./feedbackNudge";

const DAY = 86400000;

beforeEach(() => {
  localStorage.clear();
  __resetNudge();
});

describe("feedbackNudge", () => {
  it("첫 세션 직후엔 안 띄운다(3일 미경과)", () => {
    const t0 = 1_000_000_000_000;
    recordSession(t0);
    expect(shouldShowNudge(t0)).toBe(false);
  });

  it("3일 경과 + 2세션이면 띄운다", () => {
    const t0 = 1_000_000_000_000;
    recordSession(t0); // firstSeen = t0, sessions=1
    recordSession(t0 + 1000); // sessions=2
    expect(shouldShowNudge(t0 + 3 * DAY + 1)).toBe(true);
  });

  it("3일 경과해도 세션 1회뿐이면 안 띄운다", () => {
    const t0 = 1_000_000_000_000;
    recordSession(t0);
    expect(shouldShowNudge(t0 + 4 * DAY)).toBe(false);
  });

  it("markNudgeDone 이후엔 조건 충족해도 다시 안 띄운다", () => {
    const t0 = 1_000_000_000_000;
    recordSession(t0);
    recordSession(t0 + 1000);
    expect(shouldShowNudge(t0 + 4 * DAY)).toBe(true);
    markNudgeDone();
    expect(shouldShowNudge(t0 + 4 * DAY)).toBe(false);
  });

  it("firstSeenAt 은 최초 세션에만 각인된다", () => {
    const t0 = 1_000_000_000_000;
    recordSession(t0);
    recordSession(t0 + 10 * DAY); // firstSeenAt 갱신 안 됨
    // t0 기준 3일이면 충족 (firstSeen 이 t0 라서)
    expect(shouldShowNudge(t0 + 3 * DAY + 1)).toBe(true);
  });
});
