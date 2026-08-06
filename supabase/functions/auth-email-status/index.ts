// POST /functions/v1/auth-email-status  { email }
// → { status: "not_found" | "password" | "oauth", providers?: string[] }
//
// 비밀번호 찾기 화면이 "가입되지 않은 이메일"·"소셜 로그인으로 가입된 계정"을
// 정확히 안내하기 위한 조회. 사용자 결정(2026-08-06): 안 오는 메일을 기다리게
// 하는 것보다 사실대로 알려주는 쪽이 낫다.
//
// ⚠️ 이 함수는 의도적으로 가입 여부를 노출한다(account enumeration). 그래서
// IP 당 시간당 호출을 제한한다. 제한을 넘으면 429 — 클라이언트는 기존의
// 모호한 안내로 폴백한다.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/admin.ts";

const MAX_PER_HOUR = 20;

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { email } = await req.json();
    if (typeof email !== "string" || !email.includes("@")) {
      return json({ error: "invalid email" }, 400);
    }
    const normalized = email.trim().toLowerCase();
    const supabase = adminClient();
    const ip = clientIp(req);

    // ─── 레이트리밋 ────────────────────────────────────────────────────────
    // 오래된 기록은 매 호출마다 정리한다(호출량이 적어 크론까지 둘 필요 없음).
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabase.from("email_lookup_attempts").delete().lt("created_at", hourAgo);
    const { count } = await supabase
      .from("email_lookup_attempts")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", hourAgo);
    if ((count ?? 0) >= MAX_PER_HOUR) {
      return json({ error: "rate_limited" }, 429);
    }
    await supabase.from("email_lookup_attempts").insert({ ip });

    // ─── 조회 ──────────────────────────────────────────────────────────────
    const { data, error } = await supabase.rpc("auth_email_status", { p_email: normalized });
    if (error) throw new Error(error.message);

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.found) return json({ status: "not_found" });

    const providers: string[] = row.providers ?? [];
    if (providers.includes("email")) return json({ status: "password" });
    return json({ status: "oauth", providers });
  } catch (e: any) {
    console.error("auth-email-status error:", e?.message ?? e);
    return json({ error: "internal" }, 500);
  }
});
