// 커뮤니티 SEO(#18) 공유 SSR 헬퍼 — 목록/사이트맵 함수에서 재사용.
// (글 상세 함수 community/p/[id].ts 는 먼저 검증되어 자체 인라인 유지 — 건드리지 않음.)
// _ 프리픽스 디렉터리라 Pages 라우팅 대상 아님(임포트 전용).

export interface Env {
  ASSETS: { fetch: (input: RequestInfo | URL) => Promise<Response> };
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export const SITE = "https://barosit.com";
export const FALLBACK_SUPABASE_URL = "https://kllcnllkcewnutxodwhx.supabase.co";
export const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbGNubGxrY2V3bnV0eG9kd2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTY4MjksImV4cCI6MjA5NDgzMjgyOX0.nzl2oKDUpuAn0cDvG9oIpHNRVAuasYJixW4rapQVTOY";

export function supabaseCreds(env: Env): { base: string; key: string } {
  return {
    base: env.SUPABASE_URL || FALLBACK_SUPABASE_URL,
    key: env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY,
  };
}

export function stripMarkdown(s: string): string {
  return (s || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

// HTML 텍스트 컨텍스트 이스케이프(noscript 등).
export function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// XML 텍스트 컨텍스트 이스케이프(sitemap).
export function escapeXml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// JSON-LD <script> 컨텍스트 이스케이프 — </script> 브레이크아웃 차단.
export function jsonLdSafe(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
