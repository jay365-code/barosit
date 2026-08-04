import { describe, it, expect } from "vitest";
import { computeDailyAvgScore } from "./syncService";

describe("computeDailyAvgScore", () => {
  it("시간가중 평균을 낸다", () => {
    // 3600초 동안 점수 합 288000 → 평균 80
    expect(computeDailyAvgScore(288_000, 3_600)).toBe(80);
  });

  // 이 공식을 고친 이유 그 자체 — 이전 공식은 노출 시간을 무시해 오래 쓴 사람을 벌했다.
  it("오래 써도 자세가 좋으면 점수가 떨어지지 않는다", () => {
    const short = computeDailyAvgScore(90 * 600, 600); // 10분, 평균 90
    const long = computeDailyAvgScore(90 * 25_200, 25_200); // 7시간, 평균 90
    expect(short).toBe(90);
    expect(long).toBe(90);
    // 구 공식이었다면 7시간 쓴 쪽은 위반 누적으로 0점이 됐다.
  });

  it("감지가 안 돌았으면 null — 0 이나 100 으로 위장하지 않는다", () => {
    expect(computeDailyAvgScore(0, 0)).toBeNull();
    expect(computeDailyAvgScore(500, 0)).toBeNull();
    expect(computeDailyAvgScore(0, -10)).toBeNull();
  });

  it("0~100 밖으로 나가지 않는다 (localStorage 오염 방어)", () => {
    expect(computeDailyAvgScore(999_999, 10)).toBe(100);
    expect(computeDailyAvgScore(-999, 10)).toBe(0);
  });

  it("숫자가 아니면 null", () => {
    expect(computeDailyAvgScore(NaN, 100)).toBeNull();
    expect(computeDailyAvgScore(100, NaN)).toBeNull();
    expect(computeDailyAvgScore(Infinity, 100)).toBeNull();
  });

  it("자세가 나쁘면 낮게 나온다 — 바닥에 붙지는 않는다", () => {
    expect(computeDailyAvgScore(30 * 3_600, 3_600)).toBe(30);
    expect(computeDailyAvgScore(5 * 3_600, 3_600)).toBe(5);
  });
});
