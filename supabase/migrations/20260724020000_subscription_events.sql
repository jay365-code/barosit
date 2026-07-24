-- 구독 라이프사이클 이벤트 로그.
--
-- billing_history 는 "돈"의 원장(결제·환불)이고, 이 테이블은 구독 "상태 변화"의
-- 시계열 감사 로그다: 해지 예약/철회, 주기 변경 예약/철회, 실제 주기 전환, 카드
-- 삭제, 강등 등. 지금까지 이런 변경은 user_subscriptions row 만 덮어써서 흔적이
-- 남지 않았다 — "언제 무엇을 바꿨는지" 사용자도 운영자도 조회할 방법이 없었다.
--
-- visibility : 'user'  = 사용자 프로필 타임라인에 노출
--              'admin' = 내부 전용(운영 감사) — 사용자에겐 숨김
-- actor      : 이벤트를 유발한 주체 — user | system(정기 배치) | admin
-- detail     : 이벤트별 부가정보 (from/to 주기, 적용 예정일, 금액, 사유 등)
--
-- 쓰기는 전부 service_role Edge Function 경유다(RLS 우회). 사용자에게는 INSERT/
-- UPDATE/DELETE 권한을 주지 않는다 — 감사 로그는 위조·삭제되면 안 된다.

create table if not exists public.subscription_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  visibility text not null default 'user'  check (visibility in ('user', 'admin')),
  actor      text not null default 'user'  check (actor in ('user', 'system', 'admin')),
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.subscription_events is
  '구독 라이프사이클 이벤트 감사 로그 (billing_history=결제 원장과 분리). 쓰기는 service_role Edge Function 만.';

create index if not exists idx_subscription_events_user_created
  on public.subscription_events (user_id, created_at desc);

alter table public.subscription_events enable row level security;

-- 사용자: 본인의 'user' 가시성 이벤트만 조회. INSERT/UPDATE/DELETE 정책이 없으므로
-- 일반 사용자는 쓸 수 없고, service_role Edge Function 만 기록한다(RLS 우회).
drop policy if exists "own visible subscription events" on public.subscription_events;
create policy "own visible subscription events" on public.subscription_events
  for select to authenticated
  using (auth.uid() = user_id and visibility = 'user');

-- 관리자: 내부(admin) 이벤트를 포함한 전체 이력 조회.
drop policy if exists "admin reads all subscription events" on public.subscription_events;
create policy "admin reads all subscription events" on public.subscription_events
  for select to authenticated
  using (public.is_admin());
