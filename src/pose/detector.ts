import {
  PoseLandmarker,
  FaceLandmarker,
  HandLandmarker,
  ImageSegmenter,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import type {
  DetectionFrame,
  HandData,
  Landmark,
  Landmarks,
} from "./types";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";

const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// selfie_multiclass: 0=background, 1=hair, 2=body-skin, 3=face-skin, 4=clothes, 5=others.
// 의자·소품을 사람으로 묶지 않도록 binary가 아닌 multiclass 사용.
const SEG_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";

let poseLm: PoseLandmarker | null = null;
let faceLm: FaceLandmarker | null = null;
let handLm: HandLandmarker | null = null;
let segLm: ImageSegmenter | null = null;
// 실제로 성사된 delegate. GPU(WebGL) 컨텍스트 생성이 실패하면 CPU 로 폴백한다.
let activeDelegate: "GPU" | "CPU" = "GPU";
// 마스크 버퍼 재사용 — 매 프레임 new Uint8Array 하면 GC 압력이 크다.
let reusableMaskBuf: Uint8Array | null = null;
// Eco 모드는 face/hands 를 strided 로 돌린다(N틱당 1회). 스킵된 틱에서 frame.face /
// frame.hands 를 비우면 analyzer 가 깜빡이므로, 직전 결과를 캐시해 재사용한다.
// 자세는 느린 신호라 1~3틱(수백 ms) 지연은 무의미하다.
let lastFace: DetectionFrame["face"] = null;
let lastHands: HandData[] = [];

// ── 성능 계측 (디버그 오버레이용) ─────────────────────────────────────────────
// 모델별 detectForVideo 소요시간을 EMA 로 평활화해 노출. 저사양 기기(예: Iris Xe
// 윈도우)에서 어느 모델이 병목인지, Full↔Eco 전환 시 ms 가 얼마나 변하는지 실측용.
export interface DetectorPerf {
  /** 직전 실제 추론 1회의 평활화된 소요시간(ms). 스킵(캐시 재사용) 틱은 갱신 안 함. */
  pose: number;
  face: number;
  hands: number;
  seg: number;
  /** pose+face+hands+seg 합(최근 실측 기준 ms). 프레임당 CPU 부담의 근사치. */
  total: number;
  /** detectFromVideo 가 실제로 불린 빈도(EMA fps). */
  fps: number;
  /** 이번 프레임에 각 모델이 실제로 돌았는지(strided 스킵이면 false). */
  faceRan: boolean;
  handsRan: boolean;
  segRan: boolean;
  /** 실제로 성사된 delegate. GPU 실패 시 CPU 로 폴백된 상태를 반영. */
  delegate: "GPU" | "CPU";
}

const perf = { pose: 0, face: 0, hands: 0, seg: 0, fps: 0 };
let perfFaceRan = false;
let perfHandsRan = false;
let perfSegRan = false;
let lastDetectTs = 0;
const PERF_EMA = 0.15;
function ema(prev: number, v: number): number {
  return prev === 0 ? v : prev * (1 - PERF_EMA) + v * PERF_EMA;
}

export function getDetectorPerf(): DetectorPerf {
  return {
    pose: perf.pose,
    face: perf.face,
    hands: perf.hands,
    seg: perf.seg,
    total: perf.pose + perf.face + perf.hands + perf.seg,
    fps: perf.fps,
    faceRan: perfFaceRan,
    handsRan: perfHandsRan,
    segRan: perfSegRan,
    delegate: activeDelegate,
  };
}

/**
 * GPU(WebGL) delegate 로 먼저 시도하고, 컨텍스트 생성 실패 시 CPU 로 폴백해 모델을
 * 생성한다. WKWebView(Tauri macOS)에서 페이지를 반복 reload 하면 WebGL 컨텍스트가
 * 고갈되어 createFromOptions 가 "null is not an object (evaluating 't.alpha')" 류로
 * throw 하는데, 폴백이 없으면 전체 자세 감지 초기화가 실패한다. CPU 는 느리지만 동작은
 * 보장된다. 한 모델이 GPU 에 실패하면 activeDelegate 를 CPU 로 내려 이후 모델은 곧장
 * CPU 로 생성(불필요한 GPU 재시도·컨텍스트 추가 소모 방지).
 */
async function createWithFallback<T>(
  create: (delegate: "GPU" | "CPU") => Promise<T>,
): Promise<T> {
  if (activeDelegate === "CPU") return create("CPU");
  try {
    return await create("GPU");
  } catch (e) {
    console.warn("GPU delegate init failed; falling back to CPU:", e);
    activeDelegate = "CPU";
    return create("CPU");
  }
}

export async function initLandmarkers(): Promise<void> {
  if (poseLm && faceLm && handLm) return;
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);

  if (!poseLm) {
    poseLm = await createWithFallback((delegate) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
    );
  }

  if (!faceLm) {
    faceLm = await createWithFallback((delegate) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
    );
  }

  if (!handLm) {
    handLm = await createWithFallback((delegate) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
    );
  }

  if (!segLm) {
    try {
      segLm = await createWithFallback((delegate) =>
        ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: SEG_MODEL_URL, delegate },
          runningMode: "VIDEO",
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        }),
      );
    } catch (e) {
      console.warn("ImageSegmenter init failed; falling back to polygon", e);
      segLm = null;
    }
  }
}

