-- Database Migration: Add billing_key column to user_subscriptions table
-- This allows storing the Toss Payments authKey (billing key) for recurring billing.

ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS billing_key VARCHAR(255) DEFAULT NULL;

COMMENT ON COLUMN public.user_subscriptions.billing_key IS '토스 정기 자동 결제 빌링키';
