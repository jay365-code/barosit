import type {
  CalibrationBaseline,
  DetectionFrame,
  FaceData,
  HandData,
  Landmark,
  Landmarks,
  PostureType,
} from "./types";
import { LANDMARK_INDEX } from "./types";
import { hasReliableLandmarks } from "./smoothing";
import type { ThresholdMap } from "./thresholds";

export interface AnalysisDebug {
  vis: {
    nose: number;
    ls: number;
    rs: number;
    lEar: number;
    rEar: number;
    lElbow: number;
    rElbow: number;
    lWrist: number;
    rWrist: number;
  };
  face: {
    present: boolean;
    pitch: number;
    yaw: number;
    roll: number;
    tz: number;
    pitchDelta: number;
    tzDelta: number;
    /** true 면 pose nose visibility 가 낮아 face nose tip 으로 대체된 상태 */
    noseFromFace: boolean;
  };
  hands: { count: number; minFingerToFace: number };
  forwardHead: {
    headSize: number;
    z: number;
    drop: number;
    pitch: number;
    /** 카메라 각도 무관 신호 — 어깨 중점 → 코 벡터의 baseline 대비 drift (정규화) */
    neckDrift: number;
    total: number;
    threshold: number;
  };
  chin: {
    lAtChin: boolean;
    lForearmUp: boolean;
    rAtChin: boolean;
    rForearmUp: boolean;
    fingerNearChin: boolean;
    handWristRaised: boolean;
    fingerVeryCloseToFace: boolean;
    noseOccludedByHand: boolean;
    leftElbowChin: boolean;
    rightElbowChin: boolean;
    /** raw chin 신호가 연속 충족된 프레임 수 — CHIN_HOLD_FRAMES 이상이어야 violations 추가 */
    holdFrames: number;
  };
  shoulderTilt: { delta: number; threshold: number };
  slouching: { score: number; threshold: number };
  monitorClose: { zScore: number; sizeScore: number; total: number; threshold: number };
  asymmetry: { tiltDirection: number; lateralShift: number; total: number; threshold: number };
  headRoll: { rollDelta: number; score: number; threshold: number; suppressed: boolean };
  resting: { signals: number; holdFrames: number; enterThreshold: number };
}

export interface AnalysisResult {
  violations: Set<PostureType>;
  personPresent: boolean;
  /** 의자 등받이에 기대 휴식 중인 상태 — 모든 위반 알람 보류 + 점수 동결 권장 */
  isResting: boolean;
  isStanding?: boolean;
  /** 다음 프레임 분석에 전달할 내부 상태 — 시간 게이트·히스테리시스용. */
  state: AnalyzerState;
  debug?: AnalysisDebug;
}

/** analyzer 가 프레임 간 캐리하는 내부 상태. 호출자는 그대로 전달만 하면 됨. */
export interface AnalyzerState {
  isResting?: boolean;
  /** chin_resting raw 신호 연속 프레임 수 (P1 시간 게이트). */
  chinHoldFrames?: number;
  /** isResting 진입 조건 충족 연속 프레임 수. */
  restingHoldFrames?: number;
  standingHoldFrames?: number;
}

/** chin_resting 가 violations 로 승격되기 위한 최소 연속 프레임 수.
 * 카메라 ~15–30 fps 기준 ~0.2–0.4 초. 일시적 손동작(안경 조정, 머리 쓸기,
 * 잠깐 커피잔 들기) 필터링이 목적. 알림 자체의 지속시간 임계(thresholds.durationSecs)
 * 와는 별개 — 이건 자세 raw 신호 노이즈 제거용. */
const CHIN_HOLD_FRAMES = 6;
/** isResting 진입 조건 충족이 연속 N 프레임 이상이어야 휴식으로 전환. */
const RESTING_HOLD_FRAMES = 10;

// nose 제외: 손이 얼굴 가리면 pose nose visibility 가 떨어지는데, 그게 곧
// 자리비움은 아님. 어깨 둘 만으로 person presence 판정하고 nose 좌표는 face
// landmark fallback 으로 보강.
const UPPER_BODY_INDICES = [
  LANDMARK_INDEX.LEFT_SHOULDER,
  LANDMARK_INDEX.RIGHT_SHOULDER,
];

const FINGERTIP_INDICES = [4, 8, 12, 16, 20];

