import { useEffect, useMemo, useRef } from "react";
import type {
  HandData,
  Landmark,
  Landmarks,
  MaskBuffer,
  PostureStatus,
  CalibrationBaseline,
} from "../pose/types";
import { LANDMARK_INDEX } from "../pose/types";

interface Props {
  pose: Landmarks | null;
  face: Landmark[] | null;
  hands: HandData[];
  mask: MaskBuffer | null;
  status: PostureStatus;
  baseline?: CalibrationBaseline | null;
}

const STATUS_RGB: Record<
  PostureStatus,
  { fill: [number, number, number]; dot: string; stroke: string }
> = {
  good: {
    fill: [56, 176, 0],
    dot: "rgba(220, 255, 215, 0.9)",
    stroke: "rgba(120, 220, 90, 0.95)",
  },
  warning: {
    fill: [245, 158, 11],
    dot: "rgba(255, 240, 200, 0.9)",
    stroke: "rgba(255, 200, 80, 0.95)",
  },
  bad: {
    fill: [220, 38, 38],
    dot: "rgba(255, 220, 220, 0.9)",
    stroke: "rgba(255, 130, 130, 0.95)",
  },
  paused: {
    fill: [120, 120, 120],
    dot: "rgba(220, 220, 220, 0.7)",
    stroke: "rgba(200, 200, 200, 0.7)",
  },
  resting: {
    fill: [148, 163, 184],
    dot: "rgba(225, 232, 245, 0.8)",
    stroke: "rgba(190, 205, 225, 0.85)",
  },
  standing: {
    fill: [91, 140, 122],
    dot: "rgba(220, 235, 230, 0.9)",
    stroke: "rgba(91, 140, 122, 0.95)",
  },
};

// 마스크 EMA — 트레일을 줄이려고 새 신호 비중을 크게 (≈85%/15%).
// 블러가 가장자리 노이즈를 가려주므로 EMA는 약하게만 적용.
const MASK_EMA_NEW = 215;  // out of 255
const MASK_EMA_OLD = 40;   // out of 255 (합 255)
const FACE_EMA_NEW = 0.7;  // 70% 새 데이터 → 빠른 추적
const FACE_DOT_STRIDE = 1;  // 478점 전부 표시 (마스크 같은 질감)

