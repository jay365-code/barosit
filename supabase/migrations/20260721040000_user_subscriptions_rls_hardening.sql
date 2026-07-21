-- 구독 테이블 쓰기 잠금 — 무료 PRO 위조 경로 차단.
--
-- 배경: billing_history 는 20260720100000 에서 잠갔지만 user_subscriptions 에는
-- 같은 처방이 가지 않았다. 원장을 못 고쳐도 구독 자체를 위조하면 되므로 원장 잠금의
-- 의미가 반감돼 있었다.
--
-- 열려 있던 정책 두 개:
--   "Users can update their own subscription billing key"  (UPDATE, auth.uid() = user_id)
--   "Users can upsert their own subscription"              (ALL,    auth.uid() = user_id)
--
-- 방어는 check_subscription_tampering 트리거 하나뿐인데 BEFORE UPDATE 에만 걸려 있고
-- plan_id·status 두 컬럼만 본다. 그래서 로그인 사용자가 anon 키만으로:
--   ① current_period_end 를 먼 미래로 UPDATE — plan_id/status 를 안 건드리니 트리거를
--      통과한다. status='active' 그대로에 만료일만 밀리면 영구 PRO 이고,
--      charge-renewals 는 current_period_end <= now() 로 대상을 고르니 청구도 안 된다.
--   ② DELETE 후 INSERT — 트리거가 BEFORE UPDATE 라 INSERT 는 무방비다.
--      plan_id='pro', status='active', current_period_end='2099-01-01' 로 새로 넣으면 끝.
--
-- 조치: 사용자 쓰기 정책을 모두 철회하고 SELECT 만 남긴다. 구독 행을 바꾸는 경로는
-- Edge Function 의 service_role 로 일원화한다(service_role 은 RLS 를 우회).
--   - 웹 카드 등록/변경 : billing-issue (이미 서버 경로)
--   - 해지/재개/카드삭제 : subscription-manage
--   - 청구/강등/정리     : charge-renewals
--   - 환불               : payment-cancel / admin-refund
-- 어드민 정책("Admins can do everything on user_subscriptions", is_admin())은 유지한다
-- — AdminDashboardView 의 수동 조정이 여기에 의존한다.
--
-- 클라이언트의 나머지 참조는 전부 .select() 라 영향 없다(App.tsx / useEntitlement /
-- Marketing / PricingView / ProfileView 조회 경로 확인함).

DROP POLICY IF EXISTS "Users can update their own subscription billing key" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Users can upsert their own subscription" ON public.user_subscriptions;

-- SELECT 정책이 없으면 사용자가 자기 구독을 못 읽는다. 있으면 그대로 두고, 없으면 만든다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'user_subscriptions'
      AND p.polname = 'Users can view their own subscription'
  ) THEN
    CREATE POLICY "Users can view their own subscription" ON public.user_subscriptions
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END
$$;

-- 트리거는 남겨 심층 방어로 쓴다. 쓰기 정책이 사라졌으므로 일반 사용자는 애초에
-- 도달하지 못하지만, 향후 누군가 정책을 다시 열더라도 INSERT 위조까지는 막히도록
-- BEFORE INSERT 도 함께 건다.
--
-- ⚠ service_role 우회는 반드시 유지해야 한다. 트리거는 RLS 와 달리 service_role
-- 에도 발동하고, is_admin() 은 auth.uid() 기반이라 service_role 에서는 false 다.
-- 이 분기가 없으면 billing-issue·charge-renewals·payment-cancel 의 구독 쓰기가 전부
-- 막힌다. (프로덕션에는 이 분기가 이미 들어가 있었으나 마이그레이션에는 없었다 —
-- SQL Editor 직접 수정이 레포에 반영되지 않은 드리프트. 여기서 함께 정본화한다.)
CREATE OR REPLACE FUNCTION public.prevent_subscription_tampering()
RETURNS TRIGGER AS $$
DECLARE
  jwt_role TEXT;
BEGIN
  jwt_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');

  IF public.is_admin() OR jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- 비관리자가 직접 만드는 구독 행은 유료 등급일 수 없다.
    -- status 는 제한하지 않는다 — 신규 가입 트리거(handle_new_user)가 SECURITY DEFINER
    -- 로 ('free','active') 행을 넣는데, 그 시점엔 is_admin() 이 false 라 이 분기를 탄다.
    -- status 까지 좁히면 회원가입 자체가 깨진다.
    IF NEW.plan_id IS DISTINCT FROM 'free' THEN
      RAISE EXCEPTION '보안 경고 (Tampering Blocked): 일반 사용자는 유료 구독 행을 직접 생성할 수 없습니다.';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: 등급·상태에 더해 기간·빌링키까지 잠근다. current_period_end 만 미뤄도
  -- 영구 PRO 가 됐기 때문에 plan_id/status 만 보는 것으로는 부족했다.
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
     OR NEW.grace_period_until IS DISTINCT FROM OLD.grace_period_until
     OR NEW.billing_key IS DISTINCT FROM OLD.billing_key THEN
    RAISE EXCEPTION '보안 경고 (Tampering Blocked): 일반 사용자는 구독 등급·상태·이용 기간·결제수단을 직접 변경할 수 없습니다.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS check_subscription_tampering ON public.user_subscriptions;
CREATE TRIGGER check_subscription_tampering
  BEFORE INSERT OR UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_subscription_tampering();
