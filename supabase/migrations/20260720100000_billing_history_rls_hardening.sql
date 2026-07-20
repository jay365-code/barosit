-- billing_history 는 결제 원장이다. 사용자가 자기 행을 INSERT/UPDATE 할 수 있으면
-- payment-cancel 의 환불 자격 판정이 통째로 우회된다:
--   * status 를 refunded → completed 로 되돌려 재환불
--   * created_at 을 최근으로 바꿔 7일 청약철회 창을 리셋
--     (미사용 판정도 조작된 created_at 이후만 세므로 unused=true 가 되어 전액 환불)
--   * amount 를 키워 환불액 팽창
--
-- user_subscriptions 에는 check_subscription_tampering 트리거가 있으나 원장에는
-- 대응물이 없었다. 원장 쓰기는 Edge Function 의 service_role 로만 이루어지고
-- (클라이언트 코드에는 .select() 경로만 존재) service_role 은 RLS 를 우회하므로
-- 두 정책을 철회해도 정상 결제·환불 흐름에는 영향이 없다.
--
-- SELECT 정책은 유지한다 — 사용자가 자기 결제 내역을 조회해야 한다.
-- DELETE 는 애초에 정책이 없어 RLS 기본 거부로 막혀 있다.

DROP POLICY IF EXISTS "Users can insert their own billing history" ON "public"."billing_history";
DROP POLICY IF EXISTS "Users can update their own billing history" ON "public"."billing_history";
