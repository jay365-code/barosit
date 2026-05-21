-- Database Migration: Allow users to update their own subscription billing_key securely
-- This permits the client-side card renewal flow to save the new authKey (billing_key)
-- while using a DB trigger to block unauthorized tampering of subscription tiers (plan_id, status).

-- 1. Enable UPDATE policy on user_subscriptions for the owner
CREATE POLICY "Users can update their own subscription billing key" ON public.user_subscriptions
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 2. Create trigger function to block plan_id or status tampering by non-admin users
CREATE OR REPLACE FUNCTION public.prevent_subscription_tampering()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the action is by a non-admin user
    IF NOT public.is_admin() THEN
        -- If plan_id or status is changed, block the transaction immediately
        IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION '보안 경고 (Tampering Blocked): 일반 사용자는 구독 등급(plan_id) 및 상태(status)를 직접 변경할 수 없습니다.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Bind trigger to user_subscriptions table
CREATE OR REPLACE TRIGGER check_subscription_tampering
    BEFORE UPDATE ON public.user_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.prevent_subscription_tampering();

COMMENT ON POLICY "Users can update their own subscription billing key" ON public.user_subscriptions IS '일반 사용자가 자신의 정기 결제 카드를 스스로 갱신(billing_key 업데이트)할 수 있도록 허용하는 보안 정책';
