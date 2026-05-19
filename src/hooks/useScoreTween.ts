import { useEffect, useRef, useState } from "react";

const TWEEN_MS = 900;
const JUMP_THRESHOLD = 5;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * 점수 값을 부드럽게 보간 + 큰 상승 점프(5+ delta)를 회복 모먼트로 플래그.
 * MonitorView 의 ScoreRing 과 Widget 알약에서 동일한 애니메이션 결을 공유.
 *
 * 반환:
 *   displayed — 매 RAF 프레임마다 갱신되는 보간된 점수 (라운드 전 값)
 *   jumped    — 마지막 점프가 회복 모먼트인지 여부 (~1.1s 동안 true)
 */
export function useScoreTween(score: number): {
  displayed: number;
  jumped: boolean;
} {
  const [displayed, setDisplayed] = useState<number>(score);
  const [jumped, setJumped] = useState<boolean>(false);
  const fromRef = useRef<number>(score);
  const rafRef = useRef<number | null>(null);
  const jumpedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = score;
    if (Math.round(from) === Math.round(to)) {
      setDisplayed(to);
      fromRef.current = to;
      return;
    }

    if (to - from >= JUMP_THRESHOLD) {
      setJumped(true);
      if (jumpedTimerRef.current != null)
        window.clearTimeout(jumpedTimerRef.current);
      jumpedTimerRef.current = window.setTimeout(
        () => setJumped(false),
        TWEEN_MS + 200,
      );
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / TWEEN_MS);
      const v = from + (to - from) * easeOutCubic(t);
      setDisplayed(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
        rafRef.current = null;
      }
    };
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [score]);

  useEffect(() => {
    return () => {
      if (jumpedTimerRef.current != null)
        window.clearTimeout(jumpedTimerRef.current);
    };
  }, []);

  return { displayed, jumped };
}
