-- 회원탈퇴 예약 파기 배치 스케줄 등록 (pg_cron)
--
-- 20260630000000 의 purge_deleted_accounts() 를 매일 1회 실행한다.
-- 이 함수는 순수 SQL 이라 service_role key / HTTP 가 필요 없다(시크릿 비노출).
-- charge-renewals 의 daily-billing-dunning-job(0 18 UTC)과 시간을 분리(18:30 UTC).
--
-- pg_cron 미설치 환경(로컬 dev `supabase db reset` 등)에서는 조용히 건너뛴다.
-- cron.schedule 은 동일 jobname 이면 upsert 이므로 재적용해도 안전(멱등).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $cron$
      select cron.schedule(
        'daily-account-purge-job',
        '30 18 * * *',  -- UTC 18:30 = KST 03:30
        $job$ select public.purge_deleted_accounts(); $job$
      )
    $cron$;
  END IF;
END $$;
