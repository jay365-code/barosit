-- AI 에이전트(Claude API) 요금 폭탄 방어 — 호출 사용 로그 + 서킷브레이커의 데이터 기반.
--
-- 위협 모델: 누군가 게시판에 글을 대량으로 올리면(스팸/해킹/봇) posts INSERT 웹훅이
-- cm-agent-draft 를 그 수만큼 호출하고, 함수가 글마다 Anthropic API 를 호출해
-- 요금이 폭증할 수 있다. 에이전트가 늘어나면(이든 등) 공격면도 같이 늘어난다.
--
-- 방어 계층 (판정은 엣지 함수 _shared/agentGuard.ts 가 이 테이블을 읽어 수행):
--   1. 전역 일일 상한  — 24시간 내 호출 수가 상한 초과 시 API 호출 중단(서킷 오픈)
--   2. 시간당 버스트 상한 — 1시간 내 급증 감지 시 중단
--   3. 작성자별 상한   — 같은 작성자가 10분에 N건 초과 시 그 작성자 글은 스킵
--   4. 동일 콘텐츠 중복 — 같은 내용 해시가 24시간 내 있으면 API 호출 없이 스킵
-- 상한 도달 시 admin_notifications 로 1회 알림(중복 알림 방지 포함).

CREATE TABLE IF NOT EXISTS public.agent_api_usage (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    called_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    fn           TEXT NOT NULL,          -- 호출한 엣지 함수 이름 (cm-agent-draft 등)
    source_id    UUID,                   -- 유발한 글/댓글 id
    author_key   TEXT,                   -- 작성자 식별키(user_id 또는 author_name) — 작성자별 상한용
    content_hash TEXT,                   -- 제목+본문 SHA-256 — 중복 콘텐츠 차단용
    blocked      BOOLEAN NOT NULL DEFAULT false,  -- true = 가드에 걸려 API 호출을 안 한 기록
    block_reason TEXT                    -- daily_cap | hourly_cap | author_cap | duplicate
);

-- 가드 판정 쿼리(시간 창 카운트)용 인덱스
CREATE INDEX IF NOT EXISTS idx_agent_usage_called_at ON public.agent_api_usage(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_usage_hash      ON public.agent_api_usage(content_hash, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_usage_author    ON public.agent_api_usage(author_key, called_at DESC);

-- 서비스 롤(엣지 함수)만 쓰는 내부 테이블. 관리자는 대시보드에서 조회 가능.
ALTER TABLE public.agent_api_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read agent_api_usage" ON public.agent_api_usage;
CREATE POLICY "Admins read agent_api_usage" ON public.agent_api_usage
    FOR SELECT USING (public.is_admin());

COMMENT ON TABLE public.agent_api_usage IS
  'AI 에이전트의 Anthropic API 호출/차단 로그 — 요금 폭탄 방어(서킷브레이커) 판정 근거';

-- 오래된 로그 정리 (pg_cron 이 있으면 등록, 없으면 무시 — 판정은 최근 24시간만 보므로 쌓여도 동작엔 지장 없음)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-agent-api-usage',
      '17 3 * * *',  -- 매일 03:17 UTC
      $cron$DELETE FROM public.agent_api_usage WHERE called_at < now() - interval '30 days'$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;