function minFingertipToNose(
  hands: HandData[],
  nose: Landmark,
): { dist: number; tip: Landmark | null; hand: HandData | null } {
  let best = Infinity;
  let bestTip: Landmark | null = null;
  let bestHand: HandData | null = null;
  for (const h of hands) {
    for (const i of FINGERTIP_INDICES) {
      const tip = h.landmarks[i];
      if (!tip) continue;
      const dx = tip.x - nose.x;
      const dy = tip.y - nose.y;
      const d = Math.hypot(dx, dy);
      if (d < best) {
        best = d;
        bestTip = tip;
        bestHand = h;
      }
    }
  }
  return { dist: best, tip: bestTip, hand: bestHand };
}

export function analyzeFrame(
  frame: DetectionFrame,
  baseline: CalibrationBaseline,
  thresholds: ThresholdMap,
  /** 직전 프레임의 analyzer state — 히스테리시스·시간 게이트용. 경계값 핑퐁 방지. */
  prevState?: AnalyzerState,
): AnalysisResult {
  const result: AnalysisResult = {
    violations: new Set(),
    personPresent: false,
    isResting: false,
    state: {},
  };

  const landmarks: Landmarks | null = frame.pose;
  const face: FaceData | null = frame.face;
  const hands = frame.hands;

  const nz = (i: number) => (landmarks?.[i]?.visibility ?? 0);

  const emptyDebug = (): AnalysisDebug => ({
    vis: {
      nose: nz(LANDMARK_INDEX.NOSE),
      ls: nz(LANDMARK_INDEX.LEFT_SHOULDER),
      rs: nz(LANDMARK_INDEX.RIGHT_SHOULDER),
      lEar: nz(LANDMARK_INDEX.LEFT_EAR),
      rEar: nz(LANDMARK_INDEX.RIGHT_EAR),
      lElbow: nz(LANDMARK_INDEX.LEFT_ELBOW),
      rElbow: nz(LANDMARK_INDEX.RIGHT_ELBOW),
      lWrist: nz(LANDMARK_INDEX.LEFT_WRIST),
      rWrist: nz(LANDMARK_INDEX.RIGHT_WRIST),
    },
    face: {
      present: !!face,
      pitch: face?.pitch ?? 0,
      yaw: face?.yaw ?? 0,
      roll: face?.roll ?? 0,
      tz: face?.tz ?? 0,
      pitchDelta: 0,
      tzDelta: 0,
      noseFromFace: false,
    },
    hands: { count: hands.length, minFingerToFace: 0 },
    forwardHead: {
      headSize: 0,
      z: 0,
      drop: 0,
      pitch: 0,
      neckDrift: 0,
      total: 0,
      threshold: thresholds.forward_head.sensitivity,
    },
    chin: {
      lAtChin: false,
      lForearmUp: false,
      rAtChin: false,
      rForearmUp: false,
      fingerNearChin: false,
      handWristRaised: false,
      fingerVeryCloseToFace: false,
      noseOccludedByHand: false,
      leftElbowChin: false,
      rightElbowChin: false,
      holdFrames: 0,
    },
    shoulderTilt: { delta: 0, threshold: 0.04 * thresholds.shoulder_tilt.sensitivity },
    slouching: { score: 0, threshold: thresholds.slouching.sensitivity },
    monitorClose: {
      zScore: 0,
      sizeScore: 0,
      total: 0,
      threshold: thresholds.monitor_too_close.sensitivity,
    },
    asymmetry: {
      tiltDirection: 0,
      lateralShift: 0,
      total: 0,
      threshold: thresholds.shoulder_asymmetry.sensitivity,
    },
    headRoll: {
      rollDelta: 0,
      score: 0,
      threshold: thresholds.head_roll.sensitivity,
      suppressed: false,
    },
    resting: { signals: 0, holdFrames: 0, enterThreshold: 3.0 },
  });

  if (!landmarks || !hasReliableLandmarks(landmarks, UPPER_BODY_INDICES)) {
    result.debug = emptyDebug();
    return result;
  }
  result.personPresent = true;

  const ls = landmarks[LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = landmarks[LANDMARK_INDEX.RIGHT_SHOULDER];
  const poseNose = landmarks[LANDMARK_INDEX.NOSE];
  const lWrist = landmarks[LANDMARK_INDEX.LEFT_WRIST];
  const rWrist = landmarks[LANDMARK_INDEX.RIGHT_WRIST];
  const lElbow = landmarks[LANDMARK_INDEX.LEFT_ELBOW];
  const rElbow = landmarks[LANDMARK_INDEX.RIGHT_ELBOW];

  // nose fallback: 손이 코를 가리면 pose nose visibility 가 떨어져 좌표가
  // 부정확해짐. face 모델은 별도 추적이라 가림에 비교적 강건 — face landmark
  // 의 코끝(index 1) 을 fallback 으로 사용해서 chin_resting/asymmetry 등이
  // 계속 동작하게 함. 단, face landmark 의 z·y 는 pose landmark 와 좌표계가
  // 달라 baseline 비교가 부정확하므로 forward_head·monitor_too_close 의 z·drop
  // 점수는 fallback 시 보류.
  const POSE_NOSE_VIS_MIN = 0.7;
  const poseNoseReliable = poseNose && poseNose.visibility >= POSE_NOSE_VIS_MIN;
  const faceNoseTip =
    face && face.landmarks.length > 1 ? face.landmarks[1] : null;
  const noseFromFace = !poseNoseReliable && !!faceNoseTip;
  const nose: Landmark = poseNoseReliable
    ? poseNose
    : (faceNoseTip ?? poseNose);

  const shoulderMidZ = (ls.z + rs.z) / 2;
  const shoulderMidY = (ls.y + rs.y) / 2;
  const shoulderWidth = Math.abs(ls.x - rs.x);
  const noseToShoulderZ = nose.z - shoulderMidZ;

  // -- 1. Forward head (거북목) --
  // 신호 합산: ① 얼굴이 어깨 대비 커짐, ② pose z 변화, ③ nose.y 하강,
  // ④ Face Landmarker pitch 변화(턱이 내려옴) — pitch는 가장 신뢰도 높음.
  const lEar = landmarks[LANDMARK_INDEX.LEFT_EAR];
  const rEar = landmarks[LANDMARK_INDEX.RIGHT_EAR];
  const baseLEar = baseline.meanLandmarks[LANDMARK_INDEX.LEFT_EAR];
  const baseREar = baseline.meanLandmarks[LANDMARK_INDEX.RIGHT_EAR];
  let headSizeScore = 0;
  if (
    lEar && rEar &&
    lEar.visibility >= 0.5 && rEar.visibility >= 0.5 &&
    baseLEar && baseREar
  ) {
    const earWidth = Math.hypot(lEar.x - rEar.x, lEar.y - rEar.y);
    const baseEarWidth = Math.hypot(
      baseLEar.x - baseREar.x,
      baseLEar.y - baseREar.y,
    );
    const ratio = earWidth / shoulderWidth;
    const baseRatio = baseEarWidth / baseline.shoulderWidth;
    headSizeScore = (ratio - baseRatio) / (baseRatio * 0.10);
  }
  // nose fallback 일 때 z·y 좌표는 face 모델 기준이라 baseline (pose 기준) 과
  // 직접 비교 불가. 두 점수를 0 으로 두고 face pitch 신호로만 거북목 판정.
  const rawZDelta = noseToShoulderZ - baseline.noseToShoulderZ;
  const rawHeadDrop = nose.y - baseline.noseY;
  const zDelta = noseFromFace ? 0 : rawZDelta;
  const headDrop = noseFromFace ? 0 : rawHeadDrop;

  // Pitch signal: 거북목은 머리가 앞으로 나오면서 살짝 아래로 기울어짐.
  // pitchDelta > 0 (베이스라인 대비 더 숙임)이 nominal direction.
  // 0.20 rad (~11°)이 명확한 신호로 가정.
  let pitchScore = 0;
  let pitchDelta = 0;
  let tzDelta = 0;
  if (face && baseline.face) {
    pitchDelta = face.pitch - baseline.face.pitch;
    tzDelta = face.tz - baseline.face.tz;
    pitchScore = pitchDelta / 0.20;
  }

  // [카메라 각도 무관 신호] 어깨 중점 → 코 의 2D 벡터가 baseline 대비 얼마나
  // drift 했는지. 머리가 어떤 방향이든 어깨에서 빠지면 잡힘.
  // - 정면 카메라: 머리가 z축으로 카메라쪽 → 화면에서 코의 y 위치 변화
  // - 측면 카메라(45도, 외부 모니터): 머리가 옆으로 빠짐 → 코의 x 위치 변화
  // 운동학적 본질은 "머리가 몸통 중심선에서 앞으로 빠짐". 카메라 좌표계와 무관.
  const baseNoseLm = baseline.meanLandmarks[LANDMARK_INDEX.NOSE];
  const baseLsLm = baseline.meanLandmarks[LANDMARK_INDEX.LEFT_SHOULDER];
  const baseRsLm = baseline.meanLandmarks[LANDMARK_INDEX.RIGHT_SHOULDER];
  let neckDriftScore = 0;
  if (baseNoseLm && baseLsLm && baseRsLm && !noseFromFace) {
    const shoulderMidX = (ls.x + rs.x) / 2;
    const baseShoulderMidX = (baseLsLm.x + baseRsLm.x) / 2;
    const baseNeckX = baseNoseLm.x - baseShoulderMidX;
    const baseNeckY = baseline.noseY - baseline.shoulderMidY;
    const curNeckX = nose.x - shoulderMidX;
    const curNeckY = nose.y - shoulderMidY;
    const neckDrift = Math.hypot(curNeckX - baseNeckX, curNeckY - baseNeckY);
    // shoulderWidth * 0.20 (어깨 너비의 20%) drift 가 score 1.0.
    // 거북목으로 머리가 3-5cm 빠지면 어깨 너비의 15-25% 정도 변화.
    neckDriftScore = neckDrift / (baseline.shoulderWidth * 0.20);
  }

  const forwardHeadScore =
    headSizeScore + (-zDelta / 0.05) + (headDrop / 0.04) + pitchScore +
    neckDriftScore;
  // forward_head 발동은 chin_resting 평가 이후로 이동 — 우선순위 충돌 회피.
  // 손이 얼굴 근처에 있는 자세는 자연히 살짝 숙임을 동반해 거북목 신호도 같이
  // 켜지는데, 사용자 의도는 턱괴임이 더 정확. 둘 다 발동 시 턱괴임이 displayViolations[0]
  // 에 오도록 Set 삽입 순서를 chin_resting 먼저로 한다.

  // -- 2. Chin resting (턱 괴임) --
  // 책상에 팔꿈치 놓고 손을 얼굴에 댄 자세만 잡고, 키보드 손/고개 살짝 숙임
  // 케이스는 차단. 핵심: 손목이 어깨보다 "명확히 위"에 있어야 진짜 손을 들어
  // 얼굴에 댄 동작.
  const faceRadius = baseline.shoulderWidth * 0.50;
  const shoulderMinY = Math.min(ls.y, rs.y);
  const wristAtChin = (wrist: typeof lWrist): boolean => {
    if (!wrist || wrist.visibility < 0.5) return false;
    const dx = wrist.x - nose.x;
    const dy = wrist.y - nose.y;
    if (Math.hypot(dx, dy) >= faceRadius) return false;
    // 손목이 코보다 거의 같거나 위 — 코보다 명확히 아래면 책상 손
    if (wrist.y > nose.y + baseline.shoulderWidth * 0.10) return false;
    // 손목이 어깨보다 sw*0.10 이상 위 — 키보드/책상 손은 어깨 근처/아래라 차단
    return wrist.y < shoulderMinY - baseline.shoulderWidth * 0.10;
  };
  const forearmUp = (
    wrist: typeof lWrist,
    elbow: typeof lElbow,
  ): boolean => {
    if (!elbow || elbow.visibility < 0.5) return false;
    if (!wrist || wrist.visibility < 0.5) return false;
    // wrist가 elbow보다 sw*0.12 이상 위 (앞팔이 명확히 위로 뻗음)
    return wrist.y < elbow.y - baseline.shoulderWidth * 0.12;
  };

  const leftChin = wristAtChin(lWrist) && forearmUp(lWrist, lElbow);
  const rightChin = wristAtChin(rWrist) && forearmUp(rWrist, rElbow);

  const { dist: minFingerDist, tip: minTip, hand: minHand } =
    minFingertipToNose(hands, nose);
  // 손목 게이팅: 손끝이 코 근처여도, 그 손의 손목이 어깨선 위로 올라와 있지 않으면
  // 책상/키보드 위 손 + 고개 숙임 으로 보고 차단. (고개 숙여도 손목 y는 안 따라옴)
  // 예외: 손끝이 얼굴에 매우 가까우면 진짜 턱대기로 보고 손목 위치 무관하게 인정.
  //
  // [임계 보정] 알고리즘이 "코" 기준 좌표라 실제 "턱" 위치(코로부터 sw*0.30~0.40
  // 아래)의 손가락은 미탐되던 케이스 보정. 책상 팔꿈치 + 손이 턱 받침 자세는 손끝이
  // 턱·턱선 높이에 위치 — 이 거리·y 를 포함하도록 완화. P1 시간 게이트(6 프레임 hold)
  // 가 일시적 손동작 노이즈는 별도 차단.
  const handWrist = minHand?.landmarks[0] ?? null;
  // fingerVeryCloseToFace: 손끝이 얼굴 80% 반경 이내 — 턱·턱선 거리 포함 (코까지
  // 80% 거리에 손끝이 있으면 사실상 얼굴에 댄 자세). wrist 위치 무관 인정.
  const fingerVeryCloseToFace = minFingerDist < faceRadius * 0.80;
  // handWristRaised: 책상 팔꿈치 + 턱 받침 자세는 손목이 코보다 한참 아래일 수 있음.
  // 핵심은 손목이 어깨선 위에 있는 것 (책상/키보드 손과 구분). y 하한은 어깨 근처까지 허용.
  const handWristRaised =
    !!handWrist &&
    handWrist.y < shoulderMinY - baseline.shoulderWidth * 0.05;
  // 손가락 끝: ① 얼굴 반경 90% 이내 (턱 거리 포함) ② 어깨보다 sw*0.10 명확히 위
  // ③ 코 기준 sw*0.40 아래까지 허용 (턱 높이 포함, 책상 손은 어깨선 아래라 ②에서 차단)
  const fingerNearChin =
    hands.length > 0 &&
    minFingerDist < faceRadius * 0.90 &&
    !!minTip &&
    minTip.y < shoulderMinY - baseline.shoulderWidth * 0.10 &&
    minTip.y < nose.y + baseline.shoulderWidth * 0.40 &&
    (fingerVeryCloseToFace || handWristRaised);

  // Hand detection 한계 우회: MediaPipe Hand Landmarker는 손이 얼굴과 시각적으로
  // 겹치면 손을 검출 못하는 경우가 많음. 그 결과 hands.length=0 이라 fingerNearChin
  // 가 무조건 false. 그러나 pose의 코 visibility 가 떨어졌다는 건 (noseFromFace)
  // 코가 무언가에 가려졌다는 강한 신호고, 어깨는 정상이라 자리비움도 아님. 거기에
  // pose wrist 가 face 근처에 있으면 거의 확정 턱괴임. hand 모델 없이도 잡음.
  // [P3 강화] 반경을 0.8 × faceRadius 로 좁히고, 손목이 어깨선 위에 있을 때만 인정 —
  // 책상 옆 손이 잠깐 잡혀 코 가림과 동반 발생하는 오탐 차단.
  const wristNearFace = (w: typeof lWrist): boolean => {
    if (!w || w.visibility < 0.5) return false;
    if (Math.hypot(w.x - nose.x, w.y - nose.y) >= faceRadius * 0.8) return false;
    return w.y < shoulderMinY;
  };
  const noseOccludedByHand =
    noseFromFace && (wristNearFace(lWrist) || wristNearFace(rWrist));

  // 추가 fallback: hand 모델이 손-얼굴 겹침으로 검출 실패하고 (hands.length=0)
  // pose 도 wrist visibility 가 낮아질 때, elbow 가 어깨선 위 + 얼굴 좌우 narrow
  // 범위 안에 있으면 팔이 얼굴로 올라온 자세 — 거의 확정 chin_resting.
  // elbow는 손목보다 카메라에서 멀어 가림에 강건하고 frame 안에 잘 남는다.
  // [P2 강화] 진짜 fallback 으로만 사용 — hand 모델이 검출에 실패했고(hands.length=0)
  // 코도 가려졌을 때(noseFromFace)만 인정. 손이 잘 보이는 팔짱·가슴 손 자세에서는
  // hands.length>0 이므로 자동 차단.
  const elbowRaisedNearFace = (e: typeof lElbow): boolean => {
    if (!e || e.visibility < 0.5) return false;
    if (e.y >= shoulderMinY) return false;
    return Math.abs(e.x - nose.x) < faceRadius * 0.8;
  };
  const elbowFallbackActive = hands.length === 0 && noseFromFace;
  const leftElbowChin = elbowFallbackActive && elbowRaisedNearFace(lElbow);
  const rightElbowChin = elbowFallbackActive && elbowRaisedNearFace(rElbow);

  // [P1 시간 게이트] raw chin 신호가 연속 CHIN_HOLD_FRAMES 프레임 유지될 때만
  // violations 에 추가. 일시적 손동작(안경 조정, 머리 쓸기, 잠깐 커피잔 들기)에서
  // 단발 fire 차단. 알림 발사 임계(durationSecs ~ 5초)와는 별개의 raw-signal 노이즈
  // 제거용. 호출자는 prevState 만 전달하면 됨 (analyzer 가 카운트 유지).
  const chinRaw =
    leftChin ||
    rightChin ||
    fingerNearChin ||
    noseOccludedByHand ||
    leftElbowChin ||
    rightElbowChin;
  const prevChinHold = prevState?.chinHoldFrames ?? 0;
  const chinHoldFrames = chinRaw ? prevChinHold + 1 : 0;
  result.state.chinHoldFrames = chinHoldFrames;
  if (chinHoldFrames >= CHIN_HOLD_FRAMES) {
    result.violations.add("chin_resting");
  }

  // forward_head 발동 — chin_resting raw 신호가 활성이면 보류 (우선순위: 턱괴임 > 거북목).
  // 시간 게이트로 violations 에 아직 안 올라간 raw 신호 단계에서도 forward_head 는 양보.
  // noseFromFace 인 경우도 보류 — face pitch·ear 신호가 가림으로 noisy.
  if (
    !noseFromFace &&
    !chinRaw &&
    forwardHeadScore > thresholds.forward_head.sensitivity
  ) {
    result.violations.add("forward_head");
  }

  // -- 3. Shoulder tilt --
  const tilt = ls.y - rs.y;
  const tiltDelta = Math.abs(tilt - baseline.shoulderTiltY);
  if (tiltDelta > 0.04 * thresholds.shoulder_tilt.sensitivity) {
    result.violations.add("shoulder_tilt");
  }

  // -- 4. Slouching --
  const widthRatio = shoulderWidth / baseline.shoulderWidth;
  const yDrop = shoulderMidY - baseline.shoulderMidY;
  const slouchingScore =
    (1 - widthRatio) / 0.08 + yDrop / 0.04;
  if (slouchingScore > thresholds.slouching.sensitivity) {
    result.violations.add("slouching");
  }

  // -- 5. Monitor too close (모니터 거리 과근접) --
  // 얼굴이 카메라에 가까워지면 (단순 평행 이동): z 감소 + 귀 너비 확대 동시.
  // 거북목과 신호 중첩이 큼 — 거북목은 pitch가 같이 변함. pitch 변화 없을 때만
  // 순수 "모니터 가까이 옴" 으로 판정.
  const closeZScore = Math.max(0, -zDelta) / 0.05;
  let closeSizeScore = 0;
  if (
    lEar && rEar &&
    lEar.visibility >= 0.5 && rEar.visibility >= 0.5 &&
    baseLEar && baseREar
  ) {
    const earWidth = Math.hypot(lEar.x - rEar.x, lEar.y - rEar.y);
    const baseEarWidth = Math.hypot(
      baseLEar.x - baseREar.x,
      baseLEar.y - baseREar.y,
    );
    if (baseEarWidth > 0) {
      closeSizeScore = Math.max(0, earWidth / baseEarWidth - 1.0) / 0.25;
    }
  }
  // 거북목 분리 — pitch가 baseline 대비 큰 변화 있으면 forward_head로만 처리
  const headPostureSteady =
    !face || !baseline.face ||
    Math.abs(face.pitch - baseline.face.pitch) < 0.12;
  const monitorCloseScore = closeZScore + closeSizeScore;
  if (
    monitorCloseScore > thresholds.monitor_too_close.sensitivity &&
    closeZScore >= 0.5 &&     // z 감소 신호 필수
    closeSizeScore >= 0.5 &&  // 귀 너비 증가 신호 필수 (AND)
    headPostureSteady
  ) {
    result.violations.add("monitor_too_close");
  }

  // -- 6. Shoulder asymmetry (좌우 비대칭) --
  // shoulder_tilt 는 절댓값 기반이라 좌우 어느 쪽이 처졌는지 신경 안 씀.
  // asymmetry 는 부호 있는 tilt + 어깨 중점이 코 기준 한쪽으로 쏠림을 같이 본다.
  const signedTilt = (ls.y - rs.y) - baseline.shoulderTiltY;
  const tiltDirection = Math.abs(signedTilt) / 0.05;
  const shoulderMidX = (ls.x + rs.x) / 2;
  const baseLs = baseline.meanLandmarks[LANDMARK_INDEX.LEFT_SHOULDER];
  const baseRs = baseline.meanLandmarks[LANDMARK_INDEX.RIGHT_SHOULDER];
  const baseNose = baseline.meanLandmarks[LANDMARK_INDEX.NOSE];
  let lateralShift = 0;
  if (baseLs && baseRs && baseNose) {
    const baseShoulderMidX = (baseLs.x + baseRs.x) / 2;
    const noseOffset = nose.x - shoulderMidX;
    const baseNoseOffset = baseNose.x - baseShoulderMidX;
    lateralShift = Math.abs(noseOffset - baseNoseOffset) / 0.04;
  }
  const asymmetryScore = tiltDirection + lateralShift;
  if (
    asymmetryScore > thresholds.shoulder_asymmetry.sensitivity &&
    Math.abs(signedTilt) > 0.025
  ) {
    result.violations.add("shoulder_asymmetry");
  }

  // -- 7. Head roll (머리 좌우 기울기) --
  // face roll 이 baseline 대비 명확히 기울었을 때만 발동. 보조 모니터 측면 배치·
  // 책상 옆 폰 응시 등에서 흔한 자세 — 한쪽 경추 디스크 비대칭 압박·근육 불균형
  // 유발. 어깨까지 같이 기울어진 경우는 자세 전체가 기운 것이므로 head_roll
  // 단독은 발동하지 않음 — shoulder_tilt / shoulder_asymmetry 로만 처리.
  let rollDelta = 0;
  let headRollScore = 0;
  let headRollSuppressed = false;
  if (face && baseline.face) {
    rollDelta = face.roll - baseline.face.roll;
    headRollScore = Math.abs(rollDelta) / 0.12;
    const shouldersAlsoTilted =
      Math.abs(tilt - baseline.shoulderTiltY) > 0.025;
    headRollSuppressed = shouldersAlsoTilted;
    if (
      headRollScore > thresholds.head_roll.sensitivity &&
      !shouldersAlsoTilted
    ) {
      result.violations.add("head_roll");
    }
  }

  // -- 8. Leaning-back (의자 등받이 완전히 기대기 = 휴식) --
  // 살짝 뒤로 젖힌 정도가 아니라 "등을 완전히 기댄" 자세에서만 trigger.
  // 필수 조건: face pitch 가 baseline 대비 명확히 위로 — 등을 완전히 기대면
  // 시선이 천장 쪽으로 가는 패턴. 보조: 귀 너비·tz·어깨.
  //
  // 히스테리시스: pitch 진입 임계와 이탈 임계를 분리해 경계값 핑퐁 방지.
  //   - 진입: pitch delta < -0.20 (~11.5도) — 등받이에 명확히 기댄 정도
  //   - 이탈: pitch delta < -0.12 (~7도) — 한번 들어가면 살짝 풀어도 유지
  // 점수 임계 3.0: pitch(1.5) + 보조 신호 두 개 이상 충족되어야 진입 — 단순 고개 젖힘
  // 노이즈로 우연히 보조 한 개만 켜졌을 때 잘못 진입하는 케이스 차단.
  // 시간 게이트: 진입 조건이 RESTING_HOLD_FRAMES 프레임 연속 충족 시에만 전환,
  // 이탈은 즉시 — 작업 복귀 시 알림 시스템이 빠르게 재가동되도록.
  const wasResting = prevState?.isResting ?? false;
  const pitchUpThreshold = wasResting ? -0.12 : -0.20;
  const earRatioThreshold = wasResting ? 0.92 : 0.85;
  const tzGrewThreshold = wasResting ? 0.05 : 0.08;
  const yDropThreshold = wasResting ? 0.02 : 0.035;
  const enterScoreThreshold = wasResting ? 1.5 : 3.0;

  let restingSignals = 0;
  const hasFace = !!(face && baseline.face);
  const strongPitchUp =
    hasFace && face!.pitch - baseline.face!.pitch < pitchUpThreshold;
  if (strongPitchUp) {
    restingSignals += 1.5;
    if (
      lEar && rEar &&
      lEar.visibility >= 0.5 && rEar.visibility >= 0.5 &&
      baseLEar && baseREar
    ) {
      const earWidth = Math.hypot(lEar.x - rEar.x, lEar.y - rEar.y);
      const baseEarWidth = Math.hypot(
        baseLEar.x - baseREar.x,
        baseLEar.y - baseREar.y,
      );
      if (baseEarWidth > 0 && earWidth / baseEarWidth < earRatioThreshold) {
        restingSignals += 1;
      }
    }
    if (Math.abs(face!.tz) - Math.abs(baseline.face!.tz) > tzGrewThreshold) {
      restingSignals += 1;
    }
    const shoulderWidthHeld = widthRatio > 0.92;
    if (shoulderWidthHeld && yDrop > yDropThreshold) restingSignals += 0.5;
  }

  const restingConditionMet = restingSignals >= enterScoreThreshold;
  const prevRestingHold = prevState?.restingHoldFrames ?? 0;
  // 이미 휴식 중이면 즉시 유지 (히스테리시스), 진입 시에만 hold 프레임 요구.
  const restingHoldFrames = restingConditionMet ? prevRestingHold + 1 : 0;
  result.state.restingHoldFrames = restingHoldFrames;
  const shouldEnterResting = wasResting
    ? restingConditionMet
    : restingHoldFrames >= RESTING_HOLD_FRAMES;
  if (shouldEnterResting) {
    result.isResting = true;
    result.violations.clear();
  }
  result.state.isResting = result.isResting;

  // -- 9. Standing posture detection (선 자세 감지) --
  // 사용자가 일어서면 카메라 화면 대비 머리와 어깨가 위로 올라가 Y 좌표가 감소함.
  // 캘리브레이션 앉은 자세 기준(baseline.shoulderMidY)보다 실시간 어깨 높이가 12% 이상 상승 시 서 있는 상태로 판단.
  // 5프레임 이상 연속 유지될 때만 최종 선 자세로 전환하여 노이즈 차단.
  const prevStandingHold = prevState?.standingHoldFrames ?? 0;
  const standingConditionMet = result.personPresent && (baseline.shoulderMidY - shoulderMidY > 0.12);
  const standingHoldFrames = standingConditionMet ? prevStandingHold + 1 : 0;
  result.state.standingHoldFrames = standingHoldFrames;

  const isStanding = standingHoldFrames >= 5;
  if (isStanding) {
    result.isStanding = true;
    result.violations.clear();
  }

  result.debug = {
    vis: {
      nose: poseNose?.visibility ?? 0,
      ls: ls.visibility,
      rs: rs.visibility,
      lEar: lEar?.visibility ?? 0,
      rEar: rEar?.visibility ?? 0,
      lElbow: lElbow?.visibility ?? 0,
      rElbow: rElbow?.visibility ?? 0,
      lWrist: lWrist?.visibility ?? 0,
      rWrist: rWrist?.visibility ?? 0,
    },
    face: {
      present: !!face,
      pitch: face?.pitch ?? 0,
      yaw: face?.yaw ?? 0,
      roll: face?.roll ?? 0,
      tz: face?.tz ?? 0,
      pitchDelta,
      tzDelta,
      noseFromFace,
    },
    hands: {
      count: hands.length,
      minFingerToFace: Number.isFinite(minFingerDist) ? minFingerDist : 0,
    },
    forwardHead: {
      headSize: headSizeScore,
      z: -zDelta / 0.05,
      drop: headDrop / 0.04,
      pitch: pitchScore,
      neckDrift: neckDriftScore,
      total: forwardHeadScore,
      threshold: thresholds.forward_head.sensitivity,
    },
    chin: {
      lAtChin: wristAtChin(lWrist),
      lForearmUp: forearmUp(lWrist, lElbow),
      rAtChin: wristAtChin(rWrist),
      rForearmUp: forearmUp(rWrist, rElbow),
      fingerNearChin,
      handWristRaised,
      fingerVeryCloseToFace,
      noseOccludedByHand,
      leftElbowChin,
      rightElbowChin,
      holdFrames: chinHoldFrames,
    },
    shoulderTilt: { delta: tiltDelta, threshold: 0.04 * thresholds.shoulder_tilt.sensitivity },
    slouching: { score: slouchingScore, threshold: thresholds.slouching.sensitivity },
    monitorClose: {
      zScore: closeZScore,
      sizeScore: closeSizeScore,
      total: monitorCloseScore,
      threshold: thresholds.monitor_too_close.sensitivity,
    },
    asymmetry: {
      tiltDirection,
      lateralShift,
      total: asymmetryScore,
      threshold: thresholds.shoulder_asymmetry.sensitivity,
    },
    headRoll: {
      rollDelta,
      score: headRollScore,
      threshold: thresholds.head_roll.sensitivity,
      suppressed: headRollSuppressed,
    },
    resting: {
      signals: restingSignals,
      holdFrames: restingHoldFrames,
      enterThreshold: enterScoreThreshold,
    },
  };
  return result;
}
