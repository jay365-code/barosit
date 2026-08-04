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

// UX-1: 이 비율 미만으로 통과한 적합성 항목을 "부족했던 항목"으로 안내
const MIN_OK_RATIO_FOR_HINT = 0.65;

const DEG = Math.PI / 180;
// 카메라 위치(정면/측면)에 무관한 절대 한도만 검증한다.
const MAX_FACE_PITCH = 20 * DEG;
const MAX_FACE_ROLL = 15 * DEG;
const MAX_POSE_DRIFT = 0.07;        // 자연스러운 호흡·미세 움직임 허용

// drift() 를 계산하기에 충분한 최소 샘플 수.
//
// Why: 예전엔 창이 maxLen(12) 까지 다 차야 drift 를 냈고, 그 전엔 Infinity →
// stable=false 였다. 캡처 시작마다 창을 비웠으므로 **모든 캡처의 앞 12프레임이
// 불합격 확정**이었다. 5초·65% 기준에서 이는 유효 6fps 이하 기기에서 아무리
// 미동도 없이 앉아 있어도 통과가 수학적으로 불가능하다는 뜻이다(측정: 6fps →
// 최대 okRatio 0.633 < 0.65). 실제로 프로덕션 실패 21건 중 20건이 `stable` 단독
// 사유였다.
//
// How: 샘플이 이만큼만 모이면 판정을 시작한다. 샘플이 적을수록 평균 대비 편차도
// 작게 나오므로 워밍업 구간은 관대한 쪽으로 기운다 — 게이트의 목적(캡처 대부분이
// 정지 상태일 것)은 나머지 프레임이 지킨다.
const MIN_STABILITY_SAMPLES = 4;

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
    if (this.samples.length < Math.min(this.maxLen, MIN_STABILITY_SAMPLES)) {
      return Infinity;
    }
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
  const currentAngle = determineAngle(face);
  const isSideAngle = currentAngle === "left" || currentAngle === "right";

  // 측면 카메라 각도에서는 3D->2D 투영 왜곡 및 Yaw 회전에 따른 Roll-Pitch Coupling 왜곡이 발생하므로 임계값을 넉넉하게 완화합니다.
  const maxPitch = isSideAngle ? 38 * DEG : MAX_FACE_PITCH;
  const maxRoll = isSideAngle ? 35 * DEG : MAX_FACE_ROLL;

  const headNotTiltedDown = face ? Math.abs(face.pitch) < maxPitch : true;
  const headUpright = face ? Math.abs(face.roll) < maxRoll : true;

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

// 적합성 5개 항목(allOk 제외)
const CHECK_FIELDS: (keyof CalibrationCheck)[] = [
  "bodyVisible",
  "headNotTiltedDown",
  "headUpright",
  "noChinRest",
  "stable",
];

export class CalibrationCollector {
  private frames: Landmarks[] = [];
  private faceFrames: FaceData[] = [];
  // frames/faceFrames 와 같은 길이의 적합 여부 플래그 — build() 가 적합 프레임만 쓰기 위함.
  private poseOk: boolean[] = [];
  private faceOk: boolean[] = [];
  private okFrames = 0;
  private totalFrames = 0;
  // UX-1: 항목별 통과 프레임 수 — 실패 시 "무엇이 부족했는지" 안내용
  private checkPass: Record<string, number> = {};
  private stability: StabilityWindow;
  // 외부에서 주입된 창은 소유자가 아니므로 reset() 이 건드리지 않는다.
  private readonly ownsStability: boolean;

  /**
   * @param stability 라이브 미리보기에서 이미 돌고 있던 창을 넘기면 캡처가
   *   **예열된 상태로** 시작한다(A: 워밍업 구멍 제거). 넘기지 않으면 자체 창을
   *   만들어 쓰고 reset() 이 함께 비운다.
   *   주의: 같은 프레임에 대해 checkCalibrationFrame 을 중복 호출하면 창에
   *   같은 샘플이 두 번 들어가 유효 창 길이가 절반이 된다. 캡처 중에는
   *   pushFrame 이 돌려주는 결과를 재사용할 것.
   */
  constructor(stability?: StabilityWindow) {
    this.stability = stability ?? new StabilityWindow();
    this.ownsStability = !stability;
  }

