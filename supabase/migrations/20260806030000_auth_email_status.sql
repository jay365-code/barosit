-- 비밀번호 찾기에서 "가입되지 않은 이메일"·"소셜 로그인 계정"을 정확히 안내하기 위한 조회.
-- 사용자 결정(2026-08-06): 안 오는 메일을 기다리게 하는 것보다 사실대로 알려준다.
--
-- ⚠️ 가입 여부를 노출하는 조회다(account enumeration). 그래서
--   ① 이 함수는 service_role 로만 호출한다(Edge Function auth-email-status 경유)
--   ② anon/authenticated 에게 EXECUTE 를 주지 않는다
--   ③ Edge Function 이 IP 당 시간당 20회로 제한한다
create or replace function public.auth_email_status(p_email text)
returns table (found boolean, providers text[])
language sql
security definer
set search_path = public, auth
as $$
  select
    true as found,
    coalesce(array_agg(i.provider order by i.provider), '{}') as providers
  from auth.users u
  left join auth.identities i on i.user_id = u.id
  where lower(u.email) = lower(p_email)
  group by u.id;
$$;

revoke all on function public.auth_email_status(text) from public, anon, authenticated;

comment on function public.auth_email_status(text) is
  '비밀번호 찾기 안내용. 가입 여부와 로그인 수단(providers)만 반환. service_role 전용 — Edge Function auth-email-status 가 레이트리밋을 걸고 호출한다.';

-- 레이트리밋 기록. Edge Function 이 service_role 로만 읽고 쓴다.
create table if not exists public.email_lookup_attempts (
  id bigserial primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists email_lookup_attempts_ip_time_idx
  on public.email_lookup_attempts (ip, created_at desc);

alter table public.email_lookup_attempts enable row level security;
-- 정책을 두지 않는다 = service_role 외에는 접근 불가.

comment on table public.email_lookup_attempts is
  'auth-email-status 레이트리밋용 호출 기록(IP·시각). 1시간 지난 행은 함수가 호출 때마다 정리한다.';
