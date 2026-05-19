/**
 * 간헐적 freeze 자가 복구 + 진단 로깅.
 *
 * 두 가지 알려진 이슈 대응:
 * - 메인 가려졌을 때 미니바/위젯이 가끔 멈춤 (macOS 가 App Nap·AudioContext 우회를
 *   뚫고 throttling 적용하는 케이스)
 * - 위젯 ↔ 메인 모드 전환 시 가끔 메인 블랙 화면 (race condition / HMR stale)
 *
 * 두 가지 모두 onFrame heartbeat 가 끊기거나 widget_state 갱신이 멈추는 형태로
 * 나타남. 60초 이상 멈추면 hard reload, 30초 이상이면 warning log 만.
 *
 * 사용:
 *   const tick = useHeartbeat();  // 매 프레임 tick() 호출
 *   useWatchdog("engine-frame", tick.getLastAt, { ... });
 */

import { useEffect, useRef } from "react";

const LOG_PREFIX = "[barosit:watchdog]";

export interface WatchdogOptions {
  /** 정상 동작 시 update 간격 (ms). 디버그 출력용 — 동작에는 영향 없음. */
  expectedIntervalMs: number;
  /** 이 시간 이상 update 없으면 warning log */
  warnThresholdMs: number;
  /** 이 시간 이상 update 없으면 hard recover (window.location.reload) */
  reloadThresholdMs: number;
  /** watchdog 검사 주기 (ms). 기본 5000. */
  checkIntervalMs?: number;
  /** stale 진입 시 hard reload 대신 호출할 fallback. null 이면 reload 사용. */
  onReload?: () => void;
  /** watchdog 활성 여부. false 면 검사 안 함 (예: pose loop 비활성 상태). */
  active: boolean;
}

interface HeartbeatRef {
  getLastAt: () => number;
  tick: () => void;
}

/** Heartbeat ref — onFrame 등에서 매번 tick() 호출. */
export function useHeartbeat(): HeartbeatRef {
  const ref = useRef<number>(0);
  const apiRef = useRef<HeartbeatRef>({
    getLastAt: () => ref.current,
    tick: () => {
      ref.current = Date.now();
    },
  });
  return apiRef.current;
}

/**
 * Watchdog — 주기적으로 getLastAt() 체크.
 *
 * - 정상: 무동작
 * - warnThresholdMs 초과: console.warn (1회 발사 후 재발사 안 함 — 같은 stale 구간)
 * - reloadThresholdMs 초과: console.error + window.location.reload() (또는 onReload)
 */
export function useWatchdog(
  name: string,
  getLastAt: () => number,
  opts: WatchdogOptions,
): void {
  const warnedRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!opts.active) return;
    const interval = setInterval(() => {
      const current = optsRef.current;
      if (!current.active) return;
      const last = getLastAt();
      if (last === 0) return; // 아직 시작 안 함

      const since = Date.now() - last;

      if (since >= current.reloadThresholdMs) {
        console.error(
          `${LOG_PREFIX} [${name}] STALE ${(since / 1000).toFixed(1)}s — recovering`,
        );
        if (current.onReload) {
          current.onReload();
        } else {
          try {
            window.location.reload();
          } catch {
            /* noop */
          }
        }
        warnedRef.current = false;
        return;
      }

      if (since >= current.warnThresholdMs && !warnedRef.current) {
        console.warn(
          `${LOG_PREFIX} [${name}] stale ${(since / 1000).toFixed(1)}s ` +
            `(expected interval ${current.expectedIntervalMs}ms)`,
        );
        warnedRef.current = true;
      } else if (since < current.warnThresholdMs && warnedRef.current) {
        console.info(
          `${LOG_PREFIX} [${name}] recovered after stale period`,
        );
        warnedRef.current = false;
      }
    }, opts.checkIntervalMs ?? 5000);

    return () => clearInterval(interval);
  }, [opts.active, getLastAt, name]);
}

// ─── 구조화 로깅 (mode transition / camera / 기타 진단) ──────────────────────

const LOG_INFO_PREFIX = "[barosit]";

export function logEvent(
  category: "mode" | "camera" | "engine" | "alert",
  message: string,
  detail?: unknown,
): void {
  const ts = new Date().toISOString().substr(11, 12);
  if (detail !== undefined) {
    console.info(`${LOG_INFO_PREFIX}[${category}] ${ts} ${message}`, detail);
  } else {
    console.info(`${LOG_INFO_PREFIX}[${category}] ${ts} ${message}`);
  }
}
