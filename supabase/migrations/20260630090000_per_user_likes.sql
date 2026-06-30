-- 유저별 좋아요(추천) — 로그인 유저는 DB 조인 테이블로 정확한 토글·다기기 동기화·1인1추천.
-- 게스트는 기존 localStorage + increment/decrement RPC 유지(하이브리드).
-- posts.likes / comments.likes 카운트 컬럼은 그대로 증감해 기존 수치를 보존한다(게스트·회원 추천 합산).

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- 본인이 어떤 글/댓글을 좋아요 했는지 조회용 인덱스(PK는 (post_id,user_id)라 user_id 단독 조회 보강).
create index if not exists idx_post_likes_user on public.post_likes(user_id);
create index if not exists idx_comment_likes_user on public.comment_likes(user_id);

alter table public.post_likes enable row level security;
alter table public.comment_likes enable row level security;

-- 조회는 본인 행만(어떤 걸 좋아요 했는지 본인만 알면 됨). 쓰기는 아래 SECURITY DEFINER RPC로만.
drop policy if exists "own post_likes select" on public.post_likes;
drop policy if exists "own comment_likes select" on public.comment_likes;
create policy "own post_likes select" on public.post_likes for select to authenticated using (user_id = auth.uid());
create policy "own comment_likes select" on public.comment_likes for select to authenticated using (user_id = auth.uid());

-- 토글: 본인 행 있으면 삭제(-1), 없으면 추가(+1). 카운트 컬럼 동기 증감. 인증 필수.
create or replace function public.toggle_post_like(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cnt int;
  v_likes int;
  v_liked boolean;
begin
  if uid is null then
    raise exception 'auth required';
  end if;
  delete from public.post_likes where post_id = p_id and user_id = uid;
  get diagnostics cnt = row_count;
  if cnt > 0 then
    update public.posts set likes = greatest(likes - 1, 0) where id = p_id returning likes into v_likes;
    v_liked := false;
  else
    insert into public.post_likes (post_id, user_id) values (p_id, uid) on conflict do nothing;
    update public.posts set likes = likes + 1 where id = p_id returning likes into v_likes;
    v_liked := true;
  end if;
  return json_build_object('likes', coalesce(v_likes, 0), 'liked', v_liked);
end;
$$;

create or replace function public.toggle_comment_like(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cnt int;
  v_likes int;
  v_liked boolean;
begin
  if uid is null then
    raise exception 'auth required';
  end if;
  delete from public.comment_likes where comment_id = p_id and user_id = uid;
  get diagnostics cnt = row_count;
  if cnt > 0 then
    update public.comments set likes = greatest(likes - 1, 0) where id = p_id returning likes into v_likes;
    v_liked := false;
  else
    insert into public.comment_likes (comment_id, user_id) values (p_id, uid) on conflict do nothing;
    update public.comments set likes = likes + 1 where id = p_id returning likes into v_likes;
    v_liked := true;
  end if;
  return json_build_object('likes', coalesce(v_likes, 0), 'liked', v_liked);
end;
$$;

grant execute on function public.toggle_post_like(uuid) to authenticated;
grant execute on function public.toggle_comment_like(uuid) to authenticated;
