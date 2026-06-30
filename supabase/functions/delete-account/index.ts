// POST /functions/v1/delete-account
// 회원탈퇴(셀프서비스 계정·데이터 삭제) — soft delete + 30일 유예 + 유예중 복구.
//
// body: { action: 'request' | 'cancel' }
// auth: Authorization: Bearer <user jwt> 필수
//
// request : profiles.deletion_requested_at = now, deletion_scheduled_at = now+30d 기록
//           + 활성 PRO 구독 자동갱신 해지(status='canceled'). 실제 파기는
//           purge_deleted_accounts() (pg_cron 일배치) 가 유예 경과 후 수행.
// cancel  : 유예 중 탈퇴 취소 — deletion_* 컬럼 NULL 복귀(계정 복구).
//
// 설계: docs/account-deletion-policy.html · 정책 확정 2026-06-30
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, getUser } from "../_shared/admin.ts";
import { sendUserEmail, tplDeletionCanceled, tplDeletionRequested } from "../_shared/email.ts";

const GRACE_DAYS = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = adminClient();
    const user = await getUser(req, supabase);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { action } = await req.json();
    if (action !== "request" && action !== "cancel") {
      return json({ error: "action must be 'request' or 'cancel'" }, 400);
    }

    if (action === "cancel") {
      // 유예 중 탈퇴 취소 — 계정 복구
      const { error } = await supabase.from("profiles").update({
        deletion_requested_at: null,
        deletion_scheduled_at: null,
      }).eq("id", user.id);
      if (error) throw new Error(error.message);

      const m = tplDeletionCanceled();
      await sendUserEmail(user.email, m.subject, m.html);
      return json({ success: true, status: "active" });
    }

    // action === 'request' — 탈퇴 신청(soft delete)
    const now = new Date();
    const scheduled = new Date(now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);

    const { error: profErr } = await supabase.from("profiles").update({
      deletion_requested_at: now.toISOString(),
      deletion_scheduled_at: scheduled.toISOString(),
    }).eq("id", user.id);
    if (profErr) throw new Error(profErr.message);

    // 활성 PRO 구독은 자동갱신만 해지(잔여기간 이용, 환불 없음) — charge-renewals 가
    // canceled 는 청구하지 않는다. 이미 canceled/inactive 면 건너뜀.
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (sub && sub.plan_id === "pro" && sub.status === "active") {
      await supabase.from("user_subscriptions").update({
        status: "canceled",
        updated_at: now.toISOString(),
      }).eq("user_id", user.id);
    }

    // 운영 가시성: 어드민 알림(가입/해지와 동일 채널)
    await supabase.from("admin_notifications").insert({
      event_type: "account_deletion_requested",
      severity: "warning",
      message: `회원탈퇴 신청 — ${scheduled.toISOString().slice(0, 10)} 파기 예정`,
      payload: { user_id: user.id, scheduled_at: scheduled.toISOString() },
    });

    // 접수 안내 메일 (발송 실패해도 처리 결과엔 영향 없음)
    const m = tplDeletionRequested(scheduled.toISOString());
    await sendUserEmail(user.email, m.subject, m.html);

    return json({ success: true, status: "pending_deletion", scheduled_at: scheduled.toISOString() });
  } catch (e: any) {
    console.error("delete-account error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e) }, 400);
  }
});
