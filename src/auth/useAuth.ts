import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { IS_AUTH_CONFIGURED, authRedirectUrl, supabase } from "./supabase";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: IS_AUTH_CONFIGURED,
    configured: IS_AUTH_CONFIGURED,
  });

  useEffect(() => {
    if (!IS_AUTH_CONFIGURED) return;

    let unsub: (() => void) | null = null;

    supabase.auth
      .getSession()
      .then(({ data }) => {
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
      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        loading: false,
      }));
    });
    unsub = () => data.subscription.unsubscribe();

    return () => {
      unsub?.();
    };
  }, []);

  const signInWithOAuth = useCallback(async (provider: "google" | "kakao" | "apple") => {
    if (!IS_AUTH_CONFIGURED) {
      throw new Error("Supabase 가 설정되지 않아 로그인할 수 없습니다.");
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

      // 환경별 override 허용. 미설정 시 production 웹 사용.
      // 로컬 개발 시 .env.local 에 VITE_DESKTOP_AUTH_REDIRECT 로
      // http://localhost:1430/desktop-auth-redirect.html 같이 지정 가능.
      const bridgeUrl = (import.meta.env.VITE_DESKTOP_AUTH_REDIRECT as string | undefined)
        ?? "https://barosit.com/desktop-auth-redirect.html";

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
      if (!data?.url) throw new Error("인증 주소를 생성하지 못했습니다.");

      // deep-link 콜백 대기 — listener 등록 → 외부 브라우저 open → URL 도착까지 await.
      // listener 는 await 가 끝난 시점 (성공/실패/timeout) 에 모두 정리.
      const sessionPromise = new Promise<void>((resolve, reject) => {
        let unlisten: (() => void) | null = null;
        let settled = false;

        // 5분 timeout. provider 페이지에서 사용자가 충분히 인증할 시간 확보.
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          unlisten?.();
          reject(new Error("로그인 시간이 초과되었습니다. 다시 시도해주세요."));
        }, 5 * 60 * 1000);

        onOpenUrl(async (urls) => {
          // 한 이벤트에 여러 URL 이 올 수 있음 — barosit://auth-callback 만 필터.
          const url = urls.find((u) => u.startsWith("barosit://auth-callback"));
          if (!url) return;
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          unlisten?.();

          try {
            // custom scheme URL 은 표준 URL 파서가 일관되지 않으므로 수동 파싱.
            // barosit://auth-callback?code=XXX&state=YYY 형태 (PKCE).
            const queryIdx = url.indexOf("?");
            const query = queryIdx === -1
              ? new URLSearchParams()
              : new URLSearchParams(url.slice(queryIdx + 1));

            const errParam = query.get("error_description") ?? query.get("error");
            if (errParam) {
              throw new Error(decodeURIComponent(errParam));
            }

            const code = query.get("code");
            if (!code) {
              throw new Error("인증 응답에 code 파라미터가 없습니다.");
            }

            const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeErr) throw exchangeErr;

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
              window.location.hash = saved ?? "#/app";
            } catch {
              /* localStorage 접근 실패 — 사용자 수동 이동에 맡김 */
            }
            try {
              window.dispatchEvent(new CustomEvent("barosit:login-completed"));
            } catch {
              /* CustomEvent 미지원 환경 — overlay 닫기는 사용자 수동에 맡김 */
            }

            resolve();
          } catch (err) {
            reject(err);
          }
        }).then((u) => {
          unlisten = u;
          // 등록 전에 이미 settled (예: timeout 즉시 발생) 면 곧장 정리.
          if (settled) u();
        }).catch((err) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          reject(err);
        });
      });

      // 외부 브라우저에서 provider 인증 페이지 열기.
      await openUrl(data.url);

      // 콜백이 돌아올 때까지 await — 호출자 (ProfileView 등) 의 loginLoading 이
      // 실제 세션 확립까지 유지되도록 함.
      await sessionPromise;
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

  const signInWithMagicLink = useCallback(async (email: string) => {
    if (!IS_AUTH_CONFIGURED) {
      throw new Error("Supabase 가 설정되지 않아 로그인할 수 없습니다.");
    }
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new Error("올바른 이메일 주소를 입력해주세요.");
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        emailRedirectTo: authRedirectUrl(),
      },
    });
    if (error) throw error;
  }, []);

  const signInWithApple = useCallback(() => signInWithOAuth("apple"), [signInWithOAuth]);

  const signInWithKakao = useCallback(() => signInWithOAuth("kakao"), [signInWithOAuth]);

  const signInWithNaver = useCallback(async () => {
    if (!IS_AUTH_CONFIGURED) {
      throw new Error("Supabase 가 설정되지 않아 로그인할 수 없습니다.");
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
      throw new Error("Supabase 가 설정되지 않아 로그인할 수 없습니다.");
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "line" as any,
      options: {
        redirectTo: authRedirectUrl(),
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (!IS_AUTH_CONFIGURED) return;
    await supabase.auth.signOut();
  }, []);

  return {
    ...state,
    signInWithGoogle,
    signInWithApple,
    signInWithKakao,
    signInWithNaver,
    signInWithLine,
    signInWithMagicLink,
    signOut,
  };
}
