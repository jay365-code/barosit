-- 로컬 전용 시드 — `supabase db reset` / 최초 `supabase start` 시에만 실행된다.
-- 프로덕션 `supabase db push` 에는 적용되지 않으므로, 여기 내용은 로컬 개발 환경에만 영향.
--
-- 목적: 로컬에서 AI 초안 파이프라인을 테스트하기 위해, posts 웹훅이 *로컬* 엣지 함수를 호출하도록 덮어쓴다.
-- (커밋된 마이그레이션 20260630040000 은 프로덕션 함수 URL 을 유지. 여기서 로컬 URL 로 CREATE OR REPLACE.)
--
-- 사전 준비:
--   1) supabase/functions/.env 에  ANTHROPIC_API_KEY=sk-ant-...  추가
--   2) 로컬 함수 서빙:  supabase functions serve cm-agent-draft --no-verify-jwt --env-file supabase/functions/.env
--   3) (이 시드를 반영하려면) supabase db reset   ← 로컬 데이터 초기화됨
--      또는 이 함수 정의를 로컬 Studio SQL 에디터(http://localhost:54334)에 한 번 붙여 실행.

create or replace function public.cm_agent_draft_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 로컬: db 컨테이너 → 호스트의 API 게이트웨이(kong, 이 프로젝트는 54331). --no-verify-jwt 로 띄워 Authorization 불필요.
  perform net.http_post(
    url := 'http://host.docker.internal:54331/functions/v1/cm-agent-draft',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('type', 'INSERT', 'table', 'posts', 'record', to_jsonb(NEW))
  );
  return NEW;
end;
$$;
