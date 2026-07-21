-- 정기청구 크론 재스케줄 — 시크릿이 잘못돼도 조용히 실패하지 않도록 한다.
--
-- 배경: 첫 실행(2026-07-20 18:00 UTC)이 401 UNAUTHORIZED_INVALID_JWT_FORMAT 으로
-- 실패했다. Vault 에 service_role JWT 대신 자리표시자 문자열이 저장돼 있었는데,
-- 실패 흔적이 net._http_response 에만 남아 아무 데도 드러나지 않았다. 다음 날
-- 구독 행이 그대로인 것을 보고서야 발견했다.
--
-- 개선:
--   1) 시크릿을 btrim 으로 감싸 개행/공백 유입을 방어한다.
--   2) JWT 형식(eyJ 로 시작)이 아니면 HTTP 호출을 아예 하지 않고
--      admin_notifications 에 critical 로 남긴다. 관리자 콘솔에서 바로 보인다.
--
-- unschedule + schedule 이라 재실행에 멱등하다.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE '[billing-cron] pg_cron/pg_net 이 없어 스케줄을 갱신하지 않았습니다.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('daily-billing-dunning-job')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-billing-dunning-job');

  EXECUTE $cron$
    select cron.schedule(
      'daily-billing-dunning-job',
      '0 18 * * *',  -- UTC 18:00 = KST 03:00
      $job$
        do $inner$
        declare
          k text;
        begin
          select btrim(decrypted_secret) into k
          from vault.decrypted_secrets
          where name = 'service_role_key' limit 1;

          if k is null or k !~ '^eyJ' then
            insert into public.admin_notifications (event_type, severity, message, payload)
            values (
              'billing_cron_secret_invalid', 'critical',
              '정기청구 크론이 호출되지 못했습니다 — vault 시크릿 service_role_key 가 없거나 JWT 형식이 아닙니다.',
              jsonb_build_object('has_secret', k is not null)
            );
            return;
          end if;

          perform net.http_post(
            url     := 'https://kllcnllkcewnutxodwhx.supabase.co/functions/v1/charge-renewals',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || k
            ),
            body    := '{}'::jsonb,
            timeout_milliseconds := 55000
          );
        end
        $inner$;
      $job$
    )
  $cron$;

  RAISE NOTICE '[billing-cron] 스케줄 갱신 완료 (매일 KST 03:00, 시크릿 검증 포함).';
END
$$;
