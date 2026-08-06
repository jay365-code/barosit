-- 어드민 자동 승격 화이트리스트를 테이블로 분리.
--
-- 이전에는 handle_new_user() 안에 두 이메일이 하드코딩돼 있었다:
--   IF new.email = 'jhlee@gubed.co.kr' OR new.email = 'leejonghyun88@gmail.com'
-- 문제 ① 추가·제거에 마이그레이션+배포가 필요 ② 레포 코드만 봐서는 안 보임
-- ③ 감사 기록 없음. 테이블로 옮겨 셋 다 해소한다.
--
-- 동작 자체는 그대로다 — 목록에 있는 주소로 가입하면 가입 즉시 어드민.
create table if not exists public.admin_emails (
  email       text primary key,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);

comment on table public.admin_emails is
  '가입 시 자동으로 어드민 권한을 받을 이메일 목록. handle_new_user() 가 조회한다. 소문자로 저장.';

alter table public.admin_emails enable row level security;

-- 어드민만 읽고 쓴다(is_admin() 은 profiles.is_admin 기준).
drop policy if exists "Admins manage admin_emails" on public.admin_emails;
create policy "Admins manage admin_emails" on public.admin_emails
  for all using (public.is_admin()) with check (public.is_admin());

-- 기존 하드코딩 값 이관 — 동작을 바꾸지 않기 위해 그대로 옮긴다.
insert into public.admin_emails (email, note)
values
  ('jhlee@gubed.co.kr',      '운영자(하드코딩에서 이관, 2026-08-06)'),
  ('leejonghyun88@gmail.com','운영자(하드코딩에서 이관, 2026-08-06)')
on conflict (email) do nothing;

-- 트리거 재정의: 하드코딩 대신 화이트리스트 조회.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
    is_admin_user boolean := false;
begin
    -- 화이트리스트(public.admin_emails)에 있으면 가입 즉시 어드민.
    select exists (
      select 1 from public.admin_emails a
      where a.email = lower(new.email)
    ) into is_admin_user;

    -- 프로필 자동 레코드 생성
    insert into public.profiles (id, name, avatar, work_env, is_admin)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '사용자'),
        coalesce(new.raw_user_meta_data->>'avatar_url', '😊'),
        'mixed',
        is_admin_user
    );

    -- 기본 설정 자동 생성
    insert into public.user_settings (user_id)
    values (new.id);

    -- 최초 가입 시 기본 FREE(무료) 요금제 활성화
    insert into public.user_subscriptions (user_id, plan_id, status)
    values (new.id, 'free', 'active');

    return new;
end;
$function$;
