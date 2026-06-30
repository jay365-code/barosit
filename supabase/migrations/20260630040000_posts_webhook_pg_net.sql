-- posts INSERT → cm-agent-draft 엣지 함수 호출 웹훅 (pg_net 직접 구성).
--
-- 대시보드 Database Webhooks 는 supabase_functions 스키마가 미생성이라 실패한다(이 프로젝트는
-- 웹훅 인프라가 활성화된 적 없음). supabase_functions 플러밍에 의존하지 않고 pg_net 으로 직접
-- HTTP 호출하는 트리거를 만든다. 페이로드는 함수가 기대하는 {type, table, record} 형태.
--
-- Authorization 헤더는 **공개 anon 키**(클라이언트 번들/ dist-web 에 이미 포함된 공개값)로,
-- 함수의 verify_jwt 게이트 통과용일 뿐이다. 함수는 내부적으로 SUPABASE_SERVICE_ROLE_KEY 로 DB 에 기록한다.
-- net.http_post 는 비동기(큐) 호출이라 INSERT 를 지연시키지 않는다.
--
-- 주의: 공지 차단 트리거(enforce_notice_admin_only)는 BEFORE INSERT 라, 차단된(거부된) INSERT 는
-- 이 AFTER 트리거가 아예 안 탄다 → 차단 글엔 웹훅이 안 나간다(정상).

create extension if not exists pg_net;

create or replace function public.cm_agent_draft_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://kllcnllkcewnutxodwhx.supabase.co/functions/v1/cm-agent-draft',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbGNubGxrY2V3bnV0eG9kd2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTY4MjksImV4cCI6MjA5NDgzMjgyOX0.nzl2oKDUpuAn0cDvG9oIpHNRVAuasYJixW4rapQVTOY'
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'posts',
      'record', to_jsonb(NEW)
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_cm_agent_draft_on_post on public.posts;
create trigger trg_cm_agent_draft_on_post
  after insert on public.posts
  for each row execute function public.cm_agent_draft_webhook();
