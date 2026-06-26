// 측정: 익명 활성화 퍼널/재방문 분석.
// 영상·자세데이터·PII 없음 — 익명 install_id + 마일스톤 이벤트만.
// 저장: track_usage RPC → public.usage_events. 동의: 옵트아웃 토글(베타 기본 ON).

import { supabase } from "../auth/supabase";
import { platform } from "../platform";
import { loadLang } from "../i18n/lang";

const CONSENT_KEY = "usage_analytics_enabled";
const INSTALL_ID_KEY = "barosit:install_id";

export type UsageScope = "once" | "daily" | "always";

export function isUsageAnalyticsEnabled(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) !== "0"; // 기본 ON(베타)
  } catch {
    return true;
  }
}

export function setUsageAnalyticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function genId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  // 폴백 — 충돌 위험 무시 가능한 익명 식별자
  return "ins-" + Math.abs(hashStr(String(typeof navigator !== "undefined" ? navigator.userAgent : "") + ":" + performance.now())).toString(36) + Date.now().toString(36);
}

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

export function getInstallId(): string {
  try {
    let id = localStorage.getItem(INSTALL_ID_KEY);
    if (!id) {
      id = genId();
      localStorage.setItem(INSTALL_ID_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * 이벤트를 보낼지 결정하고 dedup 마커를 갱신한다(순수 localStorage — 테스트 가능).
 * once: 영구 1회 / daily: 하루 1회 / always: 항상.
 */
export function shouldFire(event: string, scope: UsageScope): boolean {
  if (scope === "always") return true;
  const key = `usage_fired:${event}`;
  try {
    if (scope === "once") {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, "1");
      return true;
    }
    // daily
    const today = todayStr();
    if (localStorage.getItem(key) === today) return false;
    localStorage.setItem(key, today);
    return true;
  } catch {
    return true;
  }
}

/** 마일스톤 이벤트 적재 (동의·dedup 확인 후 비동기 fire-and-forget) */
export function trackUsage(
  event: string,
  opts: { scope?: UsageScope; props?: Record<string, unknown> } = {},
): void {
  try {
    if (!isUsageAnalyticsEnabled()) return;
    if (!shouldFire(event, opts.scope ?? "always")) return;

    void supabase
      .rpc("track_usage", {
        p_install_id: getInstallId(),
        p_event: event,
        p_client: platform.features.multiWindow ? "desktop" : "web",
        p_app_version: cachedVersion,
        p_lang: loadLang(),
        p_props: opts.props ?? {},
      })
      .then(({ error }) => {
        if (error) console.warn("[usage] track failed:", error.message);
      });
  } catch {
    /* 측정 실패는 앱에 영향 없음 */
  }
}

let cachedVersion = "";

/** 부팅 시 1회 — 앱 버전 캐시 */
export function initUsageAnalytics(): void {
  platform
    .getAppVersion()
    .then((v) => {
      cachedVersion = v;
    })
    .catch(() => undefined);
}

/** 테스트 전용 */
export function __resetUsageDedup(): void {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("usage_fired:")) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
