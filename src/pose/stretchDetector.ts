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

  // 어깨와 코는 명확히 보여야 기준점이 잡힘
  if (!vis(ls, 0.5) || !vis(rs, 0.5)) return false;
  if (!vis(nose, 0.4)) return false;

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
  if (!vis(ls, 0.5) || !vis(rs, 0.5)) return false;
  if (!vis(lEar, 0.4) || !vis(rEar, 0.4)) return false;
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
export function isCrossBody(lm: Landmarks): boolean {
  const ls = lm[LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = lm[LANDMARK_INDEX.RIGHT_SHOULDER];
  const lw = lm[LANDMARK_INDEX.LEFT_WRIST];
  const rw = lm[LANDMARK_INDEX.RIGHT_WRIST];
  const le = lm[LANDMARK_INDEX.LEFT_ELBOW];
  const re = lm[LANDMARK_INDEX.RIGHT_ELBOW];
  if (!vis(ls, 0.5) || !vis(rs, 0.5)) return false;

  const sw = Math.abs(ls.x - rs.x);
  const midY = (ls.y + rs.y) / 2;
  const close = (w: Landmark, opp: Landmark): boolean =>
    Math.hypot(w.x - opp.x, w.y - opp.y) < sw * 0.45;
  const aroundChest = (w: Landmark) => Math.abs(w.y - midY) < sw * 0.45;
  const elbowAcross = (elbow: Landmark | undefined, sameShoulder: Landmark): boolean =>
    !!elbow && vis(elbow) && elbow.y > sameShoulder.y - sw * 0.15;
  // 어깨 컨벤션(LS.x vs RS.x 대소)에 무관하게 동작 — wrist가 어깨 중점을
  // 반대편 어깨 방향으로 sw*0.15 이상 넘어가면 "건너감".
  const midX = (ls.x + rs.x) / 2;
  const dirL = Math.sign(rs.x - ls.x); // ls→rs 방향 부호
  const lCrossed = (w: Landmark) => dirL * (w.x - midX) > sw * 0.15;
  const rCrossed = (w: Landmark) => -dirL * (w.x - midX) > sw * 0.15;

  if (
    vis(lw, 0.5) && lCrossed(lw) && close(lw, rs) && aroundChest(lw) &&
    elbowAcross(le, ls)
  ) return true;
  if (
    vis(rw, 0.5) && rCrossed(rw) && close(rw, ls) && aroundChest(rw) &&
    elbowAcross(re, rs)
  ) return true;
  return false;
}

/**
 * 사이드 굽힘 — 한쪽만 팔 위로 + 측면 기울임 + 머리도 같은 방향.
 */
export function isSideStretch(lm: Landmarks): boolean {
  const ls = lm[LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = lm[LANDMARK_INDEX.RIGHT_SHOULDER];
  const le = lm[LANDMARK_INDEX.LEFT_ELBOW];
  const re = lm[LANDMARK_INDEX.RIGHT_ELBOW];
  const nose = lm[LANDMARK_INDEX.NOSE];
  if (!vis(ls, 0.5) || !vis(rs, 0.5)) return false;
  if (!vis(le) || !vis(re) || !vis(nose, 0.4)) return false;

  const sw = Math.abs(ls.x - rs.x);
  const t = sw * 0.20;
  const leftUp = le.y < ls.y - t;
  const rightUp = re.y < rs.y - t;
  if (leftUp === rightUp) return false;

  const shoulderTilt = ls.y - rs.y;
  if (Math.abs(shoulderTilt) < 0.06) return false;

  const shoulderMidX = (ls.x + rs.x) / 2;
  const noseShift = nose.x - shoulderMidX;
  return Math.sign(shoulderTilt) === Math.sign(noseShift) && Math.abs(noseShift) > sw * 0.08;
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
  if (!vis(ls, 0.5) || !vis(rs, 0.5)) return false;
  const sw = Math.abs(ls.x - rs.x);
  if (sw < 0.05) return false;
  const midY = (ls.y + rs.y) / 2;
  // baseline 대비 어깨가 sw*0.20 이상 위로 (음수)
  const lift = baseline.shoulderMidY - midY;
  if (lift < sw * 0.20) return false;
  // 양쪽 모두 올라가야 (한쪽만이면 사이드 굽힘 또는 비대칭)
  return ls.y < baseline.meanLandmarks[LANDMARK_INDEX.LEFT_SHOULDER].y - sw * 0.10 &&
         rs.y < baseline.meanLandmarks[LANDMARK_INDEX.RIGHT_SHOULDER].y - sw * 0.10;
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
  if (!vis(ls, 0.5) || !vis(rs, 0.5)) return false;
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
  if (!vis(ls, 0.5) || !vis(rs, 0.5) || !vis(nose, 0.4)) return false;
  const sw = Math.abs(ls.x - rs.x);
  if (sw < 0.05) return false;
  // 코가 baseline 대비 sw*0.30 이상 아래
  const noseDrop = nose.y - baseline.noseY;
  if (noseDrop < sw * 0.30) return false;
  // 어깨도 baseline 대비 sw*0.15 이상 아래
  const shoulderDrop = (ls.y + rs.y) / 2 - baseline.shoulderMidY;
  if (shoulderDrop < sw * 0.15) return false;
  // face 있으면 pitch가 앞으로 숙임 — 추가 확정. 없어도 코+어깨만으로 인정.
  if (face && baseline.face) {
    const pitchDelta = face.pitch - baseline.face.pitch;
    // pitch가 살짝이라도 앞쪽이거나 baseline과 비슷해야 (뒤로 젖힘=leaning back 차단)
    if (pitchDelta < -0.10) return false;
  }
  return true;
}

export function detectStretch(
  lm: Landmarks,
  face?: FaceData | null,
  baseline?: CalibrationBaseline | null,
): StretchKind | null {
  // 우선순위: 더 명확한 동작 먼저. baseline 비교 동작은 다 통과해야 신뢰.
  if (isBehindHead(lm)) return "behind_head";
  if (isOverheadStretch(lm)) return "overhead";
  if (isForwardFold(lm, face, baseline)) return "forward_fold";
  if (isSideStretch(lm)) return "side";
  if (isCrossBody(lm)) return "cross_body";
  if (isShoulderShrug(lm, baseline)) return "shoulder_shrug";
  if (isNeckSide(lm, face, baseline)) return "neck_side";
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
    private readonly minHoldMs = 1000,
    private readonly cooldownMs = 5 * 1000,
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
      }
      return null;
    }

    this.lastDetectedAt = now;

    if (this.activeKind !== kind) {
      this.activeKind = kind;
      this.enteredAt = now;
      return null;
    }
    const held = now - this.enteredAt;
    if (held < this.minHoldMs) return null;
    if (now - this.lastBonusAt[kind] < this.cooldownMs) return null;
    this.lastBonusAt[kind] = now;
    this.activeKind = null;
    this.enteredAt = 0;
    return { kind, amount: BONUS_BY_KIND[kind] };
  }

  reset(): void {
    this.activeKind = null;
    this.enteredAt = 0;
    this.lastDetectedAt = 0;
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
