import { describe, it, expect } from "vitest";
import { CalibrationCollector } from "./calibration";
import type { DetectionFrame, Landmark, Landmarks } from "./types";

const DEG = Math.PI / 180;

// 33개 포즈 랜드마크 — 어깨/코만 의미있게 채우고 나머지는 채움값
function makePose(visibility: number): Landmarks {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility }));
  lm[0] = { x: 0.5, y: 0.3, z: 0, visibility }; // NOSE
  lm[11] = { x: 0.65, y: 0.5, z: 0, visibility }; // LEFT_SHOULDER
  lm[12] = { x: 0.35, y: 0.5, z: 0, visibility }; // RIGHT_SHOULDER
  return lm;
}

function makeFrame(opts: { visibility?: number; pitch?: number; roll?: number }): DetectionFrame {
  return {
    pose: makePose(opts.visibility ?? 0.9),
    face: {
      pitch: opts.pitch ?? 0,
      yaw: 0,
      roll: opts.roll ?? 0,
      tz: 0,
      landmarks: [],
    },
    hands: [],
  } as unknown as DetectionFrame;
}

describe("UX-1: CalibrationCollector 항목별 통과 추적", () => {
  it("머리 기울임(roll)만 초과하면 headUpright 가 가장 부족한 항목으로 잡힌다", () => {
    const c = new CalibrationCollector();
    // roll 30도(>15도 한도) — headUpright 는 매 프레임 실패, 나머지는 양호
    for (let i = 0; i < 20; i++) c.pushFrame(makeFrame({ roll: 30 * DEG }));

    const ratios = c.checkPassRatios();
    expect(ratios.headUpright).toBe(0); // 한 번도 통과 못 함
    expect(ratios.bodyVisible).toBe(1); // visibility 0.9 → 항상 통과

    const weak = c.weakestChecks();
    expect(weak).toContain("headUpright");
    expect(weak[0]).toBe("headUpright"); // 가장 부족한 항목이 맨 앞
  });

  it("상반신 미인식(낮은 visibility)이면 bodyVisible 가 부족 항목", () => {
    const c = new CalibrationCollector();
    for (let i = 0; i < 20; i++) c.pushFrame(makeFrame({ visibility: 0.3 }));

    const ratios = c.checkPassRatios();
    expect(ratios.bodyVisible).toBe(0);
    expect(c.weakestChecks()).toContain("bodyVisible");
  });

  it("모두 양호하면 weakestChecks 가 비어있다(=통과)", () => {
    const c = new CalibrationCollector();
    // 안정화 윈도우 워밍업(초기 drift)을 고려해 실제 캡처 수준(80프레임)으로 측정
    for (let i = 0; i < 80; i++) c.pushFrame(makeFrame({}));
    expect(c.okRatio()).toBeGreaterThan(0.65);
    expect(c.weakestChecks()).toHaveLength(0);
  });

  it("reset 후 통과 추적이 초기화된다", () => {
    const c = new CalibrationCollector();
    for (let i = 0; i < 10; i++) c.pushFrame(makeFrame({ roll: 30 * DEG }));
    c.reset();
    const ratios = c.checkPassRatios();
    expect(ratios.headUpright).toBe(0);
    expect(ratios.bodyVisible).toBe(0); // totalFrames=0 → 0
  });
});
