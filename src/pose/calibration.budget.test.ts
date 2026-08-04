import { describe, it, expect } from "vitest";
import { CalibrationCollector, StabilityWindow } from "./calibration";
import type { DetectionFrame, Landmark, Landmarks } from "./types";

// 회귀 방지: 5초 캡처 · MIN_OK_RATIO 0.65 게이트가 "느린 기기에서는 아무리 가만히
// 있어도 통과 불가" 상태로 돌아가지 않는지 지킨다.
//
// 사건(2026-08): 신규 가입자 1명이 첫 세션에서 17회 연속 실패 후 이탈. 프로덕션
// 실패 21건 중 20건이 weak=["stable"] 단독. 원인은 사용자 움직임이 아니라
// StabilityWindow 가 12샘플을 다 채우기 전 Infinity 를 반환해 **매 캡처 앞
// 12프레임이 불합격 확정**이던 것 — 유효 6fps 이하에서 상한 okRatio 가 0.633 이라
// 임계 0.65 를 넘을 수 없었다.

const CALIBRATION_DURATION_SECS = 5;
const MIN_OK_RATIO = 0.65;

/** 완전 정지(지터 0)한 이상적 피험자 — 현실에서 도달 불가능한 상한 */
function makePose(jitter = 0): Landmarks {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5, y: 0.5, z: 0, visibility: 0.9,
  }));
  lm[0] = { x: 0.5, y: 0.3, z: 0, visibility: 0.9 }; // NOSE
  lm[11] = { x: 0.65 + jitter, y: 0.5, z: 0, visibility: 0.9 }; // LEFT_SHOULDER
  lm[12] = { x: 0.35 - jitter, y: 0.5, z: 0, visibility: 0.9 }; // RIGHT_SHOULDER
  return lm;
}

function frame(jitter = 0): DetectionFrame {
  return {
    pose: makePose(jitter),
    face: { pitch: 0, yaw: 0, roll: 0, tz: 0, landmarks: [] },
    hands: [],
  } as unknown as DetectionFrame;
}

/** 유효 fps 로 5초 캡처했을 때의 프레임 수 */
const framesAt = (fps: number) => Math.round(CALIBRATION_DURATION_SECS * fps);

describe("캘리브레이션 프레임 예산", () => {
  // 저사양 기기 방어선. usePoseLoop 는 wait = max(0, intervalMs - elapsed) 로
  // 자기 조절하므로 검출 1회가 100ms 를 넘으면 요청 fps 10 이 그대로 무너진다.
  it.each([4, 5, 6, 7, 8, 10])(
    "유효 %ifps 에서도 정지 피험자는 게이트를 통과한다",
    (fps) => {
      const c = new CalibrationCollector();
      for (let i = 0; i < framesAt(fps); i++) c.pushFrame(frame());
      expect(c.okRatio()).toBeGreaterThanOrEqual(MIN_OK_RATIO);
      expect(c.weakestChecks()).toHaveLength(0);
    },
  );

  it("워밍업 데드존이 4프레임을 넘지 않는다", () => {
    const c = new CalibrationCollector();
    for (let i = 0; i < 20; i++) c.pushFrame(frame());
    // 20프레임 중 불합격은 창이 차기 전 구간뿐
    const bad = Math.round((1 - c.okRatio()) * 20);
    expect(bad).toBeLessThanOrEqual(4);
  });

  it("라이브 창을 물려받으면 캡처 첫 프레임부터 합격한다 (A)", () => {
    // 사용자가 미리보기를 보고 있는 동안 라이브 루프가 창을 채운 상황
    const live = new StabilityWindow();
    const c = new CalibrationCollector(live);
    for (let i = 0; i < 12; i++) c.pushFrame(frame()); // 미리보기 구간
    c.reset(); // "측정 시작" 클릭 — 공유 창은 보존돼야 한다

    expect(c.pushFrame(frame()).allOk).toBe(true);
    expect(c.okRatio()).toBe(1);
  });

  it("자체 창을 쓰는 collector 는 reset 시 창도 비운다 (기존 동작 유지)", () => {
    const c = new CalibrationCollector();
    for (let i = 0; i < 12; i++) c.pushFrame(frame());
    c.reset();
    expect(c.pushFrame(frame()).allOk).toBe(false); // 샘플 1개 → 아직 판정 불가
  });
});

describe("baseline 은 적합 프레임만으로 만든다 (F)", () => {
  it("불합격 프레임의 어깨 폭이 baseline 에 섞이지 않는다", () => {
    const c = new CalibrationCollector();
    // 40프레임 정상(폭 0.30) + 10프레임 오염(폭 0.50) — 게이트는 통과하는 비율
    for (let i = 0; i < 40; i++) c.pushFrame(frame());
    for (let i = 0; i < 10; i++) c.pushFrame(frame(0.1));

    expect(c.okRatio()).toBeGreaterThanOrEqual(MIN_OK_RATIO); // 통과하는 캡처
    // 전체 평균이었다면 0.30 과 0.50 사이로 끌려갔을 값
    expect(c.build().shoulderWidth).toBeCloseTo(0.3, 2);
  });

  it("적합 프레임이 하나도 없으면 전체로 폴백한다", () => {
    const c = new CalibrationCollector();
    for (let i = 0; i < 5; i++) c.pushFrame(frame()); // 창이 안 차 전부 불합격
    expect(() => c.build()).not.toThrow();
  });
});