export function SilhouetteOverlay({ pose, face, hands, mask, status, baseline }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const imgDataRef = useRef<ImageData | null>(null);
  const emaRef = useRef<Uint8Array | null>(null);
  const smoothedFaceRef = useRef<Landmark[] | null>(null);
  const maskReadyRef = useRef<boolean>(false);

  const color = useMemo(() => STATUS_RGB[status], [status]);

  // 마스크 갱신: 시간축 EMA로 부드럽게
  useEffect(() => {
    if (!mask) return;
    let off = offRef.current;
    if (!off) {
      off = document.createElement("canvas");
      offRef.current = off;
    }
    if (off.width !== mask.width || off.height !== mask.height) {
      off.width = mask.width;
      off.height = mask.height;
      imgDataRef.current = new ImageData(mask.width, mask.height);
      emaRef.current = new Uint8Array(mask.width * mask.height);
    }
    const imgData = imgDataRef.current!;
    const ema = emaRef.current!;
    const src = mask.data;
    const out32 = new Uint32Array(imgData.data.buffer);
    const [r, g, b] = color.fill;
    const rgbBase = (b << 16) | (g << 8) | r;

    // selfie_multiclass: 1=hair, 2=body-skin, 3=face-skin, 4=clothes 만 사람
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      const signal = v >= 1 && v <= 4 ? 255 : 0;
      // EMA: blended = (old * 145 + signal * 110) / 255
      const blended = (ema[i] * MASK_EMA_OLD + signal * MASK_EMA_NEW) >> 8;
      ema[i] = blended;
      // 알파를 EMA 값에 비례 → 가장자리가 자연스럽게 fade
      out32[i] = (blended << 24) | rgbBase;
    }
    const offCtx = off.getContext("2d");
    if (offCtx) {
      offCtx.putImageData(imgData, 0, 0);
      maskReadyRef.current = true;
    }
  }, [mask, color]);

  // status 색이 바뀌면 EMA 누적값은 그대로 두되 다음 마스크 갱신 때 색 반영
  // (즉시 색 전환을 원하면 emaRef.current?.fill(0) 하면 됨)

  // face landmark 보간 — 매 프레임 EMA로 위치 부드럽게
  const smoothedFace = useMemo(() => {
    if (!face || face.length === 0) {
      smoothedFaceRef.current = null;
      return null;
    }
    const prev = smoothedFaceRef.current;
    if (!prev || prev.length !== face.length) {
      smoothedFaceRef.current = face.map((p) => ({ ...p }));
      return smoothedFaceRef.current;
    }
    const out: Landmark[] = new Array(face.length);
    const a = FACE_EMA_NEW;
    const b = 1 - a;
    for (let i = 0; i < face.length; i++) {
      out[i] = {
        x: prev[i].x * b + face[i].x * a,
        y: prev[i].y * b + face[i].y * a,
        z: prev[i].z * b + face[i].z * a,
        visibility: face[i].visibility,
      };
    }
    smoothedFaceRef.current = out;
    return out;
  }, [face]);

  // 화면 합성
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (parent) {
      const { width, height } = parent.getBoundingClientRect();
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (maskReadyRef.current && offRef.current) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.filter = "blur(18px)";
      ctx.drawImage(offRef.current, 0, 0, w, h);

      ctx.globalAlpha = 0.85;
      ctx.filter = "blur(6px)";
      ctx.drawImage(offRef.current, 0, 0, w, h);

      ctx.globalAlpha = 1;
      ctx.filter = "none";
      ctx.restore();
    }

    // 어깨 + 팔 라인 — 자세 신호를 사용자가 시각적으로 확인할 수 있도록
    if (pose) {
      const ls = pose[LANDMARK_INDEX.LEFT_SHOULDER];
      const rs = pose[LANDMARK_INDEX.RIGHT_SHOULDER];
      const le = pose[LANDMARK_INDEX.LEFT_ELBOW];
      const re = pose[LANDMARK_INDEX.RIGHT_ELBOW];
      const lw = pose[LANDMARK_INDEX.LEFT_WRIST];
      const rw = pose[LANDMARK_INDEX.RIGHT_WRIST];

      const drawSegment = (
        a: Landmark | undefined,
        b: Landmark | undefined,
        alpha: number,
      ) => {
        if (!a || !b) return;
        if (a.visibility < 0.4 || b.visibility < 0.4) return;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        ctx.stroke();
      };

      drawSegment(ls, rs, 0.35); // shoulders
      drawSegment(ls, le, 0.45); // L 어깨-팔꿈치
      drawSegment(le, lw, 0.45); // L 팔꿈치-손목
      drawSegment(rs, re, 0.45); // R 어깨-팔꿈치
      drawSegment(re, rw, 0.45); // R 팔꿈치-손목

      // 관절 점 — 어깨/팔꿈치/손목
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      for (const p of [ls, rs, le, re, lw, rw]) {
        if (!p || p.visibility < 0.4) continue;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Face mesh — 보간된 위치 + 듬성듬성
    if (smoothedFace && smoothedFace.length > 0) {
      ctx.fillStyle = color.dot;
      for (let i = 0; i < smoothedFace.length; i += FACE_DOT_STRIDE) {
        const lm = smoothedFace[i];
        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (hands.length > 0) {
      ctx.fillStyle = color.stroke;
      for (const hand of hands) {
        // [안경테/얼굴 음영 유령 손 렌더링 2중 필터]
        if (pose && hand.landmarks.length > 0) {
          const ls = pose[LANDMARK_INDEX.LEFT_SHOULDER];
          const rs = pose[LANDMARK_INDEX.RIGHT_SHOULDER];
          const nose = pose[LANDMARK_INDEX.NOSE];
          if (ls && rs && nose) {
            const sw = baseline ? baseline.shoulderWidth : Math.abs(ls.x - rs.x);

            // 필터 D: Pose-Hand 교차 검증 (analyzer.ts 의 필터 D 와 동일 로직)
            // Pose 양쪽 손목 visibility 가 모두 0.25 미만이면 실제 손은 프레임 밖 → Hand 검출은 환각이므로 렌더링 차단
            const lWristVis = pose[LANDMARK_INDEX.LEFT_WRIST]?.visibility ?? 0;
            const rWristVis = pose[LANDMARK_INDEX.RIGHT_WRIST]?.visibility ?? 0;
            if (lWristVis < 0.25 && rWristVis < 0.25) {
              continue;
            }

            // 필터 A: Bounding Box Span (초소형 점 무리 숨김)
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            for (const lm of hand.landmarks) {
              if (lm.x < minX) minX = lm.x;
              if (lm.x > maxX) maxX = lm.x;
              if (lm.y < minY) minY = lm.y;
              if (lm.y > maxY) maxY = lm.y;
            }
            const handSpan = Math.hypot(maxX - minX, maxY - minY);
            if (handSpan < sw * 0.18) {
              continue; // 찌그러진 초소형 유령 손은 실루엣에 그리지 않고 투명화시킵니다.
            }

            // 필터 B: 얼굴 내부 고립 유령 손 검사 (안경을 벗어도 발생하는 얼굴 명암/그림자 오탐 숨김)
            let allPointsInsideFace = true;
            for (const lm of hand.landmarks) {
              const distToNose = Math.hypot(lm.x - nose.x, lm.y - nose.y);
              if (distToNose > sw * 0.38) {
                allPointsInsideFace = false; // 단 한 점이라도 얼굴 외부로 나가야 진짜 손으로 인정해 실루엣에 렌더링
                break;
              }
            }
            if (allPointsInsideFace) {
              continue; // 얼굴 뺨/턱선 내부에 100% 갇혀 고립된 유령 손은 캔버스 그리기를 즉각 건너뜁니다.
            }

            // 필터 C: 손목 해부학적 일관성 필터 (analyzer.ts 의 필터 C 와 동일 로직)
            // 진짜 턱·뺨 받침은 손목이 코보다 아래(턱·목 방향)에 있어야 하므로
            // 손목 landmark(0) 이 코보다 sw*0.05 이상 위로 떠 있으면 얼굴 위에 통째 얹힌 환각으로 판정해 렌더링도 차단합니다.
            const wristLm = hand.landmarks[0];
            if (wristLm && wristLm.y < nose.y - sw * 0.05) {
              continue;
            }

            // 필터 E: Face Mesh 다수 봉쇄 + Pose Wrist 위치 정확 동의 (analyzer.ts 의 필터 E 와 동일 로직)
            // [개선] 다수(85%) 마디가 face mesh 내부 + pose 손목 위치 sw*0.12 이내 정확 일치 없으면 환각으로 판정.
            // 외삽 outlier 한두 점이 face 밖으로 튀어도 다수 비율 검사로 통과시키지 않고, pose 외삽 좌표가 우연히 phantom 근처에 떨어져도 통과시키지 않습니다.
            if (face && face.length > 100 && wristLm) {
              let faceMinX = Infinity, faceMaxX = -Infinity;
              let faceMinY = Infinity, faceMaxY = -Infinity;
              for (const lm of face) {
                if (lm.x < faceMinX) faceMinX = lm.x;
                if (lm.x > faceMaxX) faceMaxX = lm.x;
                if (lm.y < faceMinY) faceMinY = lm.y;
                if (lm.y > faceMaxY) faceMaxY = lm.y;
              }
              const margin = sw * 0.03;
              let insideCount = 0;
              for (const lm of hand.landmarks) {
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
                insideCount >= hand.landmarks.length * 0.85;
              if (majorityInsideFaceMesh) {
                const lPoseWrist = pose[LANDMARK_INDEX.LEFT_WRIST];
                const rPoseWrist = pose[LANDMARK_INDEX.RIGHT_WRIST];
                const poseWristAgrees = (pw: Landmark | undefined): boolean => {
                  if (!pw || pw.visibility < 0.5) return false;
                  return (
                    Math.hypot(wristLm.x - pw.x, wristLm.y - pw.y) < sw * 0.12
                  );
                };
                const realHandConfirmed =
                  poseWristAgrees(lPoseWrist) || poseWristAgrees(rPoseWrist);
                if (!realHandConfirmed) {
                  continue;
                }
              }
            }
          }
        }

        for (const lm of hand.landmarks) {
          ctx.beginPath();
          ctx.arc(lm.x * w, lm.y * h, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [pose, smoothedFace, hands, mask, status, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
        transform: "scaleX(-1)", // Mirror horizontally to match the mirrored webcam video feed
      }}
    />
  );
}