/** Back-compat shim for any caller still importing initPoseLandmarker. */
export const initPoseLandmarker = initLandmarkers;

/**
 * 모델만 해제 후 재생성한다(페이지 reload 없이). MediaPipe WASM 힙·GPU 텍스처 등
 * 외부 메모리의 가장 큰 덩어리를 회수하면서, 전체 페이지 reload 의 화면 깜빡임을
 * 피하기 위한 경량 메모리 회수 경로다.
 *
 * dispose→reinit 사이의 짧은 구간(~1~2s)에는 모델이 null 이라 detectFromVideo 가
 * 빈 프레임(pose=null, mask=null)을 반환하지만, detectFromVideo 가 각 모델을 null
 * 체크하므로 크래시는 없고, SilhouetteOverlay 는 직전 mask 를 유지해 화면이 비지
 * 않는다. 재생성 완료 후 추론이 자연히 재개된다.
 *
 * 주의: video 디코드 버퍼·canvas backing·detached DOM 누적은 JS 컨텍스트가 살아
 * 있어 회수되지 않는다 — 그 잔여분은 드문 full reload(useMemoryReloadGuard 의
 * fullIntervalMs 백스톱)로 정리한다.
 */
export async function refreshLandmarkers(): Promise<void> {
  disposeLandmarker();
  await initLandmarkers();
}

function toPoseLandmarks(
  raw: { x: number; y: number; z: number; visibility?: number }[],
): Landmarks {
  return raw.map((lm) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
    visibility: lm.visibility ?? 0,
  }));
}

function toHandLandmarks(
  raw: { x: number; y: number; z: number; visibility?: number }[],
): Landmark[] {
  return raw.map((lm) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
    visibility: lm.visibility ?? 1,
  }));
}

/**
 * MediaPipe Face Landmarker returns a 4x4 facial transformation matrix in
 * column-major order (data[0..15]). The rotation block (top-left 3x3) maps
 * canonical face axes (+X right, +Y up, +Z toward camera) to camera space.
 * We extract intrinsic XYZ Euler angles where:
 *   - pitch = rotation around X (nod: chin down = positive)
 *   - yaw   = rotation around Y (turn: left = positive)
 *   - roll  = rotation around Z (tilt)
 */
function eulerFromMatrix(
  data: number[],
): { pitch: number; yaw: number; roll: number; tz: number } {
  // Column-major: data[col*4 + row]
  const m00 = data[0],
    m10 = data[1],
    m20 = data[2];
  const m21 = data[6];
  const m22 = data[10];
  const tz = data[14];

  const pitch = Math.atan2(m21, m22);
  const yaw = Math.asin(-Math.max(-1, Math.min(1, m20)));
  const roll = Math.atan2(m10, m00);
  // Note: pose sign conventions differ between renderers; users can flip
  // signs at the analyzer level if observed direction is inverted.
  return { pitch, yaw, roll, tz };
}

