// 구독 기간 계산. billing-issue(최초 결제)와 charge-renewals(갱신)가 공유한다.
//
// 기존 구현은 `periodEnd.setMonth(getMonth() + 1)` 이었고 두 가지 결함이 있었다.
//   1) 월말 오버플로 — 1/31 에 +1개월 하면 JS 표준 동작으로 3/3(윤년 3/2)이 된다.
//      사용자에게 2~3일을 무료로 주고, 이후 갱신이 3일→3일로 고착돼 청구 앵커가
//      영구히 이동한다.
//   2) 앵커 드리프트 — 갱신 시 기준을 `new Date()`(청구 시각)로 잡았다. 배치가
//      하루 늦거나 더닝으로 4일 지연되면 그 지연이 매 주기 누적된다. 12회 갱신 후
//      청구일이 수 주 밀리고 그만큼 수익이 샌다.
import type { BillingCycle } from "./toss.ts";

// 월 가산 시 말일을 넘기지 않도록 클램프한다. 1/31 +1개월 → 2/28(윤년 2/29).
//
// 알려진 한계: 클램프된 날짜가 다음 앵커가 되므로 청구일이 되돌아오지 않는다.
// 1/31 구독은 2월을 지나며 28일로 내려가고 이후 28일에 고정된다(1/31 → 2/28 →
// 3/28 → …). 사용자에게 불리하지 않고(항상 같거나 이른 청구) 금액도 동일하며,
// 되돌리려면 최초 청구일을 별도 컬럼으로 보존해야 한다. 현재는 수용한다.
function addMonthsClamped(base: Date, months: number): Date {
  const day = base.getUTCDate();
  const r = new Date(base.getTime());
  r.setUTCDate(1); // 말일 상태에서 월을 바꾸면 넘치므로 먼저 1일로 내린다
  r.setUTCMonth(r.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}

/**
 * 다음 구독 만료 시각.
 *
 * 앵커(직전 만료 시각)를 기준으로 한 주기를 더한다. 앵커가 없으면 now 기준.
 * 다만 배치가 오래 멈춰 앵커가 한참 과거인 경우, 앵커 기준 결과가 여전히 과거이면
 * 그대로 두면 다음 배치에서 즉시 또 청구된다(과거 주기를 소급 청구하는 셈).
 * 이 경우에는 now 기준으로 끊어 소급 청구를 막는다.
 */
export function nextPeriodEnd(
  anchorIso: string | null | undefined,
  cycle: BillingCycle,
  now: Date = new Date(),
): Date {
  const months = cycle === "yearly" ? 12 : 1;
  const anchor = anchorIso ? new Date(anchorIso) : null;
  const base = anchor && !isNaN(anchor.getTime()) ? anchor : now;

  let end = addMonthsClamped(base, months);
  if (end <= now) end = addMonthsClamped(now, months);
  return end;
}
