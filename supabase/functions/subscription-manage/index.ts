// POST /functions/v1/subscription-manage
// 구독 해지 예약(cancel) / 해지 철회(resume). status 변경은 트리거 때문에 서버만 가능.
//
// body: { action: 'cancel' | 'resume' }
// auth: Authorization: Bearer <user jwt> 필수
//
// cancel : status='canceled' — 남은 기간까지 PRO 유지, 만료 시 정기청구 중단(charge-renewals 가 canceled 는 청구하지 않음)
// resume : status='active'   — 해지 예약 철회
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, getUser } from "../_shared/admin.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = adminClient();
    const user = await getUser(req, supabase);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { action } = await req.json();
    if (action !== "cancel" && action !== "resume") {
      return json({ error: "action must be 'cancel' or 'resume'" }, 400);
    }

    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sub || sub.plan_id !== "pro") {
      return json({ error: "활성 PRO 구독이 없습니다." }, 400);
    }

    const nextStatus = action === "cancel" ? "canceled" : "active";
    const { error } = await supabase.from("user_subscriptions").update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    if (error) throw new Error(error.message);

    return json({ success: true, status: nextStatus });
  } catch (e: any) {
    console.error("subscription-manage error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e) }, 400);
  }
});
