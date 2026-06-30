-- Database Migration: 회원탈퇴(셀프서비스 계정·데이터 삭제)
--
-- 설계 단일문서: docs/account-deletion-policy.html
-- 정책 확정(2026-06-30): 유예 30일 / 유예중 복구 허용 / 구독은 자동갱신만 해지(환불 없음) / export 제외
--
-- 흐름: ProfileView "회원탈퇴" → Edge Function delete-account(soft) 가
--       profiles.deletion_requested_at / deletion_scheduled_at(+30d) 기록 + 자동갱신 해지.
--       유예 경과분은 purge_deleted_accounts() (pg_cron 일배치) 가 실제 파기.
--
-- 데이터 분류(§3):
--   삭제  : auth.users + CASCADE(profiles, posture_events, daily_scores, user_settings,
--           user_subscriptions[빌링키 폐기], posts, comments)
--   보존  : billing_history (전자상거래법 5년) — 단, FK CASCADE 면 auth 유저 삭제 시 같이
--           지워져 위법. 아래에서 FK 를 ON DELETE SET NULL 로 바꿔 익명 보존한다.
--   익명화: usage_events.user_id / client_errors.last_user_id (FK 없음) → purge 시 NULL.

-- ── (1) 탈퇴 신청 상태 컬럼 (profiles) ─────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.profiles.deletion_requested_at IS '회원탈퇴 신청 시각 (NULL=정상). 유예 중 재로그인으로 취소 시 NULL 복귀.';
COMMENT ON COLUMN public.profiles.deletion_scheduled_at IS '영구 파기 예정 시각(신청 +30일). purge_deleted_accounts() 가 이 시각 경과분을 파기.';

-- 유예 경과분 빠른 조회 (purge 배치)
CREATE INDEX IF NOT EXISTS idx_profiles_deletion_scheduled
  ON public.profiles (deletion_scheduled_at)
  WHERE deletion_scheduled_at IS NOT NULL;

-- ── (2) billing_history 법정 보존: FK CASCADE → SET NULL + 익명 해시 ────────
-- 기존 제약: billing_history_user_id_fkey  ... REFERENCES auth.users(id) ON DELETE CASCADE
-- CASCADE 그대로면 auth 유저 파기 시 결제기록까지 삭제 → 전자상거래법 위반.
-- user_id 를 nullable 로 바꾸고 ON DELETE SET NULL 로 재정의해 "식별자 분리(익명화)된
-- 거래기록" 으로 5년 보존한다. 분쟁 대비용 비가역 가명키(anon_user_hash)도 남긴다.
ALTER TABLE public.billing_history
  ADD COLUMN IF NOT EXISTS anon_user_hash TEXT DEFAULT NULL;

COMMENT ON COLUMN public.billing_history.anon_user_hash IS '탈퇴 파기 시 user_id 의 비가역 가명키(md5). 개인정보 없이 동일인 거래 묶음 식별용(분쟁·정산).';

ALTER TABLE public.billing_history ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.billing_history DROP CONSTRAINT IF EXISTS billing_history_user_id_fkey;
ALTER TABLE public.billing_history
  ADD CONSTRAINT billing_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── (3) 예약 파기 함수 ─────────────────────────────────────────────────────
-- 유예(deletion_scheduled_at) 경과 계정을 파기한다.
--  1) billing_history 익명화(가명키 기록 후 FK SET NULL 로 user_id 분리)
--  2) FK 없는 흔적 테이블 익명화(usage_events / client_errors)
--  3) auth.users 삭제 → CASCADE 로 개인정보·자세데이터 전부 파기(빌링키 포함)
-- postgres(슈퍼유저)로 실행되어야 auth.users 삭제 가능 → SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.purge_deleted_accounts()
RETURNS INTEGER AS $$
DECLARE
  uid UUID;
  purged INTEGER := 0;
BEGIN
  FOR uid IN
    SELECT id FROM public.profiles
    WHERE deletion_scheduled_at IS NOT NULL
      AND deletion_scheduled_at <= now()
  LOOP
    -- (1) 결제기록 익명 보존: 가명키 부여 후 식별자 분리
    UPDATE public.billing_history
      SET anon_user_hash = COALESCE(anon_user_hash, md5(user_id::text)),
          user_id = NULL
      WHERE user_id = uid;

    -- (2) FK 없는 흔적 익명화
    UPDATE public.usage_events  SET user_id = NULL      WHERE user_id = uid;
    UPDATE public.client_errors SET last_user_id = NULL WHERE last_user_id = uid;

    -- (3) 인증 계정 파기 → public.* CASCADE (profiles/posture_events/daily_scores/
    --     user_settings/user_subscriptions/posts/comments)
    DELETE FROM auth.users WHERE id = uid;

    purged := purged + 1;
  END LOOP;

  RETURN purged;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE ALL ON FUNCTION public.purge_deleted_accounts() FROM PUBLIC, anon, authenticated;

-- ── (4) [운영 안내] 예약 파기 스케줄 (pg_cron) ─────────────────────────────
-- charge-renewals 와 동일하게 pg_cron 으로 일배치. 단 이 함수는 순수 SQL 이라
-- service_role key / HTTP 가 필요 없다(시크릿 비노출). 대시보드에서 pg_cron 확장
-- 활성화 후 아래를 SQL Editor 에서 1회 실행한다.
--
--   select cron.schedule(
--     'daily-account-purge-job',
--     '30 18 * * *',  -- UTC 18:30 = KST 03:30 (정기청구 03:00 와 분리)
--     $$ select public.purge_deleted_accounts(); $$
--   );
