import { useEffect, useRef } from "react";
import type { Landmarks } from "../pose/types";

interface Props {
  landmarks: Landmarks | null;
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
  [0, 7],
  [0, 8], // face → ears
];

export function LandmarkOverlay({ landmarks }: Props) {
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

    ctx.strokeStyle = "rgba(79,140,255,0.85)";
    ctx.lineWidth = 2;
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

    ctx.fillStyle = "#4f8cff";
    for (const lm of landmarks) {
      if (lm.visibility < 0.5) continue;
      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [landmarks]);

  return <canvas ref={canvasRef} />;
}
