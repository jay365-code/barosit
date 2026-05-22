-- Database Migration: Create billing_history table, add default UUID generation, RLS policies and Admin policies
-- This ensures front-end clients can safely insert and fetch billing history records securely.

-- 0. billing_history 테이블 생성
CREATE TABLE IF NOT EXISTS public.billing_history (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    kind VARCHAR(50) NOT NULL, -- 'payment', 'refund', 'card_updated'
    order_id VARCHAR(100),
    payment_key VARCHAR(255),
    amount NUMERIC NOT NULL DEFAULT 0,
    plan VARCHAR(50),
    billing_cycle VARCHAR(30), -- 'monthly', 'yearly'
    status VARCHAR(30) NOT NULL DEFAULT 'completed', -- 'completed', 'refunded'
    cash_receipt_issued BOOLEAN DEFAULT false,
    refunded_amount NUMERIC DEFAULT NULL,
    refunded_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1. billing_history 기본키(id)에 UUID 자동 생성 설정 부여
ALTER TABLE public.billing_history ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. billing_history RLS 활성화
ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;

-- 3. RLS 정책 추가 (본인 소유 결제 내역 조회/기록 허용)
-- 3.1. SELECT 정책
CREATE POLICY "Users can select their own billing history" ON public.billing_history
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3.2. INSERT 정책
CREATE POLICY "Users can insert their own billing history" ON public.billing_history
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 3.3. UPDATE 정책
CREATE POLICY "Users can update their own billing history" ON public.billing_history
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 3.4. 어드민 전체 권한 정책
CREATE POLICY "Admins can do everything on billing_history" ON public.billing_history
    FOR ALL USING (public.is_admin());
