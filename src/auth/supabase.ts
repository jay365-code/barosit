import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = "https://kllcnllkcewnutxodwhx.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbGNubGxrY2V3bnV0eG9kd2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTY4MjksImV4cCI6MjA5NDgzMjgyOX0.nzl2oKDUpuAn0cDvG9oIpHNRVAuasYJixW4rapQVTOY";

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

const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);

export const supabase: SupabaseClient = IS_AUTH_CONFIGURED
  ? createClient(url!, anonKey!, {
      auth: {
        flowType: isTauri ? "implicit" : "pkce",
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
