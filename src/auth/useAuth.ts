import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { IS_AUTH_CONFIGURED, authRedirectUrl, supabase } from "./supabase";
import i18n from "../i18n";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
}

// ─── 전역 동기화 채널 ─────────────────────────────────────────────────
//
// useAuth 는 컴포넌트별 격리된 useState 를 갖습니다(같은 supabase client 를
// share 하지만 React state 는 별개). 한 컴포넌트에서 signOut/signIn 을 호출
// 했을 때, 다른 컴포넌트의 useAuth 인스턴스가 즉시 갱신되려면 supabase 의
// onAuthStateChange 발화를 기다려야 합니다. 그런데 Windows + 느린 망에서
// supabase 의 글로벌 RPC 가 지연되면 onAuthStateChange 발화도 늦어져, 일부
// 화면이 30초+ 동안 stale 상태로 남는 현상이 관찰됐습니다 (메모리 가드의
// 1분 reload 가 우연히 fallback 동기화로 작용).
//
// 이를 해결하기 위해 useAuth 들끼리 직접 정합되는 custom event 채널을
// 도입합니다. signOut/signIn 시 즉시 모든 인스턴스에 새 state 를 전파하고,
// supabase 의 RPC 응답은 백그라운드로 진행. RPC 응답 후 onAuthStateChange
// 가 다시 발화해도 이미 동기화된 상태라 무영향입니다.
const AUTH_SYNC_EVENT = "barosit:auth-sync";

interface AuthSyncDetail {
  session: Session | null;
}

// ─── 마지막으로 알려진 session 캐시 (module-level) ──────────────────────
//
// useAuth 가 매 마운트마다 새 인스턴스를 만드는데 초기 state.session=null 로
// 시작하면, *이미 로그인된 사용자가 프로필을 열어도* supabase getSession()
// 응답이 올 때까지 잠깐 비로그인 UI 가 표시되는 깜빡임이 생깁니다 (Windows
// 저사양에선 1-2초). 이 캐시를 두면 새 마운트가 *직전 known session* 으로
// 즉시 시작 → 깜빡임 없음.
//
// 보안: token 같은 민감 정보를 localStorage/sessionStorage 에 추가 저장하지
// 않고 *메모리 module-level* 만 사용. 페이지 리로드 시 자연 무효화됨
// (supabase 가 localStorage 토큰으로 즉시 재복원).
let lastKnownSession: Session | null = null;

