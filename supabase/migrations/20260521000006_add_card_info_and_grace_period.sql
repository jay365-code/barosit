-- Database Migration: Add card_info and grace_period_until to user_subscriptions table
-- This allows storing masking card details and managing grace periods for billing failures.

ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS card_info JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS grace_period_until TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.user_subscriptions.card_info IS '카드 종류, 매입사 코드, 마스킹 카드 번호 등 결제 카드 정보 요약';
COMMENT ON COLUMN public.user_subscriptions.grace_period_until IS '결제 실패 시 서비스 혜택을 즉각 박탈하지 않고 갱신을 유도하는 납부 유예 만료 시각';
