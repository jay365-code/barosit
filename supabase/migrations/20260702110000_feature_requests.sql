-- 기능 제안 루프(로드맵 #19 / CM-2) — PM 에이전트 "Ethan" 의 데이터 기반.
--
-- 흐름: 💡 기능 제안 글 → cm-agent-draft 가 기존 클러스터와 대조(중복 클러스터링)
--   → 기존 제안이면 링크(요청 수 +1), 새 제안이면 클러스터 생성
--   → Ethan 명의 회신 초안("N명이 요청 · 현재 상태") → 관리자 승인 후 게시
--   → 공개 로드맵(#/roadmap)은 이 테이블을 그대로 렌더.

CREATE TABLE IF NOT EXISTS public.feature_requests (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title              TEXT NOT NULL,                    -- 대표 제목(한국어 정규화)
    status             TEXT NOT NULL DEFAULT 'reviewing'
                       CHECK (status IN ('reviewing', 'planned', 'in_progress', 'done', 'declined')),
    request_count      INTEGER NOT NULL DEFAULT 0,       -- 연결된 제안 글 수(트리거 동기화)
    released_version   TEXT,                             -- status='done' 일 때 반영 버전 (예: v0.9.3)
    first_requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 제안 글 ↔ 클러스터 연결 (같은 글이 두 클러스터에 걸리지 않도록 post_id UNIQUE)
CREATE TABLE IF NOT EXISTS public.feature_request_posts (
    feature_request_id UUID NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
    post_id            UUID NOT NULL UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (feature_request_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON public.feature_requests(status, updated_at DESC);

-- request_count 를 링크 수와 동기화 (글 삭제 CASCADE 도 반영)
CREATE OR REPLACE FUNCTION public.sync_feature_request_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fr_id UUID := COALESCE(NEW.feature_request_id, OLD.feature_request_id);
BEGIN
  UPDATE public.feature_requests
     SET request_count = (SELECT count(*) FROM public.feature_request_posts WHERE feature_request_id = fr_id),
         updated_at = timezone('utc'::text, now())
   WHERE id = fr_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_feature_request_count ON public.feature_request_posts;
CREATE TRIGGER trg_sync_feature_request_count
  AFTER INSERT OR DELETE ON public.feature_request_posts
  FOR EACH ROW EXECUTE FUNCTION public.sync_feature_request_count();

-- RLS: 로드맵은 공개 읽기, 쓰기는 관리자(상태 변경)와 service role(엣지 함수)만.
ALTER TABLE public.feature_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_request_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read feature_requests" ON public.feature_requests;
CREATE POLICY "Public read feature_requests" ON public.feature_requests
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage feature_requests" ON public.feature_requests;
CREATE POLICY "Admins manage feature_requests" ON public.feature_requests
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public read feature_request_posts" ON public.feature_request_posts;
CREATE POLICY "Public read feature_request_posts" ON public.feature_request_posts
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage feature_request_posts" ON public.feature_request_posts;
CREATE POLICY "Admins manage feature_request_posts" ON public.feature_request_posts
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 초안 ↔ 클러스터 연결(검수 화면에서 어떤 제안에 대한 회신인지 표시)
ALTER TABLE public.ai_response_drafts
  ADD COLUMN IF NOT EXISTS feature_request_id UUID REFERENCES public.feature_requests(id) ON DELETE SET NULL;

COMMENT ON TABLE public.feature_requests IS
  '기능 제안 클러스터 — PM 에이전트 Ethan 이 중복 제안을 묶고, 공개 로드맵(#/roadmap)이 렌더';
