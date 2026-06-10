import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import i18n from "../i18n";

const url = import.meta.env.VITE_SUPABASE_URL || "https://kllcnllkcewnutxodwhx.supabase.co";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbGNubGxrY2V3bnV0eG9kd2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTY4MjksImV4cCI6MjA5NDgzMjgyOX0.nzl2oKDUpuAn0cDvG9oIpHNRVAuasYJixW4rapQVTOY";

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

// ─── 소셜 프로필 표시 헬퍼 ────────────────────────────────────────────────
//
// 소셜 OAuth 응답의 user_metadata 에서 표시 정보를 *읽기 전용* 으로 추출.
// 사용자가 변경할 수 있는 UI 는 없지만, 소셜 로그인이 가져온 *기본 프로필
// 이미지/이름* 은 모든 화면에서 자동 표시합니다. 양쪽 화면(MonitorView
// 우상단 / ProfileView 큰 카드) 이 같은 우선순위를 쓰도록 헬퍼로 통일.

interface SocialUserLike {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

// provider 별 OAuth 응답의 avatar URL 키 차이를 흡수:
//   - Kakao, GitHub 등: avatar_url
//   - Google (OIDC 표준 claim): picture
//   - 추가 fallback: image, profile_image_url
// http:// 는 카카오 CDN 의 Mixed Content 차단 우회를 위해 https:// 로 치환.
export function extractSocialAvatarUrl(
  user: SocialUserLike | null | undefined,
): string | null {
  if (!user?.user_metadata) return null;
  const meta = user.user_metadata as Record<string, unknown>;
  const candidates = [
    meta.avatar_url,
    meta.picture,
    meta.image,
    meta.profile_image_url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) {
      return c.startsWith("http://") ? c.replace("http://", "https://") : c;
    }
  }
  return null;
}

// 표시 이름 결정 — profile.name (사용자가 직접 입력) → social full_name /
// name → email 의 local part → "사용자" 순.
export function pickDisplayName(
  profileName: string | null | undefined,
  user: SocialUserLike | null | undefined,
): string {
  const trimmed = profileName?.trim();
  if (trimmed) return trimmed;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (fullName) return fullName;
  const name = typeof meta.name === "string" ? meta.name.trim() : "";
  if (name) return name;
  const emailLocal = user?.email?.split("@")[0];
  if (emailLocal) return emailLocal;
  return i18n.t("common:userFallback");
}

// 표시 이름의 첫 글자 (대문자) — 이미지 로딩 실패 시 이니셜 fallback 용.
export function pickInitial(
  profileName: string | null | undefined,
  user: SocialUserLike | null | undefined,
): string {
  return pickDisplayName(profileName, user).charAt(0).toUpperCase() || "?";
}
