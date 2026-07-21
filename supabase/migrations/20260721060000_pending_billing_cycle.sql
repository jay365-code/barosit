-- 결제 주기 전환 예약 (월간 → 연간)
--
-- 정책: 주기 전환은 "다음 결제일부터" 적용한다. 즉시 전환은 잔여 기간에 대한
-- 비례정산·부분환불이 필요한데, 토스 빌링키는 이를 대신해 주지 않아 직접 구현해야
-- 하고 국내 환불 규정과도 얽힌다. 지연 적용은 정산도 환불도 발생하지 않는다.
--
-- billing_cycle 을 직접 바꾸지 않는 이유: 실제 청구는 아직 월간인데 화면만 연간으로
-- 보여 혼란스럽다. "현재 주기"와 "예약된 주기"는 분리해야 한다.
--
-- 연간 → 월간 전환은 지원하지 않는다. 해지 후 재가입이 같은 결과를 내고(이용
-- 기간 만료까지 연간 혜택 유지), 할인 요금제에서 더 비싼 요금제로 돌아가려는
-- 수요가 드물어 유지 비용 대비 이득이 없다고 판단했다.

alter table public.user_subscriptions
  add column if not exists pending_billing_cycle varchar(16);

comment on column public.user_subscriptions.pending_billing_cycle is
  '다음 갱신부터 적용할 결제 주기 예약. charge-renewals 가 청구 시 소비하고 NULL 로 되돌린다. NULL 이면 예약 없음.';

-- 값 방어 — 임의 문자열이 들어오면 charge-renewals 의 주기 판정이 흔들린다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_subscriptions'::regclass
      and conname = 'user_subscriptions_pending_billing_cycle_check'
  ) then
    alter table public.user_subscriptions
      add constraint user_subscriptions_pending_billing_cycle_check
      check (pending_billing_cycle is null or pending_billing_cycle in ('monthly', 'yearly'));
  end if;
end $$;
