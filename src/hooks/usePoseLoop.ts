import { useEffect, useRef, useState } from "react";
import { detectFromVideo, initLandmarkers } from "../pose/detector";
import type { DetectionFrame } from "../pose/types";

export interface UsePoseLoopOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  fps?: number;
  /** segmenter를 N틱마다 실행. 기본 2. */
  segmentEveryN?: number;
  /** Face Landmarker 실행. 기본 true. */
  runFace?: boolean;
  /** Hand Landmarker 실행. 기본 true. */
  runHands?: boolean;
  onFrame?: (frame: DetectionFrame) => void;
}

/**
 * Pose + Face + Hand + Segmenter를 주기적으로 실행.
 * setInterval 대신 setTimeout-재귀 패턴을 사용해, 한 틱이 늦으면 다음 틱이
 * 큐잉되지 않고 단순히 늦춰진다 (백프레셔 방지 → 손/포즈 표시가 실시간에 가까움).
 */
function friendlyModelError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  // 네트워크/CDN/WASM 로드 실패는 한 줄로 묶어서 안내. 원본 메시지는 콘솔에 남기고 사용자에겐 가림.
  if (/fetch|network|load|wasm|tflite|task/i.test(raw)) {
    return "자세 감지 모델을 불러올 수 없어요. 인터넷 연결을 확인하고 다시 시도해주세요.";
  }
  return `자세 감지 초기화 실패: ${raw}`;
}

export function usePoseLoop({
  videoRef,
  enabled,
  fps = 8,
  segmentEveryN = 2,
  runFace = true,
  runHands = true,
  onFrame,
}: UsePoseLoopOptions): {
  ready: boolean;
  error: string | null;
  retry: () => void;
} {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const callbackRef = useRef(onFrame);
  callbackRef.current = onFrame;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        await initLandmarkers();
        if (cancelled) return;
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        console.error("initLandmarkers failed:", e);
        setError(friendlyModelError(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  const retry = () => {
    setReady(false);
    setRetryToken((n) => n + 1);
  };

  useEffect(() => {
    if (!ready || !enabled) return;
    const intervalMs = Math.round(1000 / fps);
    let cancelled = false;
    let timer: number | null = null;
    let tickCount = 0;
    let lastTs = 0;

    const tick = () => {
      if (cancelled) return;
      const start = performance.now();
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        timer = window.setTimeout(tick, intervalMs);
        return;
      }
      const ts = performance.now();
      const safeTs = ts <= lastTs ? lastTs + 1 : ts;
      lastTs = safeTs;
      tickCount += 1;
      const segment =
        segmentEveryN <= 0 ? false : tickCount % segmentEveryN === 0;
      const frame = detectFromVideo(video, safeTs, {
        segment,
        face: runFace,
        hands: runHands,
      });
      callbackRef.current?.(frame);
      const elapsed = performance.now() - start;
      const wait = Math.max(0, intervalMs - elapsed);
      timer = window.setTimeout(tick, wait);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [ready, enabled, fps, segmentEveryN, runFace, runHands, videoRef]);

  return { ready, error, retry };
}
