import type {
  CalibrationBaseline,
  FaceData,
  Landmark,
  Landmarks,
} from "./types";
import { LANDMARK_INDEX } from "./types";

export type StretchKind =
  | "overhead"        // 양팔 위로 (기지개)
  | "behind_head"     // 양손 머리 뒤
  | "cross_body"      // 한 팔 반대편으로 (어깨 스트레치)
  | "side"            // 사이드 굽힘
  | "shoulder_shrug"  // 어깨 으쓱
  | "neck_side"       // 목 좌우 기울이기
  | "forward_fold";   // 상체 앞 숙이기

export type CameraAngle = "front" | "left" | "right";

/**
 * 실시간 face landmark 의 yaw 로 현재 카메라 각도 판정.
 *
 * 기존 `getCameraAngle()` 은 localStorage 의 `calibration_baseline` single-key (마지막 캘리브레이션 저장값) 만 봐서
 * 사용자가 다른 각도에서 사용 중일 때도 stale 한 값을 반환하는 구조적 결함이 있었습니다.
 * 이 헬퍼는 매 프레임 들어오는 face data 로 판정하므로 자동 카메라 각도 적응과 일관됩니다.
 *
 * face 가 없으면 안전한 기본값으로 "front" — 자세 검출 대부분의 함수가 face 없이도 동작하므로 OK.
 */
function liveAngleFromFace(face?: FaceData | null): CameraAngle {
  if (!face) return "front";
  const yawDeg = face.yaw * (180 / Math.PI);
  if (yawDeg > 12) return "right";
  if (yawDeg < -12) return "left";
  return "front";
}

const vis = (p: Landmark | undefined, t = 0.35): boolean =>
  !!p && p.visibility >= t;

/**
 * 양팔 위로 — 기지개.
 *   - 양 팔꿈치가 어깨보다 충분히 위(sw*0.20)
 *   - 양 손목이 코보다 위 OR 팔꿈치가 코보다 위 (손목 가려진 셀카 각도 대응)
 */
