import type {
  CalibrationBaseline,
  DetectionFrame,
  FaceData,
  Landmark,
  Landmarks,
} from "./types";
import { LANDMARK_INDEX } from "./types";

export interface CalibrationCheck {
  bodyVisible: boolean;
  headNotTiltedDown: boolean;
  headUpright: boolean;
  noChinRest: boolean;
  stable: boolean;
  allOk: boolean;
}

const DEG = Math.PI / 180;
// 카메라 위치(정면/측면)에 무관한 절대 한도만 검증한다.
const MAX_FACE_PITCH = 20 * DEG;
const MAX_FACE_ROLL = 15 * DEG;
const MAX_POSE_DRIFT = 0.07;        // 자연스러운 호흡·미세 움직임 허용

interface StabilitySample {
  midX: number;
  midY: number;
  width: number;
}

export class StabilityWindow {
  private samples: StabilitySample[] = [];
  constructor(private readonly maxLen = 12) {}

  push(s: StabilitySample): void {
    this.samples.push(s);
    if (this.samples.length > this.maxLen) this.samples.shift();
  }

  reset(): void {
    this.samples = [];
  }

  /** 충분한 샘플이 모이면 평균 대비 최대 편차를 반환, 아니면 Infinity. */
  drift(): number {
    if (this.samples.length < this.maxLen) return Infinity;
    let mx = 0, my = 0, mw = 0;
    for (const s of this.samples) {
      mx += s.midX;
      my += s.midY;
      mw += s.width;
    }
    const n = this.samples.length;
    mx /= n; my /= n; mw /= n;
    let max = 0;
    for (const s of this.samples) {
      max = Math.max(
        max,
        Math.abs(s.midX - mx),
        Math.abs(s.midY - my),
        Math.abs(s.width - mw) / Math.max(mw, 0.05),
      );
    }
    return max;
  }
}

/**
 * 카메라가 정면이든 측면이든 통과 가능한 항목만 검증.
 * - bodyVisible: 코·양어깨 가시성 충분
 * - headNotTiltedDown: 얼굴이 명백히 아래로 꺾이지 않음
 * - headUpright: 좌우 기울어지지 않음
 * - noChinRest: 손가락 끝이 얼굴 근처에 없음
 * - stable: 직전 ~1.2초 프레임이 거의 움직이지 않음
 */
export function checkCalibrationFrame(
  frame: DetectionFrame,
  stability: StabilityWindow,
): CalibrationCheck {
  const lm = frame.pose;
  let bodyVisible = false;
  if (lm) {
    const ls = lm[LANDMARK_INDEX.LEFT_SHOULDER];
    const rs = lm[LANDMARK_INDEX.RIGHT_SHOULDER];
    const nose = lm[LANDMARK_INDEX.NOSE];
    bodyVisible =
      !!(ls && rs && nose) &&
      ls.visibility >= 0.6 &&
      rs.visibility >= 0.6 &&
      nose.visibility >= 0.6;

    if (bodyVisible) {
      stability.push({
        midX: (ls.x + rs.x) / 2,
        midY: (ls.y + rs.y) / 2,
        width: Math.abs(ls.x - rs.x),
      });
    }
  }

  const face = frame.face;
  const headNotTiltedDown = face ? Math.abs(face.pitch) < MAX_FACE_PITCH : true;
  const headUpright = face ? Math.abs(face.roll) < MAX_FACE_ROLL : true;

  let noChinRest = true;
  if (lm) {
    const nose = lm[LANDMARK_INDEX.NOSE];
    const ls = lm[LANDMARK_INDEX.LEFT_SHOULDER];
    const rs = lm[LANDMARK_INDEX.RIGHT_SHOULDER];
    if (nose && ls && rs) {
      const sw = Math.abs(ls.x - rs.x);
      const limit = sw * 0.5;
      for (const h of frame.hands) {
        for (const i of [4, 8, 12, 16, 20]) {
          const tip = h.landmarks[i];
          if (!tip) continue;
          if (Math.hypot(tip.x - nose.x, tip.y - nose.y) < limit) {
            noChinRest = false;
          }
        }
      }
    }
  }

  const stable = stability.drift() < MAX_POSE_DRIFT;

  const allOk =
    bodyVisible && headNotTiltedDown && headUpright && noChinRest && stable;
  return { bodyVisible, headNotTiltedDown, headUpright, noChinRest, stable, allOk };
}

