import { useEffect, useRef } from "react";

interface UseMemoryReloadGuardOptions {
  /** 일반 reload 시도 주기 (ms). 기본 60_000 = 1분. */
  intervalMs?: number;
  /** 마지막 사용자 입력 후 이 시간(ms) 이상 idle 일 때만 reload. 기본 10_000 = 10초. */
  idleMs?: number;
  /**
   * deep reload 주기 (ms). about:blank 경유 navigation 으로 일반 reload 보다
   * 약간 더 강한 cleanup 시도. 일반 reload 가 회수하지 못하는 V8 internal
   * cache (IC, JIT, hidden class) 가 천천히 자라는 현상 (1시간에 ~6-12 MB) 의
   * 일부를 추가 release 시도. 미설정 시 deep reload 비활성.
   */
  deepIntervalMs?: number;
  /** false 면 hook 자체를 비활성화. */
  enabled?: boolean;
}

const LAST_RELOAD_KEY = "barosit:last_memory_reload_at";
const LAST_DEEP_RELOAD_KEY = "barosit:last_deep_memory_reload_at";

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
 *
 * Deep reload (선택): deepIntervalMs 가 설정되면 그 주기마다 about:blank
 * intermediate navigation 으로 페이지 lifecycle 을 완전 unload 한 뒤 원래
 * URL 로 복귀. 일반 reload 가 같은 origin 안에서만 cleanup 하는 것과 달리
 * origin 전환을 거치면 일부 V8/Blink internal cache 가 추가로 eviction 됨.
 * V8 instance 자체는 같은 renderer process 라 100% reset 은 아니지만 일반
 * reload 보다 약간 더 깊은 cleanup.
 */
export function useMemoryReloadGuard(
  options: UseMemoryReloadGuardOptions = {},
): void {
  const intervalMs = options.intervalMs ?? 60_000;
  const idleMs = options.idleMs ?? 10_000;
  const deepIntervalMs = options.deepIntervalMs;
  const enabled = options.enabled ?? true;
  const lastDeepReloadAtRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    // mount 시 localStorage 에서 마지막 deep reload 시각 복원. 없으면 현재 시각
    // 으로 init 해서 페이지 첫 로드 직후 즉시 deep reload 가 trigger 되지 않게.
    try {
      const raw = localStorage.getItem(LAST_DEEP_RELOAD_KEY);
      lastDeepReloadAtRef.current = raw ? Number(raw) : Date.now();
    } catch {
      lastDeepReloadAtRef.current = Date.now();
    }

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

      const isDeep =
        deepIntervalMs != null &&
        now - lastDeepReloadAtRef.current >= deepIntervalMs;

      try {
        localStorage.setItem(LAST_RELOAD_KEY, String(now));
      } catch {
        /* localStorage quota 등 — 무시하고 reload 진행 */
      }
      // MonitorView 등이 현재 화면을 sessionStorage 에 snapshot 저장하도록 신호.
      // about:blank navigation 이든 일반 reload 든 동일하게 SnapshotOverlay
      // 가 표시되어 화면 전환 무인지 효과 유지.
      try {
        window.dispatchEvent(new CustomEvent("barosit:before-memory-reload"));
      } catch {
        /* noop */
      }

      if (isDeep) {
        lastDeepReloadAtRef.current = now;
        try {
          localStorage.setItem(LAST_DEEP_RELOAD_KEY, String(now));
        } catch {
          /* noop */
        }
        const url = window.location.href;
        // about:blank 으로 잠깐 navigation 후 원래 URL 복귀.
        // location.replace 를 쓰면 history 에 entry 가 안 쌓여 사용자 back
        // 버튼 동작이 자연스러움.
        window.setTimeout(() => {
          window.location.replace("about:blank");
          window.setTimeout(() => {
            window.location.replace(url);
          }, 100);
        }, 50);
      } else {
        window.setTimeout(() => window.location.reload(), 50);
      }
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
  }, [intervalMs, idleMs, deepIntervalMs, enabled]);
}