export function isOverheadStretch(lm: Landmarks): boolean {
  const ls = lm[LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = lm[LANDMARK_INDEX.RIGHT_SHOULDER];
  const le = lm[LANDMARK_INDEX.LEFT_ELBOW];
  const re = lm[LANDMARK_INDEX.RIGHT_ELBOW];
  const lw = lm[LANDMARK_INDEX.LEFT_WRIST];
  const rw = lm[LANDMARK_INDEX.RIGHT_WRIST];
  const nose = lm[LANDMARK_INDEX.NOSE];

  // 어깨와 코는 명확히 보여야 기준점이 잡힘 (가려짐을 유연하게 수용하기 위해 임계값 0.5 -> 0.20 하향)
  if (!vis(ls, 0.20) || !vis(rs, 0.20)) return false;
  if (!vis(nose, 0.20)) return false;

  const sw = Math.abs(ls.x - rs.x);
  // 자연스러운 기지개를 위해 가중치를 0.20 -> 0.15로 약간 완화
  const t = sw * 0.15;

  // 팔꿈치/손목이 위로 올라갔는지 판단하는 헬퍼
  // 카메라 화면 위쪽(y=0) 밖으로 나가 visibility가 낮아지더라도, 
  // 좌표상 화면 위쪽(y < 0.20)에 머물며 어깨보다 충분히 위에 있다면 스트레칭 중인 것으로 판단
  const isUp = (p: Landmark | undefined, shoulder: Landmark): boolean => {
    if (!p) return false;
    if (p.visibility >= 0.15) {
      return p.y < shoulder.y - t;
    }
    return p.y < 0.20 && p.y < shoulder.y - t;
  };

  // 양팔 중 어느 하나의 관절(팔꿈치 혹은 손목)이 어깨보다 높이 올라갔는지 검증
  // 사용자가 기지개를 켤 때 팔꿈치가 화면 좌우 바깥으로 나가거나 손목이 상단 경계 밖으로 나가
  // visibility가 급격히 하락하는 경우를 완벽하게 보완합니다.
  const leftArmUp = isUp(le, ls) || isUp(lw, ls);
  const rightArmUp = isUp(re, rs) || isUp(rw, rs);
  if (!leftArmUp || !rightArmUp) return false;

  // 양팔 각각 코나 눈보다 위에 위치한 관절이 최소한 하나 이상 존재해야 머리 위로 올린 "기지개"로 판정
  const leftAboveNose = (le && le.y < nose.y) || (lw && lw.y < nose.y);
  const rightAboveNose = (re && re.y < nose.y) || (rw && rw.y < nose.y);

  return leftAboveNose && rightAboveNose;
}

/**
 * 양손 머리 뒤 — 손목이 가려져도 팔꿈치가 귀 옆+위로 벌어지는 형태.
 *   - 양 팔꿈치 어깨 명확히 위(sw*0.10) + 어깨 바깥쪽(sw*0.18)
 *   - 손목은 귀 근처 또는 visibility 낮음(머리 뒤로 가려짐)
 *   - 적어도 한쪽 손목은 귀 근처 (양쪽 다 가려짐만으로는 trigger 안 됨)
 */
export function isBehindHead(lm: Landmarks): boolean {
  const ls = lm[LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = lm[LANDMARK_INDEX.RIGHT_SHOULDER];
  const lEar = lm[LANDMARK_INDEX.LEFT_EAR];
  const rEar = lm[LANDMARK_INDEX.RIGHT_EAR];
  const lw = lm[LANDMARK_INDEX.LEFT_WRIST];
  const rw = lm[LANDMARK_INDEX.RIGHT_WRIST];
  const le = lm[LANDMARK_INDEX.LEFT_ELBOW];
  const re = lm[LANDMARK_INDEX.RIGHT_ELBOW];
  // 머리 뒤 깍지 시 어깨 가림 완화를 위해 임계값 0.5 -> 0.20 하향
  if (!vis(ls, 0.20) || !vis(rs, 0.20)) return false;
  if (!vis(lEar, 0.20) || !vis(rEar, 0.20)) return false;
  if (!vis(le) || !vis(re)) return false;
  const sw = Math.abs(ls.x - rs.x);
  const radius = sw * 0.50;
  const nearEar = (w: Landmark | undefined, ear: Landmark): boolean =>
    !!w && w.visibility >= 0.3 && Math.hypot(w.x - ear.x, w.y - ear.y) < radius;
  const wristHidden = (w: Landmark | undefined): boolean =>
    !w || w.visibility < 0.3;
  const elbowOutUp = (e: Landmark, s: Landmark): boolean =>
    e.y < s.y - sw * 0.10 && Math.abs(e.x - s.x) > sw * 0.18;

  if (!elbowOutUp(le, ls) || !elbowOutUp(re, rs)) return false;
  const leftWristOk = nearEar(lw, lEar) || wristHidden(lw);
  const rightWristOk = nearEar(rw, rEar) || wristHidden(rw);
  if (!leftWristOk || !rightWristOk) return false;
  return nearEar(lw, lEar) || nearEar(rw, rEar);
}

/**
 * 한 팔이 반대편 어깨로 — 어깨 스트레치.
 *   - wrist visibility ≥ 0.5 (가려진 wrist는 무효)
 *   - wrist가 반대편 어깨 근접 (거리 < sw*0.45)
 *   - wrist가 가슴 영역 + 동측 wrist에서 충분히 떨어짐 (몸을 가로질러야)
 *   - 동측 팔꿈치가 어깨 근처 이상 (마우스 reach 차단)
 */
export function isCrossBody(lm: Landmarks, cameraAngle: CameraAngle): boolean {
  const ls = lm[LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = lm[LANDMARK_INDEX.RIGHT_SHOULDER];
  const lw = lm[LANDMARK_INDEX.LEFT_WRIST];
  const rw = lm[LANDMARK_INDEX.RIGHT_WRIST];
  const le = lm[LANDMARK_INDEX.LEFT_ELBOW];
  const re = lm[LANDMARK_INDEX.RIGHT_ELBOW];

  // 팔이 교차되면서 어깨가 극단적으로 가려져도 끊김없이 감지하도록 어깨 관절 신뢰도 조건을 0.5 -> 0.15로 파격 하향 조정
  if (!vis(ls, 0.15) || !vis(rs, 0.15)) return false;

  const sw = Math.abs(ls.x - rs.x);
  const midY = (ls.y + rs.y) / 2;

  // 실시간 카메라 각도에 따른 기하학적 X축 수축 보상 스케일링
  // [stale 제거] 기존 getCameraAngle() 은 localStorage 의 마지막 캘리브레이션 단일-키만 봐서 사용자의 현재 카메라 위치와 어긋날 수 있었습니다.
  // 이제 detectStretch 가 실시간 face yaw 로 판정한 각도를 인자로 전달하므로 자동 카메라 각도 적응과 일관됩니다.
  const isSideView = cameraAngle !== "front";
  
  // 측면 뷰인 경우 X축 2D 원근 왜곡을 보상하기 위해 손목/팔꿈치의 상대적 벡터 X축 통과 기준을 획기적으로 낮춰 극상의 감도를 보장합니다.
  const wristXThresh = isSideView ? sw * 0.22 : sw * 0.35; // 정면 0.40 -> 0.35로 완화
  const elbowXThresh = isSideView ? sw * 0.08 : sw * 0.12; // 정면 0.15 -> 0.12로 완화
  const wristVisThresh = 0.08; // 정면 기준 0.15 -> 0.08로 대폭 하향하여 가려진 손목 관절 수용
  const elbowVisThresh = 0.08;

  // Y축 정렬 허용 범위를 대폭 확장 (0.45 -> 0.65)
  const yThresh = sw * 0.65;

  // 1. 왼팔 스트레칭 (왼손과 왼팔꿈치가 오른어깨 방향으로 뻗음)
  const leftVector = rs.x - ls.x;
  
  // A. 정석 감지 (손목 신뢰도가 다소 잡혀 가려짐이 미미할 때)
  const leftNormalCrossed =
    vis(lw, wristVisThresh) && vis(le, elbowVisThresh) &&
    (lw.x - ls.x) * leftVector > 0 &&
    Math.abs(lw.x - ls.x) > wristXThresh &&
    (le.x - ls.x) * leftVector > 0 &&
    Math.abs(le.x - ls.x) > elbowXThresh &&
    Math.abs(le.y - midY) < yThresh &&
    Math.abs(lw.y - midY) < yThresh;

  // B. 가려짐 보완 폴백 (손목이 완전히 묻혀 신뢰도가 0.08 미만이지만 팔꿈치가 가슴을 질러 확실하게 꺾어 뻗은 경우)
  const leftOccludedCrossed =
    !vis(lw, wristVisThresh) && vis(le, 0.25) &&
    (le.x - ls.x) * leftVector > 0 &&
    Math.abs(le.x - ls.x) > sw * 0.32 && // 팔꿈치 자체가 몸 가슴 정중앙 깊이 들어옴
    Math.abs(le.y - midY) < yThresh;

  const leftArmCrossed = leftNormalCrossed || leftOccludedCrossed;

  // 2. 오른팔 스트레칭 (오른손과 오른팔꿈치가 왼어깨 방향으로 뻗음)
  const rightVector = ls.x - rs.x;
  
  const rightNormalCrossed =
    vis(rw, wristVisThresh) && vis(re, elbowVisThresh) &&
    (rw.x - rs.x) * rightVector > 0 &&
    Math.abs(rw.x - rs.x) > wristXThresh &&
    (re.x - rs.x) * rightVector > 0 &&
    Math.abs(re.x - rs.x) > elbowXThresh &&
    Math.abs(re.y - midY) < yThresh &&
    Math.abs(rw.y - midY) < yThresh;

  const rightOccludedCrossed =
    !vis(rw, wristVisThresh) && vis(re, 0.25) &&
    (re.x - rs.x) * rightVector > 0 &&
    Math.abs(re.x - rs.x) > sw * 0.32 &&
    Math.abs(re.y - midY) < yThresh;

  const rightArmCrossed = rightNormalCrossed || rightOccludedCrossed;

  return leftArmCrossed || rightArmCrossed;
}

/**
 * 사이드 굽힘 — 한쪽만 팔 위로 + 측면 기울임 + 머리도 같은 방향.
 */
export function isSideStretch(lm: Landmarks, cameraAngle: CameraAngle): boolean {
  const ls = lm[LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = lm[LANDMARK_INDEX.RIGHT_SHOULDER];
  const le = lm[LANDMARK_INDEX.LEFT_ELBOW];
  const re = lm[LANDMARK_INDEX.RIGHT_ELBOW];
  const nose = lm[LANDMARK_INDEX.NOSE];
  
  // 몸을 기울일 때 어깨 가림 현상 극복을 위해 임계값 0.5 -> 0.20 하향
  if (!vis(ls, 0.20) || !vis(rs, 0.20)) return false;
  if (!vis(le) || !vis(re) || !vis(nose, 0.20)) return false;

  const sw = Math.abs(ls.x - rs.x);
  const t = sw * 0.20;
  
  // 한쪽 팔꿈치만 어깨선 위로 올라갔는지 확인
  const leftUp = le.y < ls.y - t;
  const rightUp = re.y < rs.y - t;
  if (leftUp === rightUp) return false;

  const shoulderTilt = ls.y - rs.y;
  if (Math.abs(shoulderTilt) < 0.06) return false;

  // 실시간 카메라 각도를 고려한 이원화(Dynamic Branching) 처리
  // [stale 제거] 호출자(detectStretch)가 실시간 face yaw 로 판정해 전달한 각도 사용.
  if (cameraAngle === "front") {
    // 정면 모드: 머리와 어깨가 기울어진 방향의 부호 일치성을 정교하게 매칭
    const shoulderMidX = (ls.x + rs.x) / 2;
    const noseShift = nose.x - shoulderMidX;
    return Math.sign(shoulderTilt) === Math.sign(noseShift) && Math.abs(noseShift) > sw * 0.08;
  } else {
    // 좌/우측 45° 모드: 사선 원근 왜곡으로 인해 머리의 2D 부호가 완전히 뒤집히거나 압축될 수 있으므로,
    // 부호 일치 및 noseShift 수평 검사를 지능적으로 우회(Bypass)하고, 확실한 척추 수직 굽힘(Shoulder Tilt + Arm Raised) 형태로만 유연하게 감지
    return true;
  }
}

/**
 * 어깨 으쓱 — 양 어깨가 baseline 대비 명확히 위로 올라옴.
 * baseline 필요 (사용자별 평소 어깨 높이 비교).
 */
export function isShoulderShrug(
  lm: Landmarks,
  baseline: CalibrationBaseline | null | undefined,
): boolean {
  if (!baseline) return false;
  const ls = lm[LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = lm[LANDMARK_INDEX.RIGHT_SHOULDER];
  if (!vis(ls, 0.20) || !vis(rs, 0.20)) return false;
  
  const sw = Math.abs(ls.x - rs.x);
  if (sw < 0.05) return false;

  // [오감지 완벽 방어 체계]
  // 1. 손목 높이 차단: 양 손목이 어깨 높이 근처/위로 올라가 있다면 어깨 으쓱이 아닙니다.
  const lw = lm[LANDMARK_INDEX.LEFT_WRIST];
  const rw = lm[LANDMARK_INDEX.RIGHT_WRIST];
  if (lw && lw.visibility >= 0.15 && lw.y < ls.y + sw * 0.10) return false;
  if (rw && rw.visibility >= 0.15 && rw.y < rs.y + sw * 0.10) return false;

  // 2. 팔꿈치 높이 차단: 어깨 스트레칭(cross_body)이나 기지개 시 손목이 가려져서 위 차단막을 우회하더라도,
  // 무조건 가슴/어깨 높이로 들리는 양쪽 팔꿈치의 Y축 높이 변화를 통해 '어깨 으쓱' 오감지를 이중 차단합니다.
  const le = lm[LANDMARK_INDEX.LEFT_ELBOW];
  const re = lm[LANDMARK_INDEX.RIGHT_ELBOW];
  if (le && le.visibility >= 0.15 && le.y < ls.y + sw * 0.10) return false;
  if (re && re.visibility >= 0.15 && re.y < rs.y + sw * 0.10) return false;

  // 3. 팔꿈치 X(가로) 차단: cross_body 의 transitional phase 차단.
  // cross_body 는 어깨 lift 가 동반되는 ~2~4초 sequence 인데, 초기·중기엔 손목·팔꿈치 Y 가 아직 어깨선까지 못 올라와 Y 가드를 통과합니다.
  // 그 사이 어깨가 보상 운동으로 올라가면 셔그로 잡혀 isCrossBody 가 완성되기 전에 셔그 보너스가 먼저 발화하는 버그가 발생.
  // 자기 어깨에서 몸 중앙 쪽으로 sw*0.15 이상 들어온 팔꿈치는 cross_body 진행 중으로 보고 셔그 차단. 안식 자세의 자연스러운 약간 안쪽 위치(< sw*0.15)는 통과.
  const shoulderMidX = (ls.x + rs.x) / 2;
  const xGuardThresh = sw * 0.35; // sw/2 (어깨~중앙 거리) - sw*0.15 (마진)
  if (le && le.visibility >= 0.15 && Math.abs(le.x - shoulderMidX) < xGuardThresh) return false;
  if (re && re.visibility >= 0.15 && Math.abs(re.x - shoulderMidX) < xGuardThresh) return false;

  const midY = (ls.y + rs.y) / 2;
  // baseline 대비 어깨가 sw*0.42 이상 위로 (음수) — 과민감(일반적 어깨 들림 오감지) 완화로
  // 0.35→0.42 상향. 의도적이고 뚜렷한 으쓱만 인정.
  const lift = baseline.shoulderMidY - midY;
  if (lift < sw * 0.42) return false;
  // 양쪽 모두 올라가야 (한쪽만이면 사이드 굽힘 또는 비대칭) — 각 어깨 임계 0.24→0.30 상향.
  return ls.y < baseline.meanLandmarks[LANDMARK_INDEX.LEFT_SHOULDER].y - sw * 0.30 &&
         rs.y < baseline.meanLandmarks[LANDMARK_INDEX.RIGHT_SHOULDER].y - sw * 0.30;
}

/**
 * 목 좌우 기울이기 — face roll이 baseline 대비 명확히 큼 + 어깨는 거의 수평.
 * face landmarker 필수.
 */
export function isNeckSide(
  lm: Landmarks,
  face: FaceData | null | undefined,
  baseline: CalibrationBaseline | null | undefined,
): boolean {
  if (!face || !baseline?.face) return false;
  const ls = lm[LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = lm[LANDMARK_INDEX.RIGHT_SHOULDER];
  if (!vis(ls, 0.20) || !vis(rs, 0.20)) return false;
  const rollDelta = face.roll - baseline.face.roll;
  if (Math.abs(rollDelta) < 0.25) return false;  // ~14도 이상
  // 어깨는 baseline 기울임에서 크게 변하지 않아야 (사이드 굽힘과 구분)
  const shoulderTilt = ls.y - rs.y;
  if (Math.abs(shoulderTilt - baseline.shoulderTiltY) > 0.04) return false;
  return true;
}

/**
 * 상체 앞 숙이기 — 코와 어깨가 baseline 대비 명확히 아래 + face pitch 앞으로(양수).
 */
export function isForwardFold(
  lm: Landmarks,
  face: FaceData | null | undefined,
  baseline: CalibrationBaseline | null | undefined,
): boolean {
  if (!baseline) return false;
  const nose = lm[LANDMARK_INDEX.NOSE];
  const ls = lm[LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = lm[LANDMARK_INDEX.RIGHT_SHOULDER];
  // 상체를 숙일 때 어깨 및 코 가림 현상 극복을 위해 임계값 0.5 -> 0.20 하향
  if (!vis(ls, 0.20) || !vis(rs, 0.20) || !vis(nose, 0.20)) return false;
  const sw = Math.abs(ls.x - rs.x);
  if (sw < 0.05) return false;
  // 코가 baseline 대비 sw*0.45 이상 아래 — 과민감(미세 움직임 오감지) 완화로 0.30→0.45 상향.
  // 화면 쪽으로 다가가거나 의자에서 살짝 내려앉는 평행이동은 통과시키지 않음.
  const noseDrop = nose.y - baseline.noseY;
  if (noseDrop < sw * 0.45) return false;
  // 어깨도 baseline 대비 sw*0.25 이상 아래 (0.15→0.25 상향).
  const shoulderDrop = (ls.y + rs.y) / 2 - baseline.shoulderMidY;
  if (shoulderDrop < sw * 0.25) return false;
  // face 있으면 pitch(턱이 내려가는 3D 머리 각도)가 명확히 앞으로 숙여야 확정.
  // [핵심 수정] 기존엔 "뒤로 젖힘(pitchDelta < -0.10)"만 차단해 머리 각도가 그대로인
  // 아래쪽 평행이동도 전부 통과했음 → 미세 움직임이 상체 숙이기로 오감지되던 주원인.
  // 진짜 상체 앞 숙이기는 머리가 함께 숙여져 pitchDelta가 뚜렷한 양수가 되므로 이를 필수 조건으로 격상.
  if (face && baseline.face) {
    const pitchDelta = face.pitch - baseline.face.pitch;
    if (pitchDelta < 0.15) return false;  // ~8.6도 이상 실제 고개 숙임 요구
  }
  return true;
}

/**
 * @deprecated 자세·스트레치 검출 경로에서는 사용 금지. localStorage 의 마지막 캘리브레이션 single-key 만 보므로
 * 사용자의 현재 카메라 각도와 stale 어긋남이 발생합니다. 실시간 판정이 필요한 곳은 `liveAngleFromFace(face)` 또는
 * 호출자가 가지고 있는 face data 로 직접 판정하세요. UI 의 마지막 캘리브레이션 각도 표시 같은 비검출 용도에만 한정.
 */
export function getCameraAngle(): CameraAngle {
  if (typeof window === "undefined") return "front";
  try {
    const rawBaseline = localStorage.getItem("calibration_baseline");
    if (!rawBaseline) return "front";
    const baseline = JSON.parse(rawBaseline);
    if (!baseline || !baseline.face) return "front";
    const yawDeg = baseline.face.yaw * (180 / Math.PI);
    if (yawDeg > 12) return "right";
    if (yawDeg < -12) return "left";
  } catch (e) {}
  return "front";
}

export interface NormalizedPose {
  [idx: number]: { x: number; y: number; z: number; visibility?: number };
}

export function normalizePose(lm: Landmarks): NormalizedPose | null {
  const ls = lm[LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = lm[LANDMARK_INDEX.RIGHT_SHOULDER];
  if (!ls || !rs || ls.visibility < 0.1 || rs.visibility < 0.1) return null;
  const cx = (ls.x + rs.x) / 2;
  const cy = (ls.y + rs.y) / 2;
  const cz = (ls.z + rs.z) / 2;
  const sw = Math.abs(ls.x - rs.x);
  if (sw < 0.01) return null;

  const result: NormalizedPose = {};
  const indices = [0, 7, 8, 11, 12, 13, 14, 15, 16];
  for (const idx of indices) {
    const p = lm[idx];
    if (p) {
      result[idx] = {
        x: (p.x - cx) / sw,
        y: (p.y - cy) / sw,
        z: (p.z - cz) / sw,
        visibility: p.visibility !== undefined ? Number(p.visibility.toFixed(4)) : undefined,
      };
    }
  }
  return result;
}

export const STRETCH_WEIGHTS: Record<StretchKind, Record<number, number>> = {
  overhead: { 15: 3, 16: 3, 13: 3, 14: 3, 11: 1, 12: 1, 0: 1, 7: 1, 8: 1 },
  behind_head: { 13: 3, 14: 3, 15: 2, 16: 2, 11: 1, 12: 1, 7: 1, 8: 1 },
  // 전신 자세 템플릿 매칭 강화를 위해 다른 스트레칭에도 누락된 부위(얼굴 및 양팔)를 낮은 가중치로 보강합니다.
  // 이를 통해 머리 및 어깨 랜드마크만 비교하여 서로 다른 동작이 혼선되어 감지되는 일을 원천 방지합니다.
  cross_body: { 15: 3, 16: 3, 13: 3, 14: 3, 11: 1, 12: 1, 0: 1, 7: 1, 8: 1 },
  side: { 13: 3, 14: 3, 15: 3, 16: 3, 11: 1, 12: 1, 0: 1, 7: 1, 8: 1 },
  shoulder_shrug: { 11: 3, 12: 3, 0: 1, 7: 1, 8: 1, 13: 1, 14: 1, 15: 1, 16: 1 },
  neck_side: { 0: 3, 7: 3, 8: 3, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1 },
  forward_fold: { 0: 3, 11: 3, 12: 3, 13: 1, 14: 1, 15: 1, 16: 1 },
};

export const STRETCH_THRESHOLDS: Record<StretchKind, number> = {
  overhead: 0.30,       // 기지개는 팔의 궤적이 넓어 유연하게 30% 오차 허용 (체감 감도 극대화)
  behind_head: 0.30,    // 목 풀기도 30% 오차 허용 (감도 극대화)
  cross_body: 0.30,     // 어깨 스트레치도 30% 오차 허용 (감도 극대화)
  side: 0.30,           // 사이드 굽힘도 30% 오차 허용 (감도 극대화)
  shoulder_shrug: 0.14, // 어깨 으쓱은 미세한 으쓱임 감지를 위해 14% 고수
  neck_side: 0.15,      // 목 좌우 풀기는 15% 허용
  forward_fold: 0.18,   // 상체 앞 숙이기는 18% 허용
};

// 어드민 시스템 제어판에서 보정한 표준 가동범위 데이터셋을 붙여넣는 마스터 데이터베이스입니다.
// 여기에 어드민 도구에서 복사한 JSON 코드 내부의 'pose' 객체를 알맞은 키값 아래 덮어씌웁니다.
export const DEFAULT_TEMPLATES: Record<string, { pose: NormalizedPose }> = {
  // 예: "overhead_front": { pose: { ... } },
  // 예: "overhead_left": { pose: { ... } },
  // 예: "overhead_right": { pose: { ... } },
};

export function computePoseDistance(
  live: NormalizedPose,
  template: NormalizedPose,
  weights: Record<number, number>
): number {
  let sumWeightedDist = 0;
  let sumWeights = 0;
  for (const idxStr in template) {
    const idx = Number(idxStr);
    const p1 = live[idx];
    const p2 = template[idx];
    if (!p1 || !p2) continue;
    
    // 관절 가림 노이즈 필터링: 실시간 자세 혹은 템플릿에서 가려진 관절(신뢰도 < 0.25)은 계산에서 제외
    if (p1.visibility !== undefined && p1.visibility < 0.25) continue;
    if (p2.visibility !== undefined && p2.visibility < 0.25) continue;

    const w = weights[idx] ?? 1.0;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    const dist = Math.hypot(dx, dy, dz);
    sumWeightedDist += dist * w;
    sumWeights += w;
  }
  return sumWeights > 0 ? sumWeightedDist / sumWeights : Infinity;
}

export interface CustomTemplateData {
  pose: NormalizedPose;
  capturedAt: number;
}

export function loadCustomTemplates(): Record<string, CustomTemplateData> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("barosit:custom_stretch_templates");
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {}
  return {};
}

export function loadAdminTemplates(): Record<string, CustomTemplateData> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("barosit:admin_templates");
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {}
  return {};
}

/**
 * 템플릿의 가로 방향을 반전하여 반대편(좌우) 스트레칭 템플릿을 자동으로 유도합니다.
 * 이를 통해 사용자가 한쪽 방향만 보정 등록하더라도 반대쪽 방향까지 자동으로 감지할 수 있습니다.
 */
export function mirrorNormalizedPose(pose: NormalizedPose): NormalizedPose {
  const mirrored: NormalizedPose = {};

  // 좌우 대칭 교환이 필요한 MediaPipe 랜드마크 인덱스 쌍
  const swapMap: Record<number, number> = {
    11: 12, 12: 11, // Left/Right shoulders
    13: 14, 14: 13, // Left/Right elbows
    15: 16, 16: 15, // Left/Right wrists
    7: 8, 8: 7,     // Left/Right ears
  };

  for (const [keyStr, pt] of Object.entries(pose)) {
    const idx = Number(keyStr);
    const targetIdx = swapMap[idx] ?? idx;
    if (pt) {
      mirrored[targetIdx] = {
        x: Number((-pt.x).toFixed(4)), // 어깨 중심(0,0,0) 정규화 좌표이므로 단순 부호 반전(-X)으로 좌우 대칭 적용
        y: pt.y,
        z: Number((-pt.z).toFixed(4)), // 45도 측면 카메라 원근/깊이 왜곡 해결을 위해 Z좌표(깊이)도 함께 부호 반전 적용!
        visibility: pt.visibility,
      };
    }
  }

  return mirrored;
}

export function detectStretch(
  lm: Landmarks,
  face?: FaceData | null,
  baseline?: CalibrationBaseline | null,
): StretchKind | null {
  // [stale 제거] 실시간 face yaw 로 각도 판정. 기존 getCameraAngle() 의 localStorage stale 참조를 함수 진입 시 한 번에 해결합니다.
  const currentAngle = liveAngleFromFace(face);

  // 1. 개인화된 커스텀 템플릿 판정 (등록된 템플릿이 있는 경우 최우선 적용)
  const normalized = normalizePose(lm);
  if (normalized) {
    const customTemplates = loadCustomTemplates();
    const adminTemplates = loadAdminTemplates();
    const kinds: StretchKind[] = [
      "behind_head",
      "overhead",
      "forward_fold",
      "side",
      "cross_body",
      "shoulder_shrug",
      "neck_side",
    ];

    for (const kind of kinds) {
      const key = `${kind}_${currentAngle}`;
      
      // 우선순위 1: 사용자가 직접 보정한 개인화 템플릿
      // 우선순위 2: 어드민이 UI에서 실시간 적용한 보정 표준 템플릿
      // 우선순위 3: 어드민이 코드에 등록하여 배포한 공통 기본값 표준 템플릿 (DEFAULT_TEMPLATES)
      const templateData = customTemplates[key] || adminTemplates[key] || DEFAULT_TEMPLATES[key];

      if (templateData && templateData.pose) {
        const weights = STRETCH_WEIGHTS[kind];
        
        // 원본 템플릿과의 L2 거리 계산 (예: 사용자가 캡처한 방향)
        const distOriginal = computePoseDistance(normalized, templateData.pose, weights);
        
        // 자동으로 유도된 반대편 대칭(좌우 반전) 템플릿 생성
        const mirroredPose = mirrorNormalizedPose(templateData.pose);
        const distMirrored = computePoseDistance(normalized, mirroredPose, weights);

        // 각 스트레칭 성격에 따른 맞춤 임계치(Threshold) 허용 폭 적용
        const threshold = STRETCH_THRESHOLDS[kind] ?? 0.14;
        if (distOriginal <= threshold || distMirrored <= threshold) {
          return kind;
        }
      }
    }
  }

  // 2. 커스텀 템플릿이 없거나 매칭되지 않은 경우, 해부학적으로 튜닝된 기본 휴리스틱 검사기로 완벽한 폴백 제공
  if (isBehindHead(lm)) return "behind_head";
  if (isOverheadStretch(lm)) return "overhead";
  if (isForwardFold(lm, face, baseline)) return "forward_fold";
  if (isSideStretch(lm, currentAngle)) return "side";
  if (isCrossBody(lm, currentAngle)) return "cross_body";
  if (isNeckSide(lm, face, baseline)) return "neck_side";
  if (isShoulderShrug(lm, baseline)) return "shoulder_shrug";
  return null;
}

const BONUS_BY_KIND: Record<StretchKind, number> = {
  overhead: 5,
  behind_head: 5,
  cross_body: 4,
  side: 3,
  shoulder_shrug: 3,
  neck_side: 4,
  forward_fold: 5,
};

/**
 * 스트레칭이 일정 시간(기본 2초) 유지되면 보너스를 발사한다.
 * 같은 종류 보너스는 쿨다운(기본 60초) 내 중복 방지.
 */
export class StretchTracker {
  private activeKind: StretchKind | null = null;
  private enteredAt = 0;
  private lastDetectedAt = 0;
  private awarded = false;
  private lastBonusAt: Record<StretchKind, number> = {
    overhead: 0,
    behind_head: 0,
    cross_body: 0,
    side: 0,
    shoulder_shrug: 0,
    neck_side: 0,
    forward_fold: 0,
  };

  constructor(
    private readonly minHoldMs = 2000,
    private readonly cooldownMs = 30000,
    /** 검출이 끊기더라도 이 시간 안에 다시 잡히면 같은 동작으로 본다 */
    private readonly gapToleranceMs = 1000,
  ) {}

  push(
    kind: StretchKind | null,
    now = Date.now(),
  ): { kind: StretchKind; amount: number } | null {
    if (kind === null) {
      if (
        this.activeKind &&
        now - this.lastDetectedAt > this.gapToleranceMs
      ) {
        this.activeKind = null;
        this.enteredAt = 0;
        this.awarded = false;
      }
      return null;
    }

    this.lastDetectedAt = now;

    if (this.activeKind !== kind) {
      this.activeKind = kind;
      this.enteredAt = now;
      this.awarded = false;
      return null;
    }

    if (this.awarded) {
      return null;
    }

    const held = now - this.enteredAt;
    if (held < this.minHoldMs) return null;
    if (now - this.lastBonusAt[kind] < this.cooldownMs) return null;
    
    this.lastBonusAt[kind] = now;
    this.awarded = true;
    return { kind, amount: BONUS_BY_KIND[kind] };
  }

  reset(): void {
    this.activeKind = null;
    this.enteredAt = 0;
    this.lastDetectedAt = 0;
    this.awarded = false;
  }
}

export const STRETCH_LABEL: Record<StretchKind, string> = {
  overhead: "기지개",
  behind_head: "목 풀기",
  cross_body: "어깨 스트레치",
  side: "사이드 굽힘",
  shoulder_shrug: "어깨 으쓱",
  neck_side: "목 좌우 풀기",
  forward_fold: "상체 앞 숙이기",
};
