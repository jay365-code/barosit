-- 커뮤니티 댓글 1단계 답글(스레드) 지원 — comments 에 parent_comment_id 추가.
--
-- 답글은 항상 최상위 댓글에 매달린다(1단계 고정, 무한 트리 방지). 부모 댓글 삭제 시 답글도 함께 삭제.
-- 기존 댓글은 parent_comment_id = NULL(최상위)로 그대로 동작.

ALTER TABLE public.comments
    ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments(parent_comment_id);
