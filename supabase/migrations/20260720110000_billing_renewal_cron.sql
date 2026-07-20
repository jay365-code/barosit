-- 정기청구 배치(charge-renewals) 스케줄 등록.
--
-- 배경: 20260521000010_payment_backend.sql 의 cron.schedule 블록은 전부 주석이었고
-- "SQL Editor 에서 1회 실행" 을 전제로 했다. 그 실행이 누락되어 정기 갱신이 한 번도
-- 실행되지 않았다(프로덕션에서 만료 21일 경과 구독이 청구·더닝·강등 없이 방치됨).
-- 20260630000001_account_purge_cron.sql 이 이미 쓰고 있는 자동 등록 패턴을 따른다.
--
-- service_role 키는 마이그레이션에 하드코딩하지 않고 Vault 에서 읽는다.
-- 사전 준비(1회, SQL Editor):
--   select vault.create_secret('<service_role key>', 'service_role_key',
--                              'charge-renewals cron 호출용');
-- 키를 교체할 때는 vault.update_secret 만 하면 되고 이 스케줄은 건드리지 않아도 된다.
--
-- 프로젝트 ref 는 공개 값(클라이언트 번들에도 포함)이라 URL 은 그대로 둔다.

DO $$
DECLARE
  has_secret boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '[billing-cron] pg_cron 이 없어 스케줄을 등록하지 않았습니다.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE '[billing-cron] pg_net 이 없어 스케줄을 등록하지 않았습니다.';
    RETURN;
  END IF;

  -- 재실행 대비 기존 스케줄 제거(멱등).
  PERFORM cron.unschedule('daily-billing-dunning-job')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-billing-dunning-job');

  EXECUTE $cron$
    select cron.schedule(
      'daily-billing-dunning-job',
      '0 18 * * *',  -- UTC 18:00 = KST 03:00
      $job$
        select net.http_post(
          url     := 'https://kllcnllkcewnutxodwhx.supabase.co/functions/v1/charge-renewals',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
              select decrypted_secret from vault.decrypted_secrets
              where name = 'service_role_key' limit 1
            )
          ),
          body    := '{}'::jsonb,
          timeout_milliseconds := 55000
        );
      $job$
    )
  $cron$;

  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key'
  ) INTO has_secret;

  IF has_secret THEN
    RAISE NOTICE '[billing-cron] 스케줄 등록 완료 (매일 KST 03:00).';
  ELSE
    -- 키가 없어도 스케줄은 등록해 둔다. 키를 넣는 순간부터 정상 동작한다.
    RAISE WARNING '[billing-cron] 스케줄은 등록했으나 vault 시크릿 service_role_key 가 없습니다. '
                  '생성 전까지 charge-renewals 호출이 403 으로 거부됩니다.';
  END IF;
END
$$;
