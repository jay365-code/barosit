-- COMM-02 fix: 조회수/좋아요 증가용 SECURITY DEFINER RPC
-- 문제: posts UPDATE RLS가 소유자 전용이라, 타인 글의 views/likes 증가가 무반영(silent fail)됨.
-- 해결: views/likes 컬럼만 1 증가시키는 SECURITY DEFINER 함수로 RLS 우회 (안전 범위 한정).

create or replace function public.increment_post_views(p_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.posts set views = views + 1 where id = p_id returning views;
$$;

create or replace function public.increment_post_likes(p_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.posts set likes = likes + 1 where id = p_id returning likes;
$$;

-- 게시판은 공개 열람(조회수)·로그인 상호작용(좋아요) 모두 허용
grant execute on function public.increment_post_views(uuid) to anon, authenticated;
grant execute on function public.increment_post_likes(uuid) to anon, authenticated;
