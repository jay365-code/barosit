-- Database Migration: Real payment backend support (Toss billing/charge/cancel/dunning)
--
-- P0-1 결제 백엔드를 실제 동작시키기 위한 스키마/보안 보정.
--  (1) prevent_subscription_tampering 트리거가 service_role(Edge Function)을 허용하도록 보정
--      — 결제 검증을 통과한 백엔드만 plan_id/status 를 쓸 수 있게 한다.
--  (2) 정기청구에 필요한 customer_key / billing_cycle 컬럼 추가
--  (3) billing_history 멱등성 — order_id 고유 인덱스 (웹훅/재시도 중복 방지)

-- ── (1) 트리거: 어드민 OR service_role 만 plan_id/status 변경 허용 ──────────
CREATE OR REPLACE FUNCTION public.prevent_subscription_tampering()
RETURNS TRIGGER AS $$
DECLARE
  jwt_role TEXT;
BEGIN
  -- 현재 요청의 JWT role (service_role = 백엔드 Edge Function)
  jwt_role := coalesce(
    current_setting('request.jwt.claims', true)::json->>'role',
    ''
  );

  -- 어드민도 아니고 service_role 도 아닌 일반 사용자가
  -- plan_id / status 를 바꾸려 하면 차단.
  IF NOT public.is_admin() AND jwt_role <> 'service_role' THEN
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION '보안 경고 (Tampering Blocked): 구독 등급(plan_id)/상태(status)는 결제 검증을 거친 서버만 변경할 수 있습니다.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── (2) 정기청구용 컬럼 ────────────────────────────────────────────────────
ALTER TABLE public.user_subscriptions
ADD COLUMN IF NOT EXISTS customer_key  VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20)  DEFAULT NULL,
ADD COLUMN IF NOT EXISTS dunning_attempts INTEGER   DEFAULT 0;

COMMENT ON COLUMN public.user_subscriptions.customer_key IS 'Toss 정기결제 customerKey (billingKey 청구 시 동일 키 필요)';
COMMENT ON COLUMN public.user_subscriptions.billing_cycle IS 'monthly | yearly — 정기청구 금액/주기 산정';
COMMENT ON COLUMN public.user_subscriptions.dunning_attempts IS '정기청구 실패 누적 재시도 횟수 (유예기간 더닝)';

-- ── (3) 멱등성: 동일 주문 중복 적재 방지 ──────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_history_order_id
    ON public.billing_history (order_id)
    WHERE order_id IS NOT NULL;

-- ── (4) [운영 안내] 정기청구 배치 스케줄 (pg_cron) ───────────────────────────
-- pg_cron / pg_net 확장은 Supabase 대시보드(Database → Extensions)에서 활성화 후,
-- 아래를 SQL Editor 에서 1회 실행한다. (service_role key 노출 방지를 위해
-- 마이그레이션에 하드코딩하지 않음.)
--
--   select cron.schedule(
--     'daily-billing-dunning-job',
--     '0 18 * * *',  -- UTC 18:00 = KST 03:00
--     $$
--       select net.http_post(
--         url     := 'https://<project-ref>.supabase.co/functions/v1/charge-renewals',
--         headers := jsonb_build_object(
--           'Content-Type','application/json',
--           'Authorization','Bearer <SERVICE_ROLE_KEY>'
--         ),
--         body    := '{}'::jsonb
--       );
--     $$
--   );
