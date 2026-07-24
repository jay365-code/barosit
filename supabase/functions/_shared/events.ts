// 구독 라이프사이클 이벤트 기록 (service_role 전용).
//
// 결제·상태 변경 경로를 절대 깨뜨리지 않도록 철저히 non-fatal 이다: insert 실패는
// 로그만 남기고 삼킨다. 감사 로그 한 줄 때문에 해지·환불·갱신이 실패하면 안 된다.
//
// 쓰기는 여기(service_role adminClient)로만 이뤄진다. subscription_events 에는
// 사용자 INSERT 정책이 없다(20260724020000).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type SubEventType =
  | "subscribed" // 신규 구독(첫 결제 완료)
  | "renewed" // 정기 갱신 청구 성공
  | "canceled" // 해지 예약
  | "resumed" // 해지 예약 철회
  | "cycle_change_scheduled" // 다음 결제일부터 주기 전환 예약
  | "cycle_change_canceled" // 주기 전환 예약 철회
  | "cycle_changed" // 갱신 시 예약된 주기가 실제로 적용됨
  | "card_updated" // 결제수단 등록/변경
  | "card_removed" // 결제수단 삭제
  | "refunded" // 환불(청약철회/중도해지/관리자)
  | "payment_failed" // 갱신 결제 실패(유예 진입)
  | "downgraded"; // FREE 로 강등(만료/유예 소진)

export interface SubEventParams {
  userId: string;
  type: SubEventType;
  visibility?: "user" | "admin"; // 기본 'user'
  actor?: "user" | "system" | "admin"; // 기본 'user'
  detail?: Record<string, unknown>;
}

export async function logSubEvent(
  supabase: SupabaseClient,
  params: SubEventParams,
): Promise<void> {
  try {
    const { error } = await supabase.from("subscription_events").insert({
      user_id: params.userId,
      event_type: params.type,
      visibility: params.visibility ?? "user",
      actor: params.actor ?? "user",
      detail: params.detail ?? {},
    });
    if (error) console.error("logSubEvent insert 실패:", params.type, error.message);
  } catch (e) {
    console.error("logSubEvent 예외:", params.type, (e as any)?.message ?? e);
  }
}
