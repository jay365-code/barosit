// OPS-1 (2): 클라이언트 에러/크래시 자동 리포트
// - 전역 window.onerror / unhandledrejection + React ErrorBoundary 에서 호출
// - 저장: report_client_error RPC → public.client_errors (fingerprint 로 집계)
// - 동의: 기본 ON(베타 관측), 설정에서 옵트아웃 가능. 카메라/영상은 전송 안 함.
// - 폭주 방지: 세션 내 같은 fingerprint 1회 + 전체 상한.

import { supabase } from "../auth/supabase";
import { platform } from "../platform";
import { loadLang } from "../i18n/lang";

const CONSENT_KEY = "error_reporting_enabled";
const SESSION_CAP = 25; // 한 세션에서 보낼 수 있는 최대 리포트 수

export function isErrorReportingEnabled(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) !== "0"; // 기본 ON
  } catch {
    return true;
  }
}

export function setErrorReportingEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const sentFingerprints = new Set<string>();
let sentCount = 0;
let installed = false;

function hash(input: string): string {
  // djb2
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function firstStackFrame(stack?: string): string {
  if (!stack) return "";
  const lines = stack.split("\n").map((l) => l.trim());
  // 메시지 줄(첫 줄)을 건너뛴 첫 "at ..." 프레임
  return lines.find((l) => l.startsWith("at ")) || lines[1] || "";
}

export type ErrorKind = "react" | "window" | "promise" | "unknown";

export function reportError(
  error: unknown,
  kind: ErrorKind = "unknown",
  extra?: { stack?: string },
): void {
  try {
    if (!isErrorReportingEnabled()) return;
    if (sentCount >= SESSION_CAP) return;

    const err = error as { message?: string; stack?: string } | string | null;
    const message =
      typeof err === "string" ? err : err?.message || String(error) || "Unknown error";
    const stack = extra?.stack || (typeof err === "object" ? err?.stack : "") || "";

    const fp = hash(`${kind}|${message.slice(0, 120)}|${firstStackFrame(stack)}`);
    if (sentFingerprints.has(fp)) return;
    sentFingerprints.add(fp);
    sentCount++;

    let plan = "free";
    try {
      plan = localStorage.getItem("barosit:subscription_plan") || "free";
    } catch {
      /* ignore */
    }

    // 비동기 적재 — 실패해도 앱에 영향 주지 않도록 완전히 격리
    void supabase
      .rpc("report_client_error", {
        p_fingerprint: fp,
        p_kind: kind,
        p_message: message,
        p_stack: stack,
        p_route:
          typeof window !== "undefined"
            ? window.location.hash || window.location.pathname
            : "",
        p_app_version: getVersionCached(),
        p_client: platform.features.multiWindow ? "desktop" : "web",
        p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        p_lang: loadLang(),
        p_plan: plan,
      })
      .then(({ error: rpcErr }) => {
        if (rpcErr) console.warn("[errorReporting] rpc failed:", rpcErr.message);
      });
  } catch {
    // 리포터 자체의 오류는 절대 전파하지 않는다
  }
}

let cachedVersion = "";
function getVersionCached(): string {
  return cachedVersion;
}

/** 앱 부팅 시 1회 호출 — 전역 핸들러 설치 + 버전 캐시 */
export function initErrorReporting(): void {
  if (installed) return;
  installed = true;

  platform
    .getAppVersion()
    .then((v) => {
      cachedVersion = v;
    })
    .catch(() => undefined);

  if (typeof window === "undefined") return;

  window.addEventListener("error", (e: ErrorEvent) => {
    reportError(e.error ?? e.message, "window", {
      stack: e.error?.stack || `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`,
    });
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    reportError(reason, "promise", {
      stack: typeof reason === "object" ? reason?.stack : undefined,
    });
  });
}
