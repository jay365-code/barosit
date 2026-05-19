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
// 마스크 버퍼 재사용 — 매 프레임 new Uint8Array 하면 GC 압력이 크다.
let reusableMaskBuf: Uint8Array | null = null;

export async function initLandmarkers(): Promise<void> {
  if (poseLm && faceLm && handLm) return;
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);

  if (!poseLm) {
    poseLm = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  if (!faceLm) {
    faceLm = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  if (!handLm) {
    handLm = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  if (!segLm) {
    try {
      segLm = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEG_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    } catch (e) {
      console.warn("ImageSegmenter init failed; falling back to polygon", e);
      segLm = null;
    }
  }
}

/** Back-compat shim for any caller still importing initPoseLandmarker. */
export const initPoseLandmarker = initLandmarkers;

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

  if (poseLm) {
    const r = poseLm.detectForVideo(video, timestampMs);
    if (r.landmarks?.length) frame.pose = toPoseLandmarks(r.landmarks[0]);
  }

  if (faceLm && runFace) {
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
  }

  if (handLm && runHands) {
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
  }

  if (segLm && runSeg) {
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
}
