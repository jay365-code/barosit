import { describe, it, expect } from "vitest";
import {
  computeMovementRelaxation,
  relaxThresholdDurations,
} from "./violationTracker";
import { DEFAULT_THRESHOLDS } from "./thresholds";

// 움직임 인지 완화 — 활발히 움직이는 사용자는 위반 알람 임계가 늘어나는지 검증.

describe("computeMovementRelaxation", () => {
  const TH = 0.6; // variability threshold

  it("정지(movementIndex<=threshold)면 1.0(완화 없음)", () => {
    expect(computeMovementRelaxation(0, TH)).toBe(1);
    expect(computeMovementRelaxation(0.6, TH)).toBe(1);
    expect(computeMovementRelaxation(0.3, TH)).toBe(1);
  });

  it("임계의 1.5배 움직임이면 1.5배 완화", () => {
    expect(computeMovementRelaxation(0.9, TH)).toBeCloseTo(1.5, 5);
  });

  it("임계의 2배 이상이면 2.0 상한", () => {
    expect(computeMovementRelaxation(1.2, TH)).toBe(2);
    expect(computeMovementRelaxation(5, TH)).toBe(2);
  });

  it("threshold가 0 이하면 안전하게 1.0", () => {
    expect(computeMovementRelaxation(1, 0)).toBe(1);
  });
});

describe("relaxThresholdDurations", () => {
  it("배수 1이면 원본 그대로(동일 참조)", () => {
    expect(relaxThresholdDurations(DEFAULT_THRESHOLDS, 1)).toBe(DEFAULT_THRESHOLDS);
  });

  it("durationSecs만 배수 적용, sensitivity는 보존", () => {
    const out = relaxThresholdDurations(DEFAULT_THRESHOLDS, 2);
    expect(out.forward_head.durationSecs).toBe(DEFAULT_THRESHOLDS.forward_head.durationSecs * 2);
    expect(out.head_roll.durationSecs).toBe(DEFAULT_THRESHOLDS.head_roll.durationSecs * 2);
    expect(out.forward_head.sensitivity).toBe(DEFAULT_THRESHOLDS.forward_head.sensitivity);
  });

  it("원본을 변형하지 않음(불변)", () => {
    const before = DEFAULT_THRESHOLDS.forward_head.durationSecs;
    relaxThresholdDurations(DEFAULT_THRESHOLDS, 2);
    expect(DEFAULT_THRESHOLDS.forward_head.durationSecs).toBe(before);
  });
});
