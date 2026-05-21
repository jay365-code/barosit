-- Database Migration: Add default UUID generation and RLS policies for billing_history
-- This ensures front-end clients can safely insert and fetch billing history records securely.

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
