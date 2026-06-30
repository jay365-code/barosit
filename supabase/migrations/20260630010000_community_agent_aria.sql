-- BaroSit 커뮤니티 운영자 AI 에이전트 "Aria" — Phase 1 (초안→승인)
-- 1) posts/comments 에 운영자(Aria) 식별용 is_agent 플래그 추가
-- 2) AI 답변 초안 검수 테이블(ai_response_drafts) 생성
-- 모든 DDL 은 드리프트된 원격 스키마에서도 안전하도록 IF NOT EXISTS 로 작성.

-- ---------------------------------------------------------------------------
-- 1. 운영자(Aria) 식별 플래그
-- Aria 는 별도 auth.users 계정을 만들지 않는다. Edge Function(service role)이
-- author_name='Aria', is_agent=true, user_id=NULL 로 답변을 게시하고,
-- 클라이언트는 is_agent 로 아바타/운영자 뱃지를 렌더한다.
-- ---------------------------------------------------------------------------
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_agent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.posts    ADD COLUMN IF NOT EXISTS is_agent BOOLEAN NOT NULL DEFAULT false;

-- Aria 는 상황에 따라 역할(모자)을 바꿔 쓴다: 'coach'(자세 코치, 기술/자세/제품) 또는
-- 'manager'(커뮤니티 매니저, 환영/공지/소통). 클라이언트는 이 값으로 역할 뱃지를 렌더한다.
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS agent_role TEXT;
ALTER TABLE public.posts    ADD COLUMN IF NOT EXISTS agent_role TEXT;

-- author_name 은 라이브 DB 에 이미 존재(클라이언트가 사용 중)하지만, 마이그레이션
-- 정합성을 위해 없을 때만 추가한다(드리프트 보정). 게스트 닉네임/Aria 표시명 저장.
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS author_name TEXT;

-- ---------------------------------------------------------------------------
-- 2. AI 답변 초안 검수 테이블
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_response_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 초안을 유발한 원본
    source_type TEXT NOT NULL CHECK (source_type IN ('post', 'comment', 'feedback')),
    source_id   UUID,                                   -- 유발 글/댓글/피드백 id
    post_id     UUID REFERENCES public.posts(id) ON DELETE CASCADE,  -- 답변이 달릴 글

    -- 분류/판단 결과
    intent          TEXT,                               -- question | feature_request | bug | complaint | chat | challenge ...
    agent_role      TEXT,                               -- 'coach' | 'manager' (Aria 가 쓸 모자)
    category        TEXT,                               -- 사용자가 고른 글 카테고리(정규값)
    should_respond  BOOLEAN NOT NULL DEFAULT true,      -- 운영자가 개입할 가치가 있는가
    reason          TEXT,                               -- 왜 답하려는지/왜 안 답하려는지(검수자용)
    language        TEXT NOT NULL DEFAULT 'ko',         -- ko | en | ja
    confidence      NUMERIC(3,2),                       -- 0.00 ~ 1.00
    risk_flags      TEXT[] NOT NULL DEFAULT '{}',       -- {refund,payment,privacy,legal,medical,unknown}
    citations       JSONB  NOT NULL DEFAULT '[]'::jsonb,-- [{title, url}] 근거 출처

    -- 본문
    draft_body   TEXT NOT NULL DEFAULT '',              -- AI 생성 초안
    edited_body  TEXT,                                  -- 검수자가 수정한 최종본

    -- 검수 상태
    status   TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'approved', 'rejected', 'escalated')),
    reviewed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at  TIMESTAMPTZ,
    published_comment_id UUID REFERENCES public.comments(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ai_drafts_status     ON public.ai_response_drafts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_post       ON public.ai_response_drafts(post_id);
-- 같은 원본에 중복 초안 방지(웹훅 재전송 대비)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_drafts_source ON public.ai_response_drafts(source_type, source_id);

-- ---------------------------------------------------------------------------
-- 3. RLS — 검수 테이블은 관리자 전용. (Edge Function 은 service_role 로 RLS 우회)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_response_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage ai_response_drafts" ON public.ai_response_drafts;
CREATE POLICY "Admins manage ai_response_drafts" ON public.ai_response_drafts
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
