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

// PKCE flow 통일 — 이전엔 Tauri 분기에서 implicit 로 분리했으나, deep-link 기반
// 새 흐름에선 외부 브라우저에서 받은 code 를 supabase client 가 그대로 교환할 수
// 있어 보안상 우수한 PKCE 로 일원화. supabase 가 verifier 를 같은 origin 의
// localStorage (tauri://localhost) 에 저장하므로 deep-link callback 이 메인
// 윈도우 컨텍스트로 들어왔을 때 동일 client 가 즉시 exchange 가능.
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

