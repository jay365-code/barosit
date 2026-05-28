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
    
    // 현재 창이 이미 팝업 샌드박스 내부인지 판별
    const hashQuery = typeof window !== "undefined" ? window.location.hash.split("?")[1] || "" : "";
    const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search || hashQuery : "");
    const isPopup = searchParams.get("is_popup") === "true";

    if (isTauri && !isPopup) {
      try {
        console.warn(`[Tauri OAuth] Spawning sandbox login popup for ${provider}...`);
        
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const existing = await WebviewWindow.getByLabel("oauth-login");
        if (existing) {
          console.log("[Tauri OAuth] Closing existing oauth-login window label...");
          await existing.close();
        }

        // 팝업창 내부에서 로그인 프로세스(시작과 끝)를 자생적으로 처리하도록 유도하여 PKCE 격리를 극복합니다.
        const popupUrl = `${window.location.origin}/#/profile?provider=${provider}&is_popup=true`;

        new WebviewWindow("oauth-login", {
          url: popupUrl,
          title: `${provider === "kakao" ? "카카오" : provider === "google" ? "Google" : "Apple"} 로그인`,
          width: 500,
          height: 650,
          resizable: true,
          alwaysOnTop: true,
          focus: true,
        });

        const checkInterval = setInterval(async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            clearInterval(checkInterval);
            console.log("[Tauri OAuth] Session detected, closing login popup...");
            const win = await WebviewWindow.getByLabel("oauth-login");
            if (win) {
              await win.close();
            }
            window.location.reload();
          }
        }, 1000);

        setTimeout(() => {
          clearInterval(checkInterval);
        }, 600000);

      } catch (err) {
        console.error("[Tauri OAuth Error]", err);
        throw err;
      }
    } else {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: authRedirectUrl(),
          queryParams: provider === "google" || provider === "kakao" ? {
            prompt: "select_account"
          } : undefined
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
