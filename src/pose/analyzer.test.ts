import { describe, it, expect } from "vitest";
import { analyzeFrame } from "./analyzer";
import { DEFAULT_THRESHOLDS } from "./thresholds";
import {
  LANDMARK_INDEX,
  type Landmark,
  type Landmarks,
  type DetectionFrame,
  type CalibrationBaseline,
} from "./types";

// MONI-02 자세 불량 검출 — 합성 랜드마크로 analyzeFrame 검출 파이프라인을 카메라 없이 실행 검증.
// (shoulder_tilt 를 결정론적으로 검증: tilt=ls.y-rs.y, 발동 임계 tiltDelta>0.04*sensitivity)

const lm = (x: number, y: number, z = 0, visibility = 0.95): Landmark => ({ x, y, z, visibility });

function buildLandmarks(
  overrides: Partial<Record<number, { x: number; y: number; z?: number; visibility?: number }>> = {},
): Landmarks {
  const arr: Landmarks = [];
  for (let i = 0; i < 25; i++) arr.push(lm(0.5, 0.5, 0, 0.95));
  // 바른 자세 기본 배치 (어깨 수평, 코 중앙 상단)
  arr[LANDMARK_INDEX.NOSE] = lm(0.5, 0.30, -0.1, 0.95);
  arr[LANDMARK_INDEX.LEFT_EAR] = lm(0.45, 0.28, 0, 0.9);
  arr[LANDMARK_INDEX.RIGHT_EAR] = lm(0.55, 0.28, 0, 0.9);
  arr[LANDMARK_INDEX.LEFT_SHOULDER] = lm(0.40, 0.55, 0, 0.95);
  arr[LANDMARK_INDEX.RIGHT_SHOULDER] = lm(0.60, 0.55, 0, 0.95);
  for (const k of Object.keys(overrides)) {
    const i = Number(k);
    const o = overrides[i]!;
    arr[i] = lm(o.x, o.y, o.z ?? 0, o.visibility ?? 0.95);
  }
  return arr;
}

const frameOf = (landmarks: Landmarks): DetectionFrame => ({
  pose: landmarks,
  face: null,
  hands: [],
  mask: null,
});

function baselineFrom(landmarks: Landmarks): CalibrationBaseline {
  const ls = landmarks[LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = landmarks[LANDMARK_INDEX.RIGHT_SHOULDER];
  const nose = landmarks[LANDMARK_INDEX.NOSE];
  return {
    meanLandmarks: landmarks.map((l) => ({ ...l })),
    shoulderWidth: Math.abs(ls.x - rs.x),
    shoulderTiltY: ls.y - rs.y,
    noseToShoulderZ: nose.z - (ls.z + rs.z) / 2,
    noseY: nose.y,
    shoulderMidY: (ls.y + rs.y) / 2,
    face: null,
    capturedAt: 0,
  };
}

describe("analyzeFrame — MONI-02 자세 불량 검출", () => {
  const good = buildLandmarks();
  const baseline = baselineFrom(good);

  it("랜드마크가 신뢰 가능하면 personPresent=true", () => {
    const r = analyzeFrame(frameOf(good), baseline, DEFAULT_THRESHOLDS);
    expect(r.personPresent).toBe(true);
  });

  it("바른 자세(기준선과 동일)에서는 shoulder_tilt 미발동", () => {
    const r = analyzeFrame(frameOf(good), baseline, DEFAULT_THRESHOLDS);
    expect(r.violations.has("shoulder_tilt")).toBe(false);
  });

  it("한쪽 어깨를 크게 올리면 shoulder_tilt 발동 (tiltDelta≈0.15 > 0.056)", () => {
    // 왼쪽 어깨 y 0.55 → 0.70 (기준선 대비 tiltDelta 약 0.15)
    const bad = buildLandmarks({ [LANDMARK_INDEX.LEFT_SHOULDER]: { x: 0.40, y: 0.70 } });
    const r = analyzeFrame(frameOf(bad), baseline, DEFAULT_THRESHOLDS);
    expect(r.violations.has("shoulder_tilt")).toBe(true);
  });

  it("어깨를 살짝(임계 미만)만 기울이면 미발동 (deadzone 확인)", () => {
    // tiltDelta ≈ 0.02 < 0.056
    const slight = buildLandmarks({ [LANDMARK_INDEX.LEFT_SHOULDER]: { x: 0.40, y: 0.57 } });
    const r = analyzeFrame(frameOf(slight), baseline, DEFAULT_THRESHOLDS);
    expect(r.violations.has("shoulder_tilt")).toBe(false);
  });

  it("어깨 랜드마크 가시성이 낮으면 사람 미감지 (personPresent=false)", () => {
    const occluded = buildLandmarks({
      [LANDMARK_INDEX.LEFT_SHOULDER]: { x: 0.40, y: 0.55, visibility: 0.2 },
      [LANDMARK_INDEX.RIGHT_SHOULDER]: { x: 0.60, y: 0.55, visibility: 0.2 },
    });
    const r = analyzeFrame(frameOf(occluded), baseline, DEFAULT_THRESHOLDS);
    expect(r.personPresent).toBe(false);
  });
});
