import { useEffect } from "react";

interface UseMemoryReloadGuardOptions {
  /** 일반 reload 시도 주기 (ms). 기본 60_000 = 1분. */
  intervalMs?: number;
  /** 마지막 사용자 입력 후 이 시간(ms) 이상 idle 일 때만 reload. 기본 10_000 = 10초. */
  idleMs?: number;
  /** deep reload 주기 (ms) - 현재는 안전을 위해 일반 새로고침으로 호환 처리됨 */
  deepIntervalMs?: number;
  /** false 면 hook 자체를 비활성화. */
  enabled?: boolean;
}

const LAST_RELOAD_KEY = "barosit:last_memory_reload_at";

/**
 * 주기적으로 페이지를 새로고침해 V8 외부 메모리 (video frame buffer, canvas
 * backing, GPU staging, MediaPipe internal) 를 release.
 *
 * Why: 활성 사용 중 분당 ~110 MB 의 V8 외부 메모리 증가가 관찰됨. V8 heap
 * snapshot 은 244 MB 로 안정인데 footprint 은 빠르게 자람 — V8 정책상
 * 활성 중 회수되지 않는 영역. 수동 새로고침이 720 MB 수준으로 release 한다는
 * 게 검증되어, 이를 자동화.
 *
 * How to apply: idle 임계를 두어 사용자가 활발히 입력 중일 땐 reload 보류.
 * 모니터링 상태 (점수, 위반, baseline, 일별 통계) 는 모두 localStorage 또는
 * supabase 로 영속화되어 있어 reload 후 자동 복원됨.
 */
export function useMemoryReloadGuard(
  options: UseMemoryReloadGuardOptions = {},
): void {
  const intervalMs = options.intervalMs ?? 60_000;
  const idleMs = options.idleMs ?? 10_000;
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    let lastInputAt = Date.now();
    const onInput = () => {
      lastInputAt = Date.now();
    };
    window.addEventListener("mousemove", onInput, { passive: true });
    window.addEventListener("keydown", onInput, { passive: true });
    window.addEventListener("click", onInput, { passive: true });
    window.addEventListener("touchstart", onInput, { passive: true });
    window.addEventListener("wheel", onInput, { passive: true });

    const tick = () => {
      const now = Date.now();
      if (now - lastInputAt < idleMs) return; // 사용자 활성 중이면 다음 cycle 까지 대기

      try {
        localStorage.setItem(LAST_RELOAD_KEY, String(now));
      } catch {
        /* localStorage quota 등 — 무시하고 reload 진행 */
      }
      // MonitorView 등이 현재 화면을 sessionStorage 에 snapshot 저장하도록 신호.
      // SnapshotOverlay 가 reload 직후 짧게 표시되어 화면 전환 무인지 효과 유지.
      try {
        window.dispatchEvent(new CustomEvent("barosit:before-memory-reload"));
      } catch {
        /* noop */
      }

      // 안전하고 검증된 일반 새로고침으로 실행하여 about:blank 컨텍스트 소멸로 인한 교착 현상을 예방합니다.
      window.setTimeout(() => window.location.reload(), 50);
    };

    const id = window.setInterval(tick, intervalMs);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("mousemove", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("click", onInput);
      window.removeEventListener("touchstart", onInput);
      window.removeEventListener("wheel", onInput);
    };
  }, [intervalMs, idleMs, enabled]);
}
