// POST /functions/v1/charge-renewals  (pg_cron 매일 호출, service_role)
// 만기 도래 구독 정기청구 + 더닝(결제 실패 시 7일 유예 → FREE 강등).
//
// 대상: status in ('active','grace_period','canceled') 이고 current_period_end <= now()
//  - active   : 청구 성공 → 기간 연장 / 실패 → grace_period + 유예 7일 시작
//  - grace    : 2일 간격 재청구. 성공 → active 복귀 / 유예 7일 초과 또는
//               최대 시도(유예기간÷간격) 초과 실패 → FREE 강등
//  - canceled : 청구하지 않고 만료 시 FREE 정리 (§7 H1)
// 빌링키/customerKey 는 암호화 저장(§ crypto)되어 청구 전 복호화한다.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, makeOrderId, isServiceRole } from "../_shared/admin.ts";
import { chargeBilling, getPaymentByOrderId, PRICE, type BillingCycle } from "../_shared/toss.ts";
import { sendUserEmail, tplPaymentFailed, tplDowngraded } from "../_shared/email.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { nextPeriodEnd } from "../_shared/period.ts";
import { logSubEvent } from "../_shared/events.ts";

const GRACE_DAYS = 7;
// 더닝(재시도) 제어 (§11 M3): 최소 재시도 간격 2일 + 최대 시도 횟수 3회.
// 이전엔 grace 구독이 매일 재청구돼 카드사 위험신호가 될 수 있었다.
const DUNNING_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;
// 유예 GRACE_DAYS(7일) 동안 DUNNING_INTERVAL_MS(2일) 간격으로 재시도하면 시도는
// day0/2/4/6 의 4회 일어난다(첫 실패 = active→grace 전환도 1회로 센다). 예전 값(3)이면
// 안내 메일에 적은 7일보다 3일 먼저(4일차에) 잘려서, 카드 교체하러 온 사용자가 이미
// 강등돼 있었다. floor(7/2)=3 은 그 예전 값과 같으므로 +1 해서 4로 맞춘다.
const MAX_DUNNING_ATTEMPTS = Math.floor((GRACE_DAYS * 24 * 60 * 60 * 1000) / DUNNING_INTERVAL_MS) + 1;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // 청구 배치는 pg_cron 전용이다. verify_jwt 만으로는 로그인한 아무 사용자나
  // 임의 시점에 전체 만기 구독의 청구·더닝을 강제 실행할 수 있었다.
  if (!isServiceRole(req)) return json({ error: "Forbidden" }, 403);

  try {
    const supabase = adminClient();
    const nowIso = new Date().toISOString();

    const { data: due } = await supabase
      .from("user_subscriptions")
      .select("user_id, billing_key, customer_key, billing_cycle, pending_billing_cycle, current_period_end, status, grace_period_until, dunning_attempts, last_dunning_at")
      .in("status", ["active", "grace_period", "canceled"])
      .lte("current_period_end", nowIso);

    const results = { charged: 0, graced: 0, downgraded: 0, skipped: 0, cleaned: 0 };

    for (const sub of due ?? []) {
      // 해지 예약(canceled)이 만료일에 도달 → 청구하지 않고 FREE 로 정리한다.
      // (이전엔 청구 대상에서 빠지기만 해 plan_id='pro', status='canceled' 행이
      //  영구 잔존했다 — 운영 통계/세그먼트 오염. §7 H1)
      if (sub.status === "canceled") {
        await supabase.from("user_subscriptions").update({
          plan_id: "free", status: "none",
          billing_key: null, customer_key: null, card_info: null,
          current_period_end: null, grace_period_until: null,
          updated_at: new Date().toISOString(),
        }).eq("user_id", sub.user_id);
        await logSubEvent(supabase, {
          userId: sub.user_id, type: "downgraded", actor: "system",
          detail: { reason: "canceled_expired" },
        });
        results.cleaned++;
        continue;
      }

      // 결제수단이 없으면 청구할 수 없다. 예전에는 skip 만 하고 넘어갔는데, 만기가
      // 지난 구독이 매 배치 skip 되며 강등 로직에 영원히 도달하지 못했다. 사용자가
      // 프로필에서 카드를 삭제하면 billing_key 만 NULL 이 되고 plan_id 는 pro 로
      // 남으므로, 카드 삭제 = 영구 무료 PRO 가 됐다. 만기가 지난 건은 정리한다.
      if (!sub.billing_key || !sub.customer_key) {
        await supabase.from("user_subscriptions").update({
          plan_id: "free", status: "none",
          billing_key: null, customer_key: null, card_info: null,
          current_period_end: null, grace_period_until: null,
          billing_cycle: null,
          updated_at: new Date().toISOString(),
        }).eq("user_id", sub.user_id);
        await logSubEvent(supabase, {
          userId: sub.user_id, type: "downgraded", actor: "system",
          detail: { reason: "no_payment_method" },
        });
        results.cleaned++;
        continue;
      }

      // 더닝 재시도 최소 간격(2일) 가드 — grace 중 매일 재청구 방지(§11 M3).
      if (sub.status === "grace_period" && sub.last_dunning_at) {
        if (Date.now() - new Date(sub.last_dunning_at).getTime() < DUNNING_INTERVAL_MS) {
          results.skipped++;
          continue;
        }
      }

      // 저장된 빌링키/customerKey 복호화 (암호화 미적용 시 평문 그대로 반환)
      const billingKey = await decryptSecret(sub.billing_key);
      const customerKey = await decryptSecret(sub.customer_key);
      if (!billingKey || !customerKey) {
        console.error("charge-renewals: 키 복호화 실패 user", sub.user_id);
        results.skipped++;
        continue;
      }

      // 주기 판정. 예전에는 NULL 을 조용히 monthly 로 떨어뜨려, billing_cycle 이 비어
      // 있는 연간 구독자에게 월 요금만 청구됐다(fail-silent 수익 누수). NULL 이면
      // 원장의 최근 결제 주기로 복구하고, 그것도 없으면 청구하지 않고 알린다.
      let cycle: BillingCycle | null =
        sub.billing_cycle === "yearly" ? "yearly" : sub.billing_cycle === "monthly" ? "monthly" : null;
      if (!cycle) {
        const { data: lastPay } = await supabase
          .from("billing_history")
          .select("billing_cycle")
          .eq("user_id", sub.user_id).eq("kind", "payment")
          .not("billing_cycle", "is", null)
          .order("created_at", { ascending: false }).limit(1);
        const recovered = lastPay?.[0]?.billing_cycle;
        cycle = recovered === "yearly" ? "yearly" : recovered === "monthly" ? "monthly" : null;
        if (cycle) {
          // 다음 배치부터 다시 조회하지 않도록 구독 행을 보정한다.
          await supabase.from("user_subscriptions")
            .update({ billing_cycle: cycle, updated_at: new Date().toISOString() })
            .eq("user_id", sub.user_id);
        }
      }
      // 주기 전환 예약 소비 — 사용자가 "다음 결제일부터 연간" 을 예약했다면 이번
      // 청구부터 그 주기로 간다. 즉시 전환이 아니라 여기서 적용하는 이유는
      // 잔여 기간 비례정산·부분환불을 피하기 위해서다(20260721060000 주석 참조).
      // 실제 청구가 성공한 뒤에 소비 처리한다 — 아래 성공 분기에서 billing_cycle 을
      // 갱신하고 pending 을 비운다. 여기서 미리 비우면 청구 실패 시 예약이 증발한다.
      const pending = sub.pending_billing_cycle;
      const pendingCycle: BillingCycle | null =
        pending === "yearly" ? "yearly" : pending === "monthly" ? "monthly" : null;
      // 예약된 주기가 이번 청구에서 실제로 적용됐는지 — 이벤트 detail 에 기록한다.
      const cycleBeforePending = cycle;
      if (pendingCycle && pendingCycle !== cycle) {
        console.log(`charge-renewals: 주기 전환 적용 ${cycle} → ${pendingCycle} (user ${sub.user_id})`);
        cycle = pendingCycle;
      }
      const cycleChanged = cycle !== cycleBeforePending;

      if (!cycle) {
        console.error("charge-renewals: billing_cycle 판정 불가 user", sub.user_id);
        await supabase.from("admin_notifications").insert({
          event_type: "billing_cycle_missing", severity: "warning",
          message: `결제 주기를 판정할 수 없어 청구를 건너뜀: user ${sub.user_id}`,
          payload: { user_id: sub.user_id },
        });
        results.skipped++;
        continue;
      }
      const amount = PRICE[cycle];
      const orderId = makeOrderId("renew");

      try {
        const payment = await chargeBilling({
          billingKey,
          customerKey,
          amount,
          orderId,
          orderName: `BaroSit PRO ${cycle === "yearly" ? "연간" : "월간"} 정기결제`,
        });

        const periodEnd = nextPeriodEnd(sub.current_period_end, cycle);

        await supabase.from("user_subscriptions").update({
          status: "active",
          current_period_end: periodEnd.toISOString(),
          grace_period_until: null,
          dunning_attempts: 0,
          last_dunning_at: null,
          // 예약된 주기로 청구했으므로 이제 이게 현재 주기다. 예약은 소비 완료.
          billing_cycle: cycle,
          pending_billing_cycle: null,
          updated_at: new Date().toISOString(),
        }).eq("user_id", sub.user_id);

        await supabase.from("billing_history").insert({
          user_id: sub.user_id, kind: "payment", order_id: orderId,
          payment_key: payment.paymentKey, amount, plan: "pro",
          billing_cycle: cycle, status: "completed", cash_receipt_issued: false,
          created_at: new Date().toISOString(),
        });
        await logSubEvent(supabase, {
          userId: sub.user_id, type: "renewed", actor: "system",
          detail: {
            cycle, amount,
            ...(cycleChanged ? { cycle_changed: true, from: cycleBeforePending, to: cycle } : {}),
          },
        });
        results.charged++;
      } catch (chargeErr: any) {
        // 응답 유실 방어 — chargeBilling 은 네트워크 타임아웃도 예외로 던진다.
        // 토스에서는 승인됐는데 응답만 유실된 경우, 실패로 처리하면 다음 더닝에서
        // 새 orderId 로 다시 청구해 이중 출금이 된다(order_id UNIQUE 인덱스는
        // orderId 가 다르므로 막지 못한다). 실패 처리 전에 PG 원장을 조회해
        // 실제 승인 여부를 확인한다.
        const settled = await getPaymentByOrderId(orderId).catch(() => null);
        if (settled?.status === "DONE") {
          console.warn("charge-renewals: 응답 유실이나 승인 확인됨 —", orderId);
          const periodEnd = nextPeriodEnd(sub.current_period_end, cycle);
          await supabase.from("user_subscriptions").update({
            status: "active",
            current_period_end: periodEnd.toISOString(),
            grace_period_until: null,
            dunning_attempts: 0,
            last_dunning_at: null,
            // 정상 성공 분기와 동일하게 예약을 소비한다 — 여기서 빠뜨리면 승인은
            // 됐는데 예약이 남아 다음 갱신에 같은 전환이 또 적용된다.
            billing_cycle: cycle,
            pending_billing_cycle: null,
            updated_at: new Date().toISOString(),
          }).eq("user_id", sub.user_id);
          await supabase.from("billing_history").insert({
            user_id: sub.user_id, kind: "payment", order_id: orderId,
            payment_key: settled.paymentKey, amount, plan: "pro",
            billing_cycle: cycle, status: "completed", cash_receipt_issued: false,
            created_at: new Date().toISOString(),
          });
          await logSubEvent(supabase, {
            userId: sub.user_id, type: "renewed", actor: "system",
            detail: {
              cycle, amount,
              ...(cycleChanged ? { cycle_changed: true, from: cycleBeforePending, to: cycle } : {}),
            },
          });
          results.charged++;
          continue;
        }

        // 결제 실패 → 더닝
        const attempts = (sub.dunning_attempts ?? 0) + 1;
        const firstGrace = sub.grace_period_until ?? null;
        const graceExpired = firstGrace && new Date(firstGrace) <= new Date();

        // 사용자 알림 메일 발송용 이메일 조회 (실패해도 더닝 본 로직엔 영향 없음)
        let userEmail: string | null = null;
        try {
          const { data: u } = await supabase.auth.admin.getUserById(sub.user_id);
          userEmail = u?.user?.email ?? null;
        } catch { /* 무시 */ }

        const nowIsoTs = new Date().toISOString();
        if (sub.status === "active" || !firstGrace) {
          // 첫 실패 → 유예 시작
          const graceUntil = new Date();
          graceUntil.setDate(graceUntil.getDate() + GRACE_DAYS);
          await supabase.from("user_subscriptions").update({
            status: "grace_period",
            grace_period_until: graceUntil.toISOString(),
            dunning_attempts: attempts,
            last_dunning_at: nowIsoTs,
            updated_at: nowIsoTs,
          }).eq("user_id", sub.user_id);
          // 결제 실패 + 카드 갱신 유도 메일 (§11 H2)
          const m = tplPaymentFailed(graceUntil.toISOString());
          await sendUserEmail(userEmail, m.subject, m.html);
          await logSubEvent(supabase, {
            userId: sub.user_id, type: "payment_failed", actor: "system",
            detail: { attempts, grace_until: graceUntil.toISOString(), cycle },
          });
          results.graced++;
        } else if (graceExpired || attempts >= MAX_DUNNING_ATTEMPTS) {
          // 유예 만료 또는 최대 재시도(3회) 초과 → FREE 강등 + 빌링키 비활성화 (§11 M3)
          await supabase.from("user_subscriptions").update({
            plan_id: "free", status: "none",
            billing_key: null, customer_key: null, card_info: null,
            current_period_end: null, grace_period_until: null,
            dunning_attempts: attempts,
            last_dunning_at: nowIsoTs,
            updated_at: nowIsoTs,
          }).eq("user_id", sub.user_id);
          // FREE 강등 안내 메일
          const m = tplDowngraded();
          await sendUserEmail(userEmail, m.subject, m.html);
          await logSubEvent(supabase, {
            userId: sub.user_id, type: "downgraded", actor: "system",
            detail: { reason: "dunning_exhausted", attempts },
          });
          results.downgraded++;
        } else {
          // 유예 중 재시도 실패 (아직 7일·최대횟수 전) — 다음 간격까지 대기
          await supabase.from("user_subscriptions").update({
            dunning_attempts: attempts,
            last_dunning_at: nowIsoTs,
            updated_at: nowIsoTs,
          }).eq("user_id", sub.user_id);
          results.skipped++;
        }

        await supabase.from("admin_notifications").insert({
          event_type: "payment_failed", severity: "warning",
          message: `정기결제 실패 (시도 ${attempts}회): user ${sub.user_id}. ${chargeErr?.message ?? ""}`,
          payload: { user_id: sub.user_id, attempts, cycle },
        });
      }
    }

    return json({ success: true, ...results, processed: due?.length ?? 0 });
  } catch (e: any) {
    console.error("charge-renewals error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
