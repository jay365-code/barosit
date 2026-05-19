import type { Landmark, Landmarks } from "./types";

export class LandmarkSmoother {
  private buffer: Landmarks[] = [];
  constructor(private readonly windowSize = 7) {}

  push(landmarks: Landmarks): Landmarks {
    this.buffer.push(landmarks);
    if (this.buffer.length > this.windowSize) this.buffer.shift();
    return this.average();
  }

  reset(): void {
    this.buffer = [];
  }

  private average(): Landmarks {
    const count = this.buffer.length;
    const out: Landmark[] = [];
    const numLandmarks = this.buffer[0].length;

    for (let i = 0; i < numLandmarks; i++) {
      let x = 0,
        y = 0,
        z = 0,
        visSum = 0,
        weightSum = 0;
      for (const frame of this.buffer) {
        const lm = frame[i];
        const w = lm.visibility;
        x += lm.x * w;
        y += lm.y * w;
        z += lm.z * w;
        visSum += lm.visibility;
        weightSum += w;
      }
      const safeW = weightSum || 1;
      out.push({
        x: x / safeW,
        y: y / safeW,
        z: z / safeW,
        visibility: visSum / count,
      });
    }
    return out;
  }
}

/** Returns true only if every required landmark has visibility above threshold. */
export function hasReliableLandmarks(
  landmarks: Landmarks,
  requiredIndices: number[],
  minVisibility = 0.7,
): boolean {
  return requiredIndices.every(
    (i) => landmarks[i] && landmarks[i].visibility >= minVisibility,
  );
}
