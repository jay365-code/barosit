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

  const signInWithGoogle = useCallback(async () => {
    if (!IS_AUTH_CONFIGURED) {
      throw new Error("Supabase 가 설정되지 않아 로그인할 수 없습니다.");
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirectUrl(),
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error;
  }, []);

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

  const signInWithApple = useCallback(async () => {
    if (!IS_AUTH_CONFIGURED) {
      throw new Error("Supabase 가 설정되지 않아 로그인할 수 없습니다.");
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: authRedirectUrl(),
      },
    });
    if (error) throw error;
  }, []);

  const signInWithKakao = useCallback(async () => {
    if (!IS_AUTH_CONFIGURED) {
      throw new Error("Supabase 가 설정되지 않아 로그인할 수 없습니다.");
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: authRedirectUrl(),
      },
    });
    if (error) throw error;
  }, []);

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
