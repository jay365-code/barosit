import { useEffect, useRef } from "react";
import type { Landmarks, Landmark } from "../pose/types";

interface Props {
  landmarks: Landmarks | null;
  faceLandmarks?: Landmark[] | null;
}

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], // shoulders
  [11, 13],
  [13, 15], // left arm
  [12, 14],
  [14, 16], // right arm
  [11, 23],
  [12, 24],
  [23, 24], // torso
];

const COARSE_FACE_CONNECTIONS: [number, number][] = [
  [0, 7],
  [0, 8], // face → ears
];

export function LandmarkOverlay({ landmarks, faceLandmarks }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!landmarks) return;

    const hasDetailedFace = !!faceLandmarks && faceLandmarks.length > 0;

    ctx.strokeStyle = "rgba(79,140,255,0.85)";
    ctx.lineWidth = 2;

    // 1. Draw body pose connections
    for (const [a, b] of POSE_CONNECTIONS) {
      const la = landmarks[a];
      const lb = landmarks[b];
      if (!la || !lb) continue;
      if (la.visibility < 0.5 || lb.visibility < 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(la.x * canvas.width, la.y * canvas.height);
      ctx.lineTo(lb.x * canvas.width, lb.y * canvas.height);
      ctx.stroke();
    }

    // 2. Draw coarse face connections ONLY if detailed face is NOT present
    if (!hasDetailedFace) {
      for (const [a, b] of COARSE_FACE_CONNECTIONS) {
        const la = landmarks[a];
        const lb = landmarks[b];
        if (!la || !lb) continue;
        if (la.visibility < 0.5 || lb.visibility < 0.5) continue;
        ctx.beginPath();
        ctx.moveTo(la.x * canvas.width, la.y * canvas.height);
        ctx.lineTo(lb.x * canvas.width, lb.y * canvas.height);
        ctx.stroke();
      }
    }

    // 3. Draw body pose dots (indices 11 and above, or indices 0..10 if detailed face is NOT present)
    ctx.fillStyle = "#4f8cff";
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (lm.visibility < 0.5) continue;
      if (i < 11 && hasDetailedFace) continue; // Skip coarse face dots if we have a detailed mesh!

      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Draw detailed face mesh if present
    if (hasDetailedFace && faceLandmarks) {
      ctx.fillStyle = "rgba(79, 140, 255, 0.85)";
      for (let i = 0; i < faceLandmarks.length; i += 2) { // stride 2 to keep it clean but high-fidelity
        const lm = faceLandmarks[i];
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 1.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [landmarks, faceLandmarks]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 2,
        pointerEvents: "none",
        transform: "scaleX(-1)", // Mirror horizontally to match the mirrored webcam video feed
      }}
    />
  );
}
