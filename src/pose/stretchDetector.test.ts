import { describe, it, expect } from "vitest";
import {
  detectStretch,
  isShoulderShrug,
} from "./stretchDetector";
import { LANDMARK_INDEX } from "./types";
import type { CalibrationBaseline, Landmark, Landmarks } from "./types";

/** 25개 랜드마크를 기본값으로 채운 뒤 override 로 특정 관절만 지정. */
function makePose(overrides: Record<number, Partial<Landmark>>): Landmarks {
  const lm: Landmarks = Array.from({ length: 25 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.9,
  }));
  for (const [idxStr, o] of Object.entries(overrides)) {
    lm[Number(idxStr)] = { ...lm[Number(idxStr)], ...o };
  }
  return lm;
}

/** baseline: 어깨 y=0.60, sw=0.20. 이보다 어깨가 크게 올라오면 (구)셔그 판정. */
function makeBaseline(): CalibrationBaseline {
  const mean = makePose({
    [LANDMARK_INDEX.LEFT_SHOULDER]: { x: 0.4, y: 0.6 },
    [LANDMARK_INDEX.RIGHT_SHOULDER]: { x: 0.6, y: 0.6 },
  });
  return {
    meanLandmarks: mean,
    shoulderWidth: 0.2,
    shoulderTiltY: 0,
    noseToShoulderZ: 0,
    noseY: 0.35,
    shoulderMidY: 0.6,
    face: null,
    capturedAt: 0,
  };
}

/**
 * baseline(어깨 y=0.60) 대비 어깨를 y=0.45 로 크게 올린 '으쓱' 포즈.
 * 손목·팔꿈치는 낮게 두어 팔 기반 가드를 통과 → (구)isShoulderShrug 가 true 를 반환.
 */
function makeShrugPose(): Landmarks {
  return makePose({
    [LANDMARK_INDEX.NOSE]: { x: 0.5, y: 0.35 },
    [LANDMARK_INDEX.LEFT_EAR]: { x: 0.44, y: 0.33 },
    [LANDMARK_INDEX.RIGHT_EAR]: { x: 0.56, y: 0.33 },
    [LANDMARK_INDEX.LEFT_SHOULDER]: { x: 0.4, y: 0.45 },
    [LANDMARK_INDEX.RIGHT_SHOULDER]: { x: 0.6, y: 0.45 },
    [LANDMARK_INDEX.LEFT_ELBOW]: { x: 0.38, y: 0.65 },
    [LANDMARK_INDEX.RIGHT_ELBOW]: { x: 0.62, y: 0.65 },
    [LANDMARK_INDEX.LEFT_WRIST]: { x: 0.4, y: 0.85 },
    [LANDMARK_INDEX.RIGHT_WRIST]: { x: 0.6, y: 0.85 },
  });
}

describe("어깨 으쓱 감지 제외 (2026-07-15)", () => {
  it("포지티브 컨트롤: 이 포즈는 (구)isShoulderShrug 기준상 셔그로 잡히는 포즈", () => {
    // 감지 제외가 '포즈가 셔그가 아니어서'가 아니라 '의도적 비활성화' 때문임을 보장.
    expect(isShoulderShrug(makeShrugPose(), makeBaseline())).toBe(true);
  });

  it("detectStretch 는 셔그 포즈에도 절대 shoulder_shrug 를 반환하지 않는다", () => {
    const result = detectStretch(makeShrugPose(), null, makeBaseline());
    expect(result).not.toBe("shoulder_shrug");
    // 다른 스트레치도 매칭되지 않아 null 이어야 함 (오분류 방지).
    expect(result).toBeNull();
  });
});
