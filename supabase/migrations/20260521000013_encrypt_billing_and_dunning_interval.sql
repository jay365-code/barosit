-- Database Migration: billing_key 암호화 대비 컬럼 확장 + 더닝 재시도 간격 컬럼
--
-- (1) billing_key/customer_key 를 AES-GCM 암호문("enc:v1:...")으로 저장하면 평문보다
--     길어질 수 있어 VARCHAR(255) 가 부족할 수 있다 → TEXT 로 확장(§ billing_key 암호화).
-- (2) 더닝(정기결제 실패 재시도)을 "매일 무제한"에서 "일정 간격·횟수 제한"으로
--     제어하기 위한 마지막 재시도 시각 컬럼 추가(§11 M3).

ALTER TABLE public.user_subscriptions
  ALTER COLUMN billing_key  TYPE TEXT,
  ALTER COLUMN customer_key TYPE TEXT;

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS last_dunning_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.user_subscriptions.last_dunning_at IS '마지막 더닝(정기결제 재시도) 시각 — 재시도 최소 간격 제어용 (§11 M3)';
