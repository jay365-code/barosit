export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export type Landmarks = Landmark[];

export const LANDMARK_INDEX = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

export type PostureType =
  | "forward_head"
  | "chin_resting"
  | "shoulder_tilt"
  | "slouching"
  | "monitor_too_close"
  | "shoulder_asymmetry"
  | "head_roll";

export type PostureSeverity = "warning" | "bad";

export interface PostureViolation {
  type: PostureType;
  severity: PostureSeverity;
  startedAt: number;
  durationSecs: number;
}

export type PostureStatus = "good" | "warning" | "bad" | "paused" | "resting";

export interface FaceData {
  /** Euler angles in radians, extracted from facial transformation matrix. */
  pitch: number;
  yaw: number;
  roll: number;
  /** Translation Z (typically negative, more negative = closer to camera). */
  tz: number;
  /** 478 normalized face landmarks (image coords). Used for silhouette rendering. */
  landmarks: Landmark[];
}

export interface HandData {
  handedness: "Left" | "Right";
  /** 21 normalized landmarks (image coords). Index 0=wrist, 4=thumb tip, 8=index tip, 12=middle, 16=ring, 20=pinky. */
  landmarks: Landmark[];
}

export interface MaskBuffer {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface DetectionFrame {
  pose: Landmarks | null;
  face: FaceData | null;
  hands: HandData[];
  mask: MaskBuffer | null;
}

export interface CalibrationBaseline {
  /** averaged landmark positions while user holds the correct posture */
  meanLandmarks: Landmarks;
  /** baseline values used by analyzer */
  shoulderWidth: number;
  shoulderTiltY: number;
  noseToShoulderZ: number;
  noseY: number;
  shoulderMidY: number;
  /** averaged face pose during calibration (null if no face seen). */
  face: FaceData | null;
  capturedAt: number;
}
