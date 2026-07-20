// payment-cancel Edge Function 이 dryRun 으로 돌려주는 환불 견적.
//
// 자격 판정과 금액 산정은 전적으로 서버 책임이다. 클라이언트는 이 값을 그대로
// 표시하기만 하고 절대 재계산하지 않는다 — 재계산하면 화면에 표시한 금액과 실제
// 환불액이 어긋날 수 있다. 산식은 supabase/functions/_shared/toss.ts 참조.
export type RefundQuote = {
  eligible: true;
  /** withdrawal = 청약철회 전액 환불, prorated = 이용일수·위약금 공제 후 환불 */
  mode: "withdrawal" | "prorated";
  paidAmount: number;
  refund: number;
  isFullRefund: boolean;
  daysUsed: number;
  usedAmount: number;
  penalty: number;
};