export interface DetectOptions {
  /** false면 ImageSegmenter 건너뜀. */
  segment?: boolean;
  /** false면 Face Landmarker 건너뜀. */
  face?: boolean;
  /** false면 Hand Landmarker 건너뜀. */
  hands?: boolean;
}

export function detectFromVideo(
  video: HTMLVideoElement,
  timestampMs: number,
  opts: DetectOptions = {},
): DetectionFrame {
  const frame: DetectionFrame = { pose: null, face: null, hands: [], mask: null };
  const runSeg = opts.segment !== false;
  const runFace = opts.face !== false;
  const runHands = opts.hands !== false;

  // 실측 fps: detectFromVideo 호출 간격.
  const detectStart = performance.now();
  if (lastDetectTs) perf.fps = ema(perf.fps, 1000 / (detectStart - lastDetectTs));
  lastDetectTs = detectStart;
  perfFaceRan = false;
  perfHandsRan = false;
  perfSegRan = false;

  if (poseLm) {
    const t = performance.now();
    const r = poseLm.detectForVideo(video, timestampMs);
    if (r.landmarks?.length) frame.pose = toPoseLandmarks(r.landmarks[0]);
    perf.pose = ema(perf.pose, performance.now() - t);
  }

  if (faceLm && runFace) {
    const t = performance.now();
    const r = faceLm.detectForVideo(video, timestampMs);
    const mat = r.facialTransformationMatrixes?.[0];
    if (mat?.data) {
      const { pitch, yaw, roll, tz } = eulerFromMatrix(Array.from(mat.data));
      const faceLandmarks = r.faceLandmarks?.[0]
        ? r.faceLandmarks[0].map((lm) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: 1,
          }))
        : [];
      frame.face = { pitch, yaw, roll, tz, landmarks: faceLandmarks };
    }
    lastFace = frame.face;
    perf.face = ema(perf.face, performance.now() - t);
    perfFaceRan = true;
  } else if (faceLm) {
    // strided 스킵 틱 — 직전 결과 재사용.
    frame.face = lastFace;
  }

  if (handLm && runHands) {
    const t = performance.now();
    const r = handLm.detectForVideo(video, timestampMs);
    if (r.landmarks?.length) {
      const hands: HandData[] = [];
      for (let i = 0; i < r.landmarks.length; i++) {
        const handedLabel =
          r.handedness?.[i]?.[0]?.categoryName === "Left" ? "Left" : "Right";
        hands.push({
          handedness: handedLabel,
          landmarks: toHandLandmarks(r.landmarks[i]),
        });
      }
      frame.hands = hands;
    }
    lastHands = frame.hands;
    perf.hands = ema(perf.hands, performance.now() - t);
    perfHandsRan = true;
  } else if (handLm) {
    // strided 스킵 틱 — 직전 결과 재사용.
    frame.hands = lastHands;
  }

  if (segLm && runSeg) {
    const t = performance.now();
    segLm.segmentForVideo(video, timestampMs, (result) => {
      const cm = result.categoryMask;
      if (!cm) return;
      const src = cm.getAsUint8Array();
      if (!reusableMaskBuf || reusableMaskBuf.length !== src.length) {
        reusableMaskBuf = new Uint8Array(src.length);
      }
      reusableMaskBuf.set(src);
      frame.mask = {
        data: reusableMaskBuf,
        width: cm.width,
        height: cm.height,
      };
      cm.close();
    });
    perf.seg = ema(perf.seg, performance.now() - t);
    perfSegRan = true;
  }

  return frame;
}

export function disposeLandmarker(): void {
  poseLm?.close();
  faceLm?.close();
  handLm?.close();
  segLm?.close();
  poseLm = null;
  faceLm = null;
  handLm = null;
  segLm = null;
  reusableMaskBuf = null;
  lastFace = null;
  lastHands = [];
}
