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
import { sendUserEmail, tplCanceled } from "../_shared/email.ts";

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
      .select("plan_id, status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sub || sub.plan_id !== "pro") {
      return json({ error: "활성 PRO 구독이 없습니다." }, 400);
    }

    // 상태 가드. 예전에는 plan_id 만 보고 status 를 무시해서, 결제 실패로
    // grace_period 인 사용자가 resume 을 누르면 status='active' 가 되고
    // charge-renewals 가 유예 기간을 새로 7일 부여했다(강등 분기에 도달하지 못함).
    // 7일마다 resume 만 눌러 영구 무료 PRO 가 가능했다.
    if (action === "cancel" && sub.status !== "active") {
      return json({ error: "해지할 수 있는 활성 구독이 아닙니다." }, 400);
    }
    if (action === "resume" && sub.status !== "canceled") {
      return json({ error: "해지 예약 상태에서만 구독을 재개할 수 있습니다." }, 400);
    }
    // 이미 만료된 구독은 되살리지 않는다(다음 배치가 정리해야 할 대상).
    if (
      action === "resume" &&
      (!sub.current_period_end || new Date(sub.current_period_end) <= new Date())
    ) {
      return json({ error: "이용 기간이 만료되어 재개할 수 없습니다. 새로 구독해 주세요." }, 400);
    }

    const nextStatus = action === "cancel" ? "canceled" : "active";
    const { error } = await supabase.from("user_subscriptions").update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    if (error) throw new Error(error.message);

    // 해지 예약 접수 안내 메일 (§11 H2) — 발송 실패해도 처리 결과엔 영향 없음
    if (action === "cancel") {
      const m = tplCanceled(sub.current_period_end);
      await sendUserEmail(user.email, m.subject, m.html);
    }

    return json({ success: true, status: nextStatus });
  } catch (e: any) {
    console.error("subscription-manage error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e) }, 400);
  }
});