export class CalibrationCollector {
  private frames: Landmarks[] = [];
  private faceFrames: FaceData[] = [];
  private okFrames = 0;
  private totalFrames = 0;
  private stability = new StabilityWindow();

  pushPose(landmarks: Landmarks): void {
    this.frames.push(landmarks);
  }
  pushFace(face: FaceData): void {
    this.faceFrames.push(face);
  }
  pushFrame(frame: DetectionFrame): void {
    if (frame.pose) this.pushPose(frame.pose);
    if (frame.face) this.pushFace(frame.face);
    const check = checkCalibrationFrame(frame, this.stability);
    this.totalFrames += 1;
    if (check.allOk) this.okFrames += 1;
  }
  push(landmarks: Landmarks): void {
    this.pushPose(landmarks);
  }
  count(): number {
    return this.frames.length;
  }
  okRatio(): number {
    if (this.totalFrames === 0) return 0;
    return this.okFrames / this.totalFrames;
  }
  reset(): void {
    this.frames = [];
    this.faceFrames = [];
    this.okFrames = 0;
    this.totalFrames = 0;
    this.stability.reset();
  }
  build(): CalibrationBaseline {
    if (this.frames.length === 0) {
      throw new Error("No calibration frames collected");
    }
    const numLm = this.frames[0].length;
    const mean: Landmark[] = [];
    for (let i = 0; i < numLm; i++) {
      let x = 0,
        y = 0,
        z = 0,
        v = 0;
      for (const f of this.frames) {
        x += f[i].x;
        y += f[i].y;
        z += f[i].z;
        v += f[i].visibility;
      }
      const n = this.frames.length;
      mean.push({ x: x / n, y: y / n, z: z / n, visibility: v / n });
    }

    const ls = mean[LANDMARK_INDEX.LEFT_SHOULDER];
    const rs = mean[LANDMARK_INDEX.RIGHT_SHOULDER];
    const nose = mean[LANDMARK_INDEX.NOSE];
    const shoulderMidZ = (ls.z + rs.z) / 2;
    const shoulderMidY = (ls.y + rs.y) / 2;

    // 사용자가 실제로 유지한 자세를 베이스라인으로 캡처.
    // 카메라가 측면이면 yaw/shoulderTiltY가 0이 아니어도 그게 그 사용자의
    // 자연스러운 기준. analyzer는 이 베이스라인 대비 "변화량"을 검사한다.
    let face: FaceData | null = null;
    if (this.faceFrames.length > 0) {
      let pitch = 0, yaw = 0, roll = 0, tz = 0;
      for (const f of this.faceFrames) {
        pitch += f.pitch; yaw += f.yaw; roll += f.roll; tz += f.tz;
      }
      const n = this.faceFrames.length;
      face = {
        pitch: pitch / n,
        yaw: yaw / n,
        roll: roll / n,
        tz: tz / n,
        landmarks: [],
      };
    }

    return {
      meanLandmarks: mean,
      shoulderWidth: Math.abs(ls.x - rs.x),
      shoulderTiltY: ls.y - rs.y,
      noseToShoulderZ: nose.z - shoulderMidZ,
      noseY: nose.y,
      shoulderMidY,
      face,
      capturedAt: Date.now(),
    };
  }
}

const STORAGE_KEY = "calibration_baseline";

export function saveBaseline(b: CalibrationBaseline): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
}

export function loadBaseline(): CalibrationBaseline | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as CalibrationBaseline;
    if (!("face" in b)) (b as CalibrationBaseline).face = null;
    return b;
  } catch {
    return null;
  }
}

export function clearBaseline(): void {
  localStorage.removeItem(STORAGE_KEY);
}
