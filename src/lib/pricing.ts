// 구독 금액 단일 출처(클라이언트). 서버는 supabase/functions/_shared/toss.ts 의 PRICE 가
// 진실원이며, 클라이언트 값은 표시·분석용일 뿐 실제 청구 금액은 서버가 결정한다(§11 L1).
// 두 곳의 값이 어긋나지 않도록 변경 시 함께 수정한다.
export const PRICE_KRW = {
  monthly: 4900,
  yearly: 36000,
} as const;

export type BillingCycle = keyof typeof PRICE_KRW;

export function priceFor(cycle: BillingCycle | string | null | undefined): number {
  return cycle === "yearly" ? PRICE_KRW.yearly : PRICE_KRW.monthly;
}
