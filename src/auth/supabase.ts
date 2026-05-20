import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const IS_AUTH_CONFIGURED = Boolean(url && anonKey);

function createStub(): SupabaseClient {
  const message =
    "Supabase 가 설정되지 않았습니다. .env.local 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 확인하세요.";
  return new Proxy({} as SupabaseClient, {
    get() {
      throw new Error(message);
    },
  });
}

export const supabase: SupabaseClient = IS_AUTH_CONFIGURED
  ? createClient(url!, anonKey!, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : createStub();

export function authRedirectUrl(path: string = "/#/auth/callback"): string {
  const explicit = import.meta.env.VITE_AUTH_REDIRECT_BASE;
  if (explicit) return `${explicit.replace(/\/$/, "")}${path}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  return path;
}