  pushPose(landmarks: Landmarks, ok = true): void {
    this.frames.push(landmarks);
    this.poseOk.push(ok);
  }
  pushFace(face: FaceData, ok = true): void {
    this.faceFrames.push(face);
    this.faceOk.push(ok);
  }
  /** 프레임을 적재하고 그 프레임의 적합성 판정을 돌려준다(호출부가 재사용). */
  pushFrame(frame: DetectionFrame): CalibrationCheck {
    const check = checkCalibrationFrame(frame, this.stability);
    if (frame.pose) this.pushPose(frame.pose, check.allOk);
    if (frame.face) this.pushFace(frame.face, check.allOk);
    this.totalFrames += 1;
    if (check.allOk) this.okFrames += 1;
    for (const k of CHECK_FIELDS) {
      if (check[k]) this.checkPass[k] = (this.checkPass[k] || 0) + 1;
    }
    return check;
  }
  push(landmarks: Landmarks): void {
    this.pushPose(landmarks);
  }
  count(): number {
    return this.frames.length;
  }
  /** 측정용 — 적재된 전체 프레임 수(유효 fps 역산에 쓰인다). */
  frameCount(): number {
    return this.totalFrames;
  }
  okRatio(): number {
    if (this.totalFrames === 0) return 0;
    return this.okFrames / this.totalFrames;
  }
  /** 항목별 통과 비율 (0~1) */
  checkPassRatios(): Record<keyof CalibrationCheck, number> {
    const out = {} as Record<keyof CalibrationCheck, number>;
    for (const k of CHECK_FIELDS) {
      out[k] = this.totalFrames === 0 ? 0 : (this.checkPass[k] || 0) / this.totalFrames;
    }
    return out;
  }
  /** 통과율이 threshold 미만인 항목을 통과율 오름차순(가장 부족한 순)으로 반환 */
  weakestChecks(threshold = MIN_OK_RATIO_FOR_HINT): (keyof CalibrationCheck)[] {
    const ratios = this.checkPassRatios();
    return CHECK_FIELDS
      .filter((k) => ratios[k] < threshold)
      .sort((a, b) => ratios[a] - ratios[b]);
  }
  reset(): void {
    this.frames = [];
    this.faceFrames = [];
    this.poseOk = [];
    this.faceOk = [];
    this.okFrames = 0;
    this.totalFrames = 0;
    this.checkPass = {};
    // 주입된 창은 라이브 미리보기가 계속 채우고 있으므로 비우지 않는다 — 이걸
    // 비우면 캡처가 다시 12프레임 데드존에서 시작한다(A 가 고친 그 문제).
    if (this.ownsStability) this.stability.reset();
  }
  build(): CalibrationBaseline {
    // F: baseline 은 **적합(allOk) 프레임만**으로 만든다.
    //
    // Why: 게이트는 65% 만 넘으면 통과시키는데 예전 build() 는 불합격 프레임까지
    // 전부 평균에 넣었다. 즉 통과한 캘리브레이션조차 최대 35% 의 불량 프레임(고개
    // 숙임·턱 괴기·움직이는 중)이 섞인 baseline 을 만들었고, 그 baseline 이 이후
    // 모든 자세 판정의 기준이 됐다. 실패한 사용자가 아니라 **성공한 사용자 전원**에게
    // 적용되던 품질 손실이다.
    //
    // 부수효과: 빌더가 튼튼해진 만큼 게이트를 더 풀어도 정확도가 나빠지지 않는다.
    const okPose = this.frames.filter((_, i) => this.poseOk[i]);
    const frames = okPose.length > 0 ? okPose : this.frames;
    const okFace = this.faceFrames.filter((_, i) => this.faceOk[i]);
    const faceFrames = okFace.length > 0 ? okFace : this.faceFrames;

    if (frames.length === 0) {
      throw new Error("No calibration frames collected");
    }
    const numLm = frames[0].length;
    const mean: Landmark[] = [];
    for (let i = 0; i < numLm; i++) {
      let x = 0,
        y = 0,
        z = 0,
        v = 0;
      for (const f of frames) {
        x += f[i].x;
        y += f[i].y;
        z += f[i].z;
        v += f[i].visibility;
      }
      const n = frames.length;
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
    if (faceFrames.length > 0) {
      let pitch = 0, yaw = 0, roll = 0, tz = 0;
      for (const f of faceFrames) {
        pitch += f.pitch; yaw += f.yaw; roll += f.roll; tz += f.tz;
      }
      const n = faceFrames.length;
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

import type { MultiAngleBaseline } from "./types";

const STORAGE_KEY_MULTI = "calibration_baseline_multi";

export function determineAngle(face: FaceData | null): "front" | "left" | "right" {
  if (!face) return "front";
  const yawDeg = face.yaw * (180 / Math.PI);
  if (yawDeg > 12) return "right";
  if (yawDeg < -12) return "left";
  return "front";
}

/**
 * Hysteresis 가 적용된 각도 판정.
 *
 * Why: determineAngle 은 ±12° hard threshold 라 사용자가 자연스럽게 모니터를
 * 보면서 yaw 가 임계 근처에서 미세 진동하면 매 프레임 angle 이 flap 한다.
 * 각 flap 은 setBaseline / dispatchEvent / re-render 를 폭주시켜 V8 heap
 * 누수를 유발한다 (실측: 2.2 MB/s 증가, region 매초 +37).
 *
 * How: 진입 임계 ±12° (기존과 동일), 이탈 임계 ±8°. lastAngle 이 null 이면
 * 기존 determineAngle 과 동일 동작 → 첫 호출 안전.
 */
export function determineAngleSticky(
  face: FaceData | null,
  lastAngle: "front" | "left" | "right" | null,
): "front" | "left" | "right" {
  if (!face) return lastAngle ?? "front";
  const yawDeg = face.yaw * (180 / Math.PI);
  const ENTER = 12;
  const EXIT = 8;

  switch (lastAngle) {
    case "right":
      // right 상태 유지 조건: yaw 가 EXIT 보다 큼. 작아지면 front/left 재판정.
      if (yawDeg > EXIT) return "right";
      if (yawDeg < -ENTER) return "left";
      return "front";
    case "left":
      if (yawDeg < -EXIT) return "left";
      if (yawDeg > ENTER) return "right";
      return "front";
    case "front":
    case null:
    default:
      if (yawDeg > ENTER) return "right";
      if (yawDeg < -ENTER) return "left";
      return "front";
  }
}

export function loadMultiBaseline(): MultiAngleBaseline {
  const raw = localStorage.getItem(STORAGE_KEY_MULTI);
  if (!raw) {
    return { front: null, left: null, right: null };
  }
  try {
    const multi = JSON.parse(raw) as MultiAngleBaseline;
    return {
      front: multi.front || null,
      left: multi.left || null,
      right: multi.right || null,
    };
  } catch {
    return { front: null, left: null, right: null };
  }
}

export function saveBaseline(b: CalibrationBaseline): void {
  const multi = loadMultiBaseline();
  const angle = determineAngle(b.face);
  multi[angle] = b;
  localStorage.setItem(STORAGE_KEY_MULTI, JSON.stringify(multi));
  
  // 하위 호환용 단일 키(calibration_baseline) 갱신 (마이그레이션 안전성)
  localStorage.setItem("calibration_baseline", JSON.stringify(b));
}

/**
 * [좌표계 통일] angle-specific baseline 을 그대로 반환합니다.
 *
 * 과거 구현은 `baseline.shoulderWidth` 만 cos(yaw) 로 restored 한 frontal-equivalent max 값으로 대체했으나,
 * 그 결과 같은 baseline 객체 안에서 좌표계가 두 가지로 섞이는 구조적 버그가 있었습니다:
 *   - `meanLandmarks`, `shoulderTiltY`, `noseY`, `shoulderMidY` 등은 calibration 시점의 **2D 측면 시점 (foreshortened)** 값
 *   - `shoulderWidth` 만 정면 환산 max 값 (다른 필드와 좌표계 불일치)
 *
 * analyzer.ts 가 `baseline.shoulderWidth` 를 X-방향 거리 threshold 의 scale 로 30+ 곳에서 사용하므로,
 * 측면 시점에서 모든 X-방향 임계가 15~25% inflated 되어 phantom hand 필터가 헐거워지고
 * chin_resting 등 false positive 가 잘 발생하던 원인이었습니다.
 *
 * 이제 angle-specific baseline 의 native shoulderWidth (해당 각도의 foreshortened 2D 폭) 를 그대로 사용해
 * 동일 baseline 객체 내부의 좌표계 일관성을 복원합니다.
 * - 사용자가 right 각도에서 right baseline 으로 평가받으면 live frame 도 right 의 foreshortened scale → 일치
 * - front 각도에서 front baseline 으로 평가받으면 양쪽 다 frontal scale → 일치
 */
export function loadBaseline(angle?: "front" | "left" | "right"): CalibrationBaseline | null {
  const multi = loadMultiBaseline();
  if (angle) {
    return multi[angle] ?? null;
  }
  const raw = localStorage.getItem("calibration_baseline");
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
  localStorage.removeItem(STORAGE_KEY_MULTI);
  localStorage.removeItem("calibration_baseline");
}
