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
/** [멀티 모니터 회전 deadzone] baseline 대비 yaw 가 ±15° 이내면 통상 작업 자세로 간주하고 yaw 댐핑을 적용하지 않습니다.
 * 좌우 서브 모니터를 응시하는 자연 회전(보통 20~30°)에서 false positive 가 안 나도록 통상 자세 구간을 명시적으로 분리합니다.
 * 이 값을 넘어선 회전에서만 점진적으로 자세 점수를 감쇄해 큰 각도 회전에서의 2D 투영 왜곡을 흡수합니다. */
const FREE_YAW_RAD = 0.26;

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
  shoulderWidth: number,
  lPoseWrist: Landmark | undefined,
  rPoseWrist: Landmark | undefined,
  faceLandmarks: Landmark[] | null,
): { dist: number; tip: Landmark | null; hand: HandData | null } {
  let best = Infinity;
  let bestTip: Landmark | null = null;
  let bestHand: HandData | null = null;
  // 필터 D: Pose-Hand 교차 검증 (Independent-Model Cross-Validation Filter)
  // MediaPipe Pose 와 Hand Landmarker 는 별도 학습된 독립 모델이라 동일한 얼굴 텍스처(광대/턱선/귀 윤곽)에 동시에 속을 확률이 매우 낮습니다.
  // 양쪽 pose 손목 visibility 가 모두 0.25 미만이면 사용자의 실제 손은 프레임 밖에 있다는 강한 증거 — 그럼에도 Hand 검출이 발생했다면 환각으로 확정.
  // 진짜 턱·뺨 받침 자세에서는 해당 팔의 pose 손목 visibility 가 최소 0.3 이상으로 추적되므로 정상 검출은 영향 없습니다.
  const noPoseWristTracked =
    (lPoseWrist?.visibility ?? 0) < 0.25 &&
    (rPoseWrist?.visibility ?? 0) < 0.25;

  // [필터 E 사전계산] Face Landmarker 의 478 mesh 좌표 bbox.
  // 코 반경 검사(필터 B)는 측면 시점에서 얼굴이 비대칭으로 늘어나 임계가 깨지지만, mesh bbox 는 실제 얼굴 영역에 정확히 맞춰 변형됩니다.
  let faceMinX = Infinity, faceMaxX = -Infinity;
  let faceMinY = Infinity, faceMaxY = -Infinity;
  const hasFaceMesh = !!(faceLandmarks && faceLandmarks.length > 100);
  if (hasFaceMesh) {
    for (const lm of faceLandmarks!) {
      if (lm.x < faceMinX) faceMinX = lm.x;
      if (lm.x > faceMaxX) faceMaxX = lm.x;
      if (lm.y < faceMinY) faceMinY = lm.y;
      if (lm.y > faceMaxY) faceMaxY = lm.y;
    }
  }

  for (const h of hands) {
    // 필터 D 적용: Pose 손목 둘 다 미추적이면 모든 Hand 검출을 환각으로 일괄 차단
    if (noPoseWristTracked) {
      continue;
    }
    // [안경테 유령 손 오탐 박멸 Bounding Box Span 필터]
    // 미디어파이프가 안경알/안경테의 기하학적 형태나 얼굴 음영을 손으로 오인해 뺨 주변에 맺히는 유령 손을 걸러냅니다.
    // 랜드마크 누락 상태에서도 유령 손 영역의 2D 점유 폭(Span)을 측정하여 어깨폭의 최소 18% 이상인 유효한 손만 턱 괴임 검사에 반영합니다.
    // [안경테/얼굴 음영 유령 손 오탐 박멸 2중 필터]
    if (h.landmarks.length > 0) {
      // 필터 A: Bounding Box Span (초소형 점 뭉치 차단)
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      for (const lm of h.landmarks) {
        if (lm.x < minX) minX = lm.x;
        if (lm.x > maxX) maxX = lm.x;
        if (lm.y < minY) minY = lm.y;
        if (lm.y > maxY) maxY = lm.y;
      }
      const handSpan = Math.hypot(maxX - minX, maxY - minY);
      if (handSpan < shoulderWidth * 0.18) {
        continue; // 안경 크기 수준으로 찌그러진 초소형 유령 손은 즉각 분석에서 제외합니다.
      }

      // 필터 B: 얼굴 내부 고립 유령 손 검사 (Topological Facial Isolation Filter)
      // 안경을 벗은 상태여도 뺨/턱선의 짙은 음영이나 귀 주변 하이라이트를 손가락 21개 마디로 통째 오탐하는 경우가 있습니다.
      // 진짜 턱을 괸 손은 손목이나 하단 마디가 얼굴 바깥(목/어깨 방향)으로 넓게 뻗쳐 나오지만, 
      // 얼굴 음영 유령 손은 모든 랜드마크 21개가 코를 중심으로 반지름 sw*0.38 이내의 얼굴 영역 내부에 100% 갇혀 고립되어 있습니다.
      let allPointsInsideFace = true;
      for (const lm of h.landmarks) {
        const distToNose = Math.hypot(lm.x - nose.x, lm.y - nose.y);
        if (distToNose > shoulderWidth * 0.38) {
          allPointsInsideFace = false; // 단 한 점이라도 얼굴 바깥으로 삐져나갔다면 진짜 손으로 판단 후보
          break;
        }
      }
      if (allPointsInsideFace) {
        continue; // 얼굴 뺨 내부 좁은 범위에 100% 고립되어 맺힌 손은 얼굴 음영으로 인한 가짜 손이 확실하므로 완벽히 무시합니다.
      }

      // 필터 C: 손목 해부학적 일관성 필터 (Anatomical Wrist-Below-Nose Filter)
      // 실제 턱·뺨·광대 받침 자세는 팔꿈치가 책상에 놓여 손목이 턱·목 방향(코보다 아래)에 위치합니다.
      // 측면 시점에서 광대뼈/턱선/귀 윤곽이 손등으로 환각될 때, 21개 마디가 얼굴 위에 통째 얹히면서
      // 손목 landmark(0)이 뺨·관자놀이 같은 코보다 위쪽에 찍히는 패턴을 보입니다.
      // 손목이 코보다 sw*0.05 이상 위로 떠 있으면 해부학적으로 턱괴임 자세가 불가능하므로 환각으로 판정해 차단합니다.
      const wristLm = h.landmarks[0];
      if (wristLm && wristLm.y < nose.y - shoulderWidth * 0.05) {
        continue;
      }

      // 필터 E: Face Mesh 다수 봉쇄 + Pose Wrist 위치 동의 (Face-Mesh Majority Containment + Pose Wrist Agreement)
      // 필터 B 의 코 반경 검사는 측면 시점에서 얼굴이 코를 한쪽으로 밀어내 임계가 깨지지만,
      // Face Landmarker 의 478 mesh bbox 는 시점에 무관하게 실제 얼굴 영역을 정확히 잡습니다.
      // [개선] 기존 "모든 21점 내부" 조건은 phantom 의 한두 외삽 outlier 만 face 밖으로 튀어도 통과되어 환각이 살아남았습니다.
      // → 다수 비율(85% 이상)이 face mesh 내부면 환각 후보로 판정해 외삽 노이즈를 흡수합니다.
      // 단, 진짜 palm-on-cheek 도 mesh 내부에 들어올 수 있으므로 pose 모델이 동시에 그 손의 손목 위치를 추적하는지(위치 일치) 확인해 거짓 양성을 막습니다.
      // [개선] pose wrist 위치 일치 반경을 sw*0.20 → sw*0.12 로 좁혀, pose 가 팔꿈치에서 외삽한 부정확한 wrist 좌표가 phantom 근처에 우연히 떨어져도 통과되지 않도록 합니다.
      // - 환각 손: 다수가 mesh 내부 + pose 손목 위치 정확 동의 없음 → reject
      // - 진짜 palm-on-cheek: mesh 내부 + 진짜 pose 손목 좌표가 hand wrist 와 정확히 일치 → pass through
      if (hasFaceMesh && wristLm) {
        const margin = shoulderWidth * 0.03;
        let insideCount = 0;
        for (const lm of h.landmarks) {
          if (
            lm.x >= faceMinX - margin &&
            lm.x <= faceMaxX + margin &&
            lm.y >= faceMinY - margin &&
            lm.y <= faceMaxY + margin
          ) {
            insideCount++;
          }
        }
        const majorityInsideFaceMesh =
          insideCount >= h.landmarks.length * 0.85;
        if (majorityInsideFaceMesh) {
          const poseWristAgrees = (pw: Landmark | undefined): boolean => {
            if (!pw || pw.visibility < 0.5) return false;
            return (
              Math.hypot(wristLm.x - pw.x, wristLm.y - pw.y) <
              shoulderWidth * 0.12
            );
          };
          const realHandConfirmed =
            poseWristAgrees(lPoseWrist) || poseWristAgrees(rPoseWrist);
          if (!realHandConfirmed) {
            continue; // 환각: 얼굴 mesh 다수 내부 + pose 손목 위치 정확 동의 없음
          }
        }
      }
    }

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
  // [P3 오탐 개선] 측면 각도(Yaw)로 인한 카메라 노이즈로 코의 visibility가 0.6 내외로 튀어도 
  // 실제 가려지지 않았다면 가림 폴백이 켜지지 않도록 임계치를 0.4로 대폭 낮춥니다.
  const POSE_NOSE_VIS_MIN = 0.4;
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

    // [세컨 모니터 환경 최적화 및 거북목 감지 사각지대 제거]
    // 코(Nose)는 회전축에서 멀어 고개를 돌릴 때 2D 오차가 극대화되므로,
    // 목뼈 회전축에 수렴하는 '양쪽 귀의 중점(Ear Midpoint)'을 추적 좌표로 사용하여 회전 불변성(Rotation Invariance)을 획득합니다.
    // [좌우 비대칭 회귀 제거] 가시성 임계(≥0.25)에서 ear-midpoint↔nose 로 하드 스위치하던 기존 구현은
    // 한쪽 귀 가시성이 임계를 넘는 순간 참조점이 sw*0.05~0.15 점프하면서 단일 프레임에 거북목 점수가 폭증해 한 방향 회전에서만 false positive 가 발생했습니다.
    // 양쪽 귀 가시성의 최솟값으로 가중치(0~1)를 계산해 ear-midpoint 와 nose 사이를 부드럽게 보간하여 스위칭 점프를 제거합니다.
    // baseline 도 동일 가중치로 블렌드해 현재값과 동일 좌표계로 비교되도록 보장합니다.
    const earsAvailable = !!(lEar && rEar && baseLEar && baseREar);
    const minEarVis = earsAvailable
      ? Math.min(lEar.visibility, rEar.visibility)
      : 0;
    // 가시성 < 0.15: nose 단독 (weight 0), 가시성 ≥ 0.50: ear midpoint 단독 (weight 1), 그 사이 선형 보간.
    const earWeight = earsAvailable
      ? Math.max(0, Math.min(1, (minEarVis - 0.15) / 0.35))
      : 0;

    const earMidX = earsAvailable ? (lEar.x + rEar.x) / 2 : nose.x;
    const earMidY = earsAvailable ? (lEar.y + rEar.y) / 2 : nose.y;
    const baseEarMidX = earsAvailable
      ? (baseLEar.x + baseREar.x) / 2
      : baseNoseLm.x;
    const baseEarMidY = earsAvailable
      ? (baseLEar.y + baseREar.y) / 2
      : baseline.noseY;

    const curHeadX = earWeight * earMidX + (1 - earWeight) * nose.x;
    const curHeadY = earWeight * earMidY + (1 - earWeight) * nose.y;
    const baseHeadX =
      earWeight * baseEarMidX + (1 - earWeight) * baseNoseLm.x;
    const baseHeadY =
      earWeight * baseEarMidY + (1 - earWeight) * baseline.noseY;

    const baseNeckX = baseHeadX - baseShoulderMidX;
    const baseNeckY = baseHeadY - baseline.shoulderMidY;
    const curNeckX = curHeadX - shoulderMidX;
    const curNeckY = curHeadY - shoulderMidY;

    const neckDrift = Math.hypot(curNeckX - baseNeckX, curNeckY - baseNeckY);
    // 어깨 너비의 20% 변위를 거북목 지수 1.0으로 환산
    neckDriftScore = neckDrift / (baseline.shoulderWidth * 0.20);
  }

  const rawForwardHeadScore =
    headSizeScore + (-zDelta / 0.05) + (headDrop / 0.04) + pitchScore +
    neckDriftScore;

  // 귀 중점 필터 덕분에 고개만 돌리는 것(Yaw 회전)은 자연적으로 점수가 오르지 않습니다.
  // [멀티 모니터 deadzone] FREE_YAW_RAD(±15°) 이내는 통상 작업 자세로 보고 무감쇄(damping=1.0).
  // 그 너머는 점진 감쇄해 ~40°(0.70rad) 에서 0 도달 — 큰 각도 회전에서의 2D 투영 왜곡과 학습 분포 외 영역을 안전하게 흡수합니다.
  // 이를 통해 30° 자연 회전에서 false positive 없이, 진짜 거북목(목을 앞으로 빼는 신호)은 그대로 탐지합니다.
  const yawDelta = face && baseline.face ? Math.abs(face.yaw - baseline.face.yaw) : 0;
  const yawDamping = face && baseline.face
    ? Math.max(0, 1 - Math.max(0, yawDelta - FREE_YAW_RAD) / 0.44)
    : 1.0;
  const forwardHeadScore = rawForwardHeadScore * yawDamping;
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
    minFingertipToNose(
      hands,
      nose,
      baseline.shoulderWidth,
      lWrist,
      rWrist,
      face?.landmarks ?? null,
    );
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
  // [phantom hand 최종 게이트 — 위치 동의 강화]
  // 기존 visibility-only 게이트는 phantom 의 손목이 목 부근으로 외삽되고 pose 도 그 근처로 wrist 를 추정할 때 (양쪽 다 0.4+ visibility) 통과되어 차단 실패.
  // 진짜 chin_resting 에서는 hand 모델의 손목 landmark(0) 와 pose 손목 좌표가 거의 동일 위치 (둘 다 실제 손목 추적). phantom 에서는 hand 모델이 환각한 손목 위치와 pose 가 추정한 위치가 일치하지 않음.
  // sw*0.15 이내 정확 위치 일치 + visibility ≥ 0.4 둘 다 요구해 phantom 의 "구조적으로 그럴듯한" 통과를 차단합니다.
  const poseConfirmsHandWristPosition = (() => {
    if (!handWrist) return false;
    const checkPose = (pw: Landmark | undefined): boolean => {
      if (!pw || pw.visibility < 0.4) return false;
      return (
        Math.hypot(handWrist.x - pw.x, handWrist.y - pw.y) <
        baseline.shoulderWidth * 0.15
      );
    };
    return checkPose(lWrist) || checkPose(rWrist);
  })();
  const fingerNearChin =
    hands.length > 0 &&
    poseConfirmsHandWristPosition &&
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
    // [키보드 오탐 방지 마진] 키보드 타이핑 시 손목이 2D 카메라 앵글 상에서 어깨 위로 겹쳐 보일 수 있으므로 
    // 최소 어깨너비의 10% 이상 높이 올라갔을 때만 턱 괴임으로 간주합니다.
    return w.y < shoulderMinY - baseline.shoulderWidth * 0.10;
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
    // [키보드 오탐 방지 마진] 로우 앵글에서 키보드 타이핑 시 팔꿈치가 어깨선 부근/살짝 위로 겹칠 수 있으므로
    // 어깨너비의 15% 이상 과도하게 들렸을 때만 진짜 턱 괴임 팔로 판정합니다.
    if (e.y >= shoulderMinY - baseline.shoulderWidth * 0.15) return false;
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
  // [측면 카메라 회전 false positive 차단 — 1차 yaw deadzone 가드]
  // yawDelta 가 deadzone(15°) 을 넘은 회전 자세에서는 score 신뢰 불가 → 발화 보류.
  //
  // [측면 카메라 회전 false positive 차단 — 2차 운동학적 동의 요구]
  // 진짜 거북목의 본질은 "턱이 앞·아래로 빠지는" 운동학적 동작. pitch (3D 머리 각도) 또는 drop (코 y 좌표) 둘 다 yaw 회전에 거의 무관.
  // 반면 size (귀폭/어깨폭 비율), z (깊이), neckDrift (2D 헤드-숄더 drift) 는 yaw 회전만으로도 폭증할 수 있는 geometric 신호.
  // geometric 신호가 단독으로 임계 돌파하는 케이스를 차단하기 위해 — 운동학적 신호 중 최소 하나는 거북목 방향(양수)으로 의미있게 움직였어야 진짜 거북목으로 인정.
  // 이로써 yawDelta < deadzone 인 작은 회전에서도 geometric 신호 폭증으로 false positive 발생하는 케이스 봉쇄.
  const kinematicAgreesForwardHead =
    pitchScore > 0.3 || (headDrop / 0.04) > 0.3;
  if (
    !noseFromFace &&
    !chinRaw &&
    yawDelta < FREE_YAW_RAD &&
    kinematicAgreesForwardHead &&
    forwardHeadScore > thresholds.forward_head.sensitivity
  ) {
    result.violations.add("forward_head");
  }

  // [대화면/다중 모니터 대응 공용 회전 감쇄 필터]
  // 40인치 거대 화면이나 다중 서브 모니터를 응시하기 위해 고개를 좌우로 돌릴 때,
  // 2D 투영 상에서 어깨폭이 미세 수축하거나 Y축 높이 차이(Shoulder Tilt/Slouching)가 요동치는 물리적 영사 왜곡(오탐)을 퇴치합니다.
  // [멀티 모니터 deadzone] FREE_YAW_RAD(±15°) 이내 무감쇄 → 30°(0.52rad) 에서 floor(0.4) 도달.
  // 30° 자연 회전 시 어깨/기울기/비대칭 점수가 60% 감쇄되어 자연 작업 자세를 위반으로 오인하지 않도록 안전 마진을 제공합니다.
  const rotationYawDelta = face && baseline.face ? Math.abs(face.yaw - baseline.face.yaw) : 0;
  const commonYawDamping = face && baseline.face
    ? Math.max(0.4, 1 - Math.max(0, rotationYawDelta - FREE_YAW_RAD) / 0.26)
    : 1.0;

  // -- 3. Shoulder tilt --
  const tilt = ls.y - rs.y;
  // 고개를 돌릴 때의 어깨 뒤틀림 투영 왜곡을 방지하기 위해 공용 회전 댐핑을 적용합니다.
  const tiltDelta = Math.abs(tilt - baseline.shoulderTiltY) * commonYawDamping;
  // [측면 카메라 회전 false positive 차단] yawDelta 가 deadzone(15°) 을 넘은 회전 자세에서는 baseline 의 shoulderTiltY 가 현재 head yaw 와 좌표계 안 맞아 신호 신뢰 불가 → 발화 보류.
  if (tiltDelta > 0.04 * thresholds.shoulder_tilt.sensitivity && yawDelta < FREE_YAW_RAD) {
    result.violations.add("shoulder_tilt");
  }

  // -- 4. Slouching --
  const widthRatio = shoulderWidth / baseline.shoulderWidth;
  const yDrop = shoulderMidY - baseline.shoulderMidY;

  // 어깨가 미세하게 좁아지거나 타이핑 및 고개 회전에 의한 Y축 흔들림 노이즈에 덜 격동하도록 스케일을 너그럽게 완화합니다.
  const rawSlouchingScore =
    (1 - widthRatio) / 0.11 + yDrop / 0.055;
  const slouchingScore = rawSlouchingScore * commonYawDamping;

  // [측면 카메라 회전 false positive 차단] 어깨폭과 어깨 mid Y 둘 다 head yaw 에 영향 받음 → 회전 자세에서 widthRatio/yDrop 신호 신뢰 불가.
  if (slouchingScore > thresholds.slouching.sensitivity && yawDelta < FREE_YAW_RAD) {
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
  // [측면 카메라 회전 false positive 차단 — 어깨폭 동의 요구]
  // 진짜 모니터 근접의 본질은 "사용자 몸 전체가 카메라에 가까워짐". 얼굴만 커지고 어깨는 그대로면 그건 yaw 회전이지 근접 아님.
  // 어깨폭이 baseline 대비 10% 이상 증가했어야 진짜 카메라 거리 변화로 인정 — 회전만으로는 어깨폭이 비례 증가하지 않으므로 (오히려 약간 감소) yaw 회전 false positive 가 자연 차단됨.
  const shoulderWidthRatio = shoulderWidth / baseline.shoulderWidth;
  const shouldersAlsoCloser = shoulderWidthRatio > 1.10;
  if (
    monitorCloseScore > thresholds.monitor_too_close.sensitivity &&
    closeZScore >= 0.5 &&     // z 감소 신호 필수
    closeSizeScore >= 0.5 &&  // 귀 너비 증가 신호 필수 (AND)
    shouldersAlsoCloser &&    // 어깨도 같이 커져야 진짜 근접 (AND)
    headPostureSteady
  ) {
    result.violations.add("monitor_too_close");
  }

  // -- 6. Shoulder asymmetry (좌우 비대칭) --
  // shoulder_tilt 는 절댓값 기반이라 좌우 어느 쪽이 처졌는지 신경 안 씀.
  // asymmetry 는 부호 있는 tilt + 어깨 중점이 코 기준 한쪽으로 쏠림을 같이 본다.
  const signedTilt = (ls.y - rs.y) - baseline.shoulderTiltY;
  const tiltDirection = Math.abs(signedTilt) / 0.075; // 이전 0.05 대비 임계 완화 (미세 움직임 방지)
  const shoulderMidX = (ls.x + rs.x) / 2;
  const baseLs = baseline.meanLandmarks[LANDMARK_INDEX.LEFT_SHOULDER];
  const baseRs = baseline.meanLandmarks[LANDMARK_INDEX.RIGHT_SHOULDER];
  const baseNose = baseline.meanLandmarks[LANDMARK_INDEX.NOSE];
  let lateralShift = 0;
  if (baseLs && baseRs && baseNose) {
    const baseShoulderMidX = (baseLs.x + baseRs.x) / 2;
    const noseOffset = nose.x - shoulderMidX;
    const baseNoseOffset = baseNose.x - baseShoulderMidX;
    lateralShift = Math.abs(noseOffset - baseNoseOffset) / 0.06; // 이전 0.04 대비 임계 완화
  }
  // 고개를 회전할 때 비대칭성이 크게 오인되는 2D 투영 오류를 방지하기 위해 공용 회전 댐핑을 주입합니다.
  const asymmetryScore = (tiltDirection + lateralShift) * commonYawDamping;
  // [측면 카메라 회전 false positive 차단] signedTilt, lateralShift 모두 head yaw 회전 시 2D 투영으로 자연 변화 → 회전 자세에서 발화 보류.
  if (
    asymmetryScore > thresholds.shoulder_asymmetry.sensitivity &&
    Math.abs(signedTilt) > 0.035 && // 최소 유의미한 어깨 처짐 폭 완화 (이전 0.025)
    yawDelta < FREE_YAW_RAD
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
    // 머리 기울임은 어깨 관절보다 고개 회전(Yaw)에 따른 2D 영사 Roll 오차가 극단적으로 급격합니다.
    // [멀티 모니터 deadzone] FREE_YAW_RAD(±15°) 이내 무감쇄, 약 29°(0.50rad) 에서 floor(0.4) 도달.
    // Roll 신호는 yaw 와 강하게 결합되어 있어 회전 범위에서는 head_roll 단독 발화가 거의 의미 없으므로 보수적으로 감쇄합니다.
    const rollYawDamping = Math.max(0.4, 1 - Math.max(0, rotationYawDelta - FREE_YAW_RAD) / 0.24);
    headRollScore = (Math.abs(rollDelta) / 0.12) * rollYawDamping;
    
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

  // 어깨만 귀 쪽으로 한껏 움츠리는 '어깨 으쓱' 스트레칭과 구별하기 위해, 어깨의 상승 폭과 머리(코)의 상승 폭을 직접 비교합니다.
  // 실제 일어설 때는 어깨와 머리가 거의 동일한 수준(또는 머리가 더 많이) 위로 이동하지만,
  // 어깨 으쓱 중에는 머리는 거의 그대로 있고 어깨만 치솟으므로 어깨 상승 폭이 머리 상승 폭보다 현저히 큽니다.
  const shoulderLift = baseline.shoulderMidY - shoulderMidY;
  const noseLift = baseline.noseY - nose.y;
  const isShrugPose = (shoulderLift - noseLift) > 0.05; // 어깨가 머리보다 5% 이상 과도하게 올라갔다면 으쓱 상태

  // 일어설 때는 전체 몸체(어깨 > 0.12)와 머리(코 > 0.12)가 함께 비례하여 상승해야 하며, 목이 좁아진 으쓱 자세가 아니어야 합니다.
  const standingConditionMet =
    result.personPresent &&
    (shoulderLift > 0.12) &&
    (noseLift > 0.12) &&
    !isShrugPose;
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
