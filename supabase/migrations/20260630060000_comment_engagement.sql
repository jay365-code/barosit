-- 댓글 추천(좋아요) — 유튜브식 댓글 액션바(추천 + 답글)용.
-- 글(posts)의 increment_post_likes 패턴을 그대로 본뜬다: likes 컬럼 + SECURITY DEFINER RPC.

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS likes INT NOT NULL DEFAULT 0;

create or replace function public.increment_comment_likes(p_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.comments set likes = likes + 1 where id = p_id returning likes;
$$;

grant execute on function public.increment_comment_likes(uuid) to anon, authenticated;