function dispatchAuthSync(session: Session | null) {
  lastKnownSession = session;
  try {
    window.dispatchEvent(
      new CustomEvent<AuthSyncDetail>(AUTH_SYNC_EVENT, {
        detail: { session },
      }),
    );
  } catch {
    /* CustomEvent 미지원 환경 — 백업으로 supabase onAuthStateChange 에 의존 */
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: lastKnownSession?.user ?? null,
    session: lastKnownSession,
    // 캐시가 있으면 loading 도 false 로 시작 — Marketing 의 redirect effect
    // 가 loading=false && !user 시 #/login 으로 보내는 의도와 호환.
    loading: IS_AUTH_CONFIGURED && !lastKnownSession,
    configured: IS_AUTH_CONFIGURED,
  });

  useEffect(() => {
    if (!IS_AUTH_CONFIGURED) return;

    let unsub: (() => void) | null = null;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        lastKnownSession = data.session;
        setState((prev) => ({
          ...prev,
          session: data.session,
          user: data.session?.user ?? null,
          loading: false,
        }));
      })
      .catch(() => {
        setState((prev) => ({ ...prev, loading: false }));
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      lastKnownSession = session;
      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        loading: false,
      }));
    });

    // 전역 동기화 채널 — 다른 useAuth 인스턴스가 발화한 state 전파를 수신.
    // supabase 의 onAuthStateChange 와 같은 setter 를 호출하므로 중복 도착해도
    // 안전합니다 (마지막 값으로 수렴). dispatchAuthSync 는 caller 측에서 이미
    // lastKnownSession 을 갱신하므로 여기선 setState 만.
    const handleSync = (e: Event) => {
      const detail = (e as CustomEvent<AuthSyncDetail>).detail;
      const session = detail?.session ?? null;
      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        loading: false,
      }));
    };
    window.addEventListener(AUTH_SYNC_EVENT, handleSync);

    unsub = () => {
      data.subscription.unsubscribe();
      window.removeEventListener(AUTH_SYNC_EVENT, handleSync);
    };

    return () => {
      unsub?.();
    };
  }, []);

  const signInWithOAuth = useCallback(async (provider: "google" | "kakao" | "apple") => {
    if (!IS_AUTH_CONFIGURED) {
      throw new Error(i18n.t("errors:auth.notConfigured"));
    }
    const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;

    if (isTauri) {
      // ─── Tauri OAuth (HTTPS bridge → deep-link) ──────────────────────────
      // 1. PKCE 흐름으로 supabase 가 code_verifier 를 main webview localStorage
      //    (tauri://localhost) 에 저장하고 authorize URL 반환.
      // 2. 외부 기본 브라우저에서 그 URL 을 염. provider 인증 완료 후 provider
      //    → supabase callback → supabase 가 redirectTo (HTTPS bridge URL) 로
      //    redirect.
      // 3. bridge 페이지 (public/desktop-auth-redirect.html) 가 inline JS 로
      //    즉시 barosit://auth-callback?code=... 로 재이동. supabase-js 를
      //    로드하지 않아 web 의 detectSessionInUrl 이 code 를 소비하지 않음.
      // 4. OS 가 barosit:// 를 본 앱으로 라우팅 → deep-link 플러그인이
      //    onOpenUrl 이벤트 발행 → 같은 main webview 의 supabase client 가
      //    저장된 verifier 로 exchangeCodeForSession 실행 → 세션 확립.
      //
      // Why HTTPS bridge: Supabase 의 URL validator 가 custom URI scheme
      // (barosit://) 을 silent 하게 reject 하고 Site URL 로 fallback 시키는
      // 케이스가 관찰됨. HTTPS URL 은 항상 신뢰되어 정확히 redirect.
      // (Site URL 기존 wildcard `https://barosit.com/**` 가 이 bridge URL 을
      // 이미 포함하므로 Supabase 대시보드에 추가 등록 불필요.)

      const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      const { invoke } = await import("@tauri-apps/api/core");

      // v0.2.15 의 I1(verifier 사전 클리어) 는 *진행 중* verifier 까지 손상
      // 시켜 "PKCE code verifier not found" 가 더 자주 발생하는 부작용.
      // 제거하고, handler 안에서 *verifier 존재 확인* + *stale 패턴 재대기*
      // 로 방어합니다 (아래 K1, K2 참고).

      // ─── loopback 폴백 서버 (RFC 8252) ─────────────────────────────────
      // Windows MSIX(스토어) 설치본에서 barosit:// 활성화가 실패하는 환경
      // 확인 (2026-06 스토어 인증 거부 10.1.2.10). Rust 가 127.0.0.1 임시
      // 포트로 listen 하고, 브리지 페이지가 딥링크 시도 후에도 남아 있으면
      // 이 포트로 최상위 이동해 code 를 전달. 수신 query 는 기존
      // `barosit:deep-link` 채널로 emit 되어 아래 custom listener 가
      // 딥링크와 동일하게 처리. 시작 실패는 non-fatal — 딥링크만 사용.
      let loopbackPort: number | null = null;
      try {
        loopbackPort = await invoke<number>("start_auth_loopback");
      } catch (err) {
        console.warn("[useAuth] loopback fallback unavailable (non-fatal):", err);
      }

      // 환경별 override 허용. 미설정 시 production 웹 사용.
      // 로컬 개발 시 .env.local 에 VITE_DESKTOP_AUTH_REDIRECT 로
      // http://localhost:1430/desktop-auth-redirect.html 같이 지정 가능.
      const bridgeBase = (import.meta.env.VITE_DESKTOP_AUTH_REDIRECT as string | undefined)
        ?? "https://barosit.com/desktop-auth-redirect.html";
      const bridgeUrl = loopbackPort !== null
        ? `${bridgeBase}${bridgeBase.includes("?") ? "&" : "?"}port=${loopbackPort}`
        : bridgeBase;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: bridgeUrl,
          skipBrowserRedirect: true,
          queryParams: provider === "google" || provider === "kakao" ? {
            prompt: "select_account",
          } : undefined,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error(i18n.t("errors:auth.noAuthUrl"));

      // deep-link 콜백 대기 — listener 등록 *await* → 외부 브라우저 open
      // → URL 도착까지 await. listener 는 settle 시점 (성공/실패/timeout) 에 정리.
      //
      // 가드 설계 (v0.2.17):
      //   - 시간 가드 (200ms): Tauri 의 deep-link 큐가 새 listener 등록 시
      //     *직전 시도의 callback URL 을 즉시 재발화*하는 동작 차단.
      //   - K1: exchange *직전* localStorage 에 PKCE verifier 가 *존재하는지*
      //     확인. 없으면 *조용히 discard + listener 유지* — 다음 callback
      //     대기. (이전엔 supabase 가 throw 한 "verifier not found" 가 그대로
      //     사용자 alert 로 노출됐음.)
      //   - K2: exchange 가 실패해도 *stale 패턴* (verifier / challenge /
      //     flow state / invalid_grant) 이면 *조용히 재대기*. 진짜 stale URL
      //     이 가드를 우회한 경우 정상 callback 이 뒤늦게 오면 회수.
      //   - settled lock: exchange *성공* 시점으로 이동해 K1/K2 재대기 가능.
      const STALE_URL_THRESHOLD_MS = 200;
      const sessionStartTime = Date.now();

      // PKCE 검증 단계 stale 에러 패턴 — supabase 가 *throw* 또는 *error
      // 반환* 양쪽 모두 같은 메시지 형태이므로 catch 와 if (exchangeErr) 양
      // 분기에서 모두 검사합니다.
      const STALE_ERROR_PATTERNS = [
        "code verifier",
        "code challenge",
        "flow state",
        "invalid_grant",
      ];
      const isStaleExchangeError = (msg: string | undefined): boolean => {
        if (!msg) return false;
        const lower = msg.toLowerCase();
        return STALE_ERROR_PATTERNS.some((p) => lower.includes(p));
      };

      console.log(
        `[useAuth] OAuth start — provider=${provider} startTime=${sessionStartTime}`,
      );

      let resolveSession: () => void = () => {};
      let rejectSession: (err: Error) => void = () => {};
      const sessionPromise = new Promise<void>((resolve, reject) => {
        resolveSession = resolve;
        rejectSession = reject;
      });

      let settled = false;
      let unlisten: (() => void) | null = null;

      // 5분 timeout. provider 페이지에서 사용자가 충분히 인증할 시간 확보.
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        unlisten?.();
        rejectSession(new Error(i18n.t("errors:auth.loginTimeout")));
      }, 5 * 60 * 1000);

      const handler = async (urls: string[]) => {
        // 한 이벤트에 여러 URL 이 올 수 있음 — barosit://auth-callback 만 필터.
        const url = urls.find((u) => u.startsWith("barosit://auth-callback"));
        if (!url) return;

        const elapsed = Date.now() - sessionStartTime;
        const queryIdx = url.indexOf("?");
        const query = queryIdx === -1
          ? new URLSearchParams()
          : new URLSearchParams(url.slice(queryIdx + 1));

        // 디버깅 로그
        console.log(`[useAuth] OAuth callback received — elapsed=${elapsed}ms`);

        // 시간 가드 (200ms) — Tauri 큐의 *즉시 재발화* 만 차단.
        if (elapsed < STALE_URL_THRESHOLD_MS) {
          console.warn(
            `[useAuth] Stale callback discarded by time guard (${elapsed}ms < ${STALE_URL_THRESHOLD_MS}ms)`,
          );
          return;
        }

        if (settled) return;

        try {
          const errParam = query.get("error_description") ?? query.get("error");
          if (errParam) {
            throw new Error(decodeURIComponent(errParam));
          }

          const code = query.get("code");
          if (!code) {
            throw new Error(i18n.t("errors:auth.noCode"));
          }

          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) {
            // K2: stale 패턴 에러 — 조용히 다음 callback 대기.
            if (isStaleExchangeError(exchangeErr.message)) {
              console.warn(
                `[useAuth] Stale exchange error — waiting for next callback: ${exchangeErr.message}`,
              );
              return;
            }
            throw exchangeErr;
          }

          // 여기서부터 *진짜 성공*. settled lock 후 진행.
          settled = true;
          window.clearTimeout(timeoutId);
          unlisten?.();
          console.log(`[useAuth] OAuth exchange succeeded`);

          // 메인 윈도우 포커스 — 사용자가 브라우저에서 돌아오게 안내.
          try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            const win = getCurrentWindow();
            await win.unminimize();
            await win.show();
            await win.setFocus();
          } catch {
            /* 포커스 실패는 치명적이지 않음 */
          }

          // 로그인 시작 화면이 ProfileView 였으면 web 처럼 app 화면으로
          // 자동 이동. ProfileView 는 두 가지 모드로 열림:
          //  (1) route 모드: hash = "#/profile" → App.tsx 가 full-screen 렌더
          //  (2) overlay 모드: profileOpen state = true → MonitorView 위에 overlay
          // 두 모드 모두 커버하기 위해 hash 변경 + custom event 둘 다 발행.
          // - hash 변경: route 모드일 때 #/app 로 navigate
          // - 이벤트: overlay 모드일 때 ProfileView 가 listen 해서 onGoHome 호출
          try {
            const saved = localStorage.getItem("barosit:auth_redirect");
            localStorage.removeItem("barosit:auth_redirect");
            // 저장된 값이 *내부 hash 패턴* 일 때만 적용. 외부 URL /
            // javascript: URI 주입 방어 (XSS 심층 방어).
            const safe = saved && /^#\/[a-zA-Z0-9/_?=&-]*$/.test(saved);
            window.location.hash = safe ? saved! : "#/app";
          } catch {
            /* localStorage 접근 실패 — 사용자 수동 이동에 맡김 */
          }
          try {
            window.dispatchEvent(new CustomEvent("barosit:login-completed"));
          } catch {
            /* CustomEvent 미지원 환경 — overlay 닫기는 사용자 수동에 맡김 */
          }

          resolveSession();
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);

          // M1: supabase 가 *throw* 한 PKCE 검증 에러도 stale 패턴이면 *조용히
          // 재대기*. v0.2.17 의 K2 는 if (exchangeErr) 분기에서만 검사해
          // throw 경로를 놓쳤습니다. 진짜 실패만 alert 으로 노출.
          if (isStaleExchangeError(errMsg)) {
            console.warn(
              `[useAuth] Stale exchange error (throw) — waiting for next callback: ${errMsg}`,
            );
            return;
          }

          // 진짜 실패 — settled lock + cleanup 후 reject.
          settled = true;
          window.clearTimeout(timeoutId);
          unlisten?.();
          console.error(`[useAuth] OAuth exchange failed: ${errMsg}`);
          // 에러 객체 전체도 디버깅용 로깅 (M2)
          console.error(`[useAuth] OAuth exchange error object:`, err);
          rejectSession(err instanceof Error ? err : new Error(errMsg));
        }
      };

      // listener 를 *await 으로 등록 완료 보장* 후 외부 브라우저 open. 등록이
      // 비동기인 채로 외부 브라우저가 빨리 callback 보내면 이벤트 손실 위험.
      try {
        unlisten = await onOpenUrl(handler);
      } catch (err) {
        settled = true;
        window.clearTimeout(timeoutId);
        throw err;
      }

      // [Windows root cause fix] Rust 측 single-instance 콜백이 *2nd 인스턴스
      // 의 argv 에서 deep-link URL 을 추출* 해서 `barosit:deep-link` 이벤트로
      // emit. 이걸 listen 해서 handler 호출 — Tauri plugin 의 onOpenUrl 이
      // Windows 의 single-instance launch 경로에서 작동하지 않는 alleged 버그
      // 의 우회.
      let unlistenCustom: (() => void) | null = null;
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistenCustom = await listen<string>("barosit:deep-link", (event) => {
          const payload = event.payload;
          if (typeof payload === "string" && payload.startsWith("barosit://")) {
            console.log(`[useAuth] custom deep-link channel received: ${payload}`);
            void handler([payload]);
          }
        });
      } catch (err) {
        console.warn("[useAuth] Failed to register custom deep-link listener (non-fatal):", err);
      }

      // dev 전용 loopback relay 폴링 — macOS 에서 `tauri dev` 인스턴스는
      // barosit:// 스킴을 받을 수 없으므로 (스킴은 번들 .app 에만 등록되어
      // 설치본으로 라우팅), vite dev 서버의 /__dev-auth-relay 가 중계한
      // 콜백 query 를 폴링으로 수신해 동일 handler 로 전달. production
      // 빌드에선 DEV=false 라 비활성.
      let pollId: number | null = null;
      if (import.meta.env.DEV) {
        pollId = window.setInterval(async () => {
          if (settled) return;
          try {
            const res = await fetch("/__dev-auth-relay/poll");
            const { query } = (await res.json()) as { query: string | null };
            if (query) {
              console.log("[useAuth] dev relay callback received");
              void handler([`barosit://auth-callback?${query}`]);
            }
          } catch {
            /* relay 미응답 (vite 재시작 등) — 다음 tick 재시도 */
          }
        }, 1000);
      }

      // 외부 브라우저에서 provider 인증 페이지 열기.
      await openUrl(data.url);

      try {
        // 콜백이 돌아올 때까지 await — 호출자 (ProfileView 등) 의 loginLoading 이
        // 실제 세션 확립까지 유지되도록 함.
        await sessionPromise;
      } finally {
        unlistenCustom?.();
        if (pollId !== null) window.clearInterval(pollId);
        // loopback 서버는 10초 유예 후 종료 — 로그인 성공 직후 브리지
        // 페이지의 지연 폴백 네비게이션(3.2초)이 connection refused 에러
        // 페이지 대신 "창을 닫으세요" 안내를 받을 수 있게 함. stop 은 포트
        // 일치 시에만 동작하므로 그 사이 새 시도가 연 새 서버는 무영향.
        if (loopbackPort !== null) {
          const port = loopbackPort;
          window.setTimeout(() => {
            invoke("stop_auth_loopback", { port }).catch(() => {});
          }, 10_000);
        }
      }
    } else {
      // ─── 웹 (PKCE, full-page redirect) ───────────────────────────────────
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: authRedirectUrl(),
          queryParams: provider === "google" || provider === "kakao" ? {
            prompt: "select_account",
          } : undefined,
        },
      });
      if (error) throw error;
    }
  }, []);

  const signInWithGoogle = useCallback(() => signInWithOAuth("google"), [signInWithOAuth]);

  const signInWithApple = useCallback(() => signInWithOAuth("apple"), [signInWithOAuth]);

  const signInWithKakao = useCallback(() => signInWithOAuth("kakao"), [signInWithOAuth]);

  const signInWithNaver = useCallback(async () => {
    if (!IS_AUTH_CONFIGURED) {
      throw new Error(i18n.t("errors:auth.notConfigured"));
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "naver" as any,
      options: {
        redirectTo: authRedirectUrl(),
      },
    });
    if (error) throw error;
  }, []);

  const signInWithLine = useCallback(async () => {
    if (!IS_AUTH_CONFIGURED) {
      throw new Error(i18n.t("errors:auth.notConfigured"));
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "line" as any,
      options: {
        redirectTo: authRedirectUrl(),
      },
    });
    if (error) throw error;
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!IS_AUTH_CONFIGURED) {
      throw new Error(i18n.t("errors:auth.notConfigured"));
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (data.session) {
      dispatchAuthSync(data.session);
    }
    try {
      const saved = localStorage.getItem("barosit:auth_redirect");
      localStorage.removeItem("barosit:auth_redirect");
      const safe = saved && /^#\/[a-zA-Z0-9/_?=&-]*$/.test(saved);
      window.location.hash = safe ? saved! : "#/app";
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent("barosit:login-completed"));
    } catch {}
    return data;
  }, []);

  const signOut = useCallback(async () => {
    if (!IS_AUTH_CONFIGURED) return;
    // 로그아웃 시 Pro 권한 캐시를 즉시 제거한다 — 다음 사용자(또는 같은 기기의
    // Free 계정)가 이전 Pro 세션의 캐시를 물려받아 백그라운드 모니터링/동기화 등
    // Pro 혜택을 그대로 누리는 권한 누수(§7 E1)를 차단. 게스트는 free 로 강등된다.
    // (ProfileView 로그아웃 버튼만 처리하던 것을 공통 경로로 끌어올림.)
    try {
      localStorage.removeItem("barosit:subscription_plan");
      window.dispatchEvent(new Event("barosit:subscription-changed"));
    } catch { /* localStorage 미지원 환경 — 무시 */ }
    // 전역 동기화 채널로 *모든* useAuth 인스턴스에 SIGNED_OUT 상태 즉시 전파.
    // ProfileView / MonitorView / Marketing 등 어디서 호출되든 다른 화면의
    // useAuth 도 ~16ms 안에 user=null 로 정합됩니다.
    dispatchAuthSync(null);
    // supabase 의 글로벌 revoke 는 백그라운드 진행 — 응답 무관. 응답 도착 후
    // onAuthStateChange(SIGNED_OUT) 가 발화해도 이미 동기화 상태라 무영향.
    void supabase.auth.signOut();
  }, []);

  return {
    ...state,
    signInWithGoogle,
    signInWithApple,
    signInWithKakao,
    signInWithNaver,
    signInWithLine,
    signInWithPassword,
    signOut,
  };
}
