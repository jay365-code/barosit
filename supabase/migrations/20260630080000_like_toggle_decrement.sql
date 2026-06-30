-- 좋아요 토글 — 잘못 눌렀을 때 취소(unlike) 가능하도록 decrement RPC 추가.
-- increment_post_likes / increment_comment_likes 의 역연산.
-- GREATEST(...,0) 가드로 likes 가 음수로 내려가지 않게 한다(동시성·캐시 클리어 안전).

create or replace function public.decrement_post_likes(p_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.posts set likes = greatest(likes - 1, 0) where id = p_id returning likes;
$$;

create or replace function public.decrement_comment_likes(p_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.comments set likes = greatest(likes - 1, 0) where id = p_id returning likes;
$$;

grant execute on function public.decrement_post_likes(uuid) to anon, authenticated;
grant execute on function public.decrement_comment_likes(uuid) to anon, authenticated;
