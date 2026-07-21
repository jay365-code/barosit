-- refunded_amount 를 NULL 없는 컬럼으로 정규화 — 환불 CAS 가 항상 빗나가던 원인.
--
-- 배경: 20260721030000 계열의 P1 하드닝에서 payment-cancel 에 CAS 선점을 넣었다.
-- 동시 환불 요청 두 건이 같은 행을 읽고 둘 다 토스 취소를 호출하는 것을 막으려고
-- 읽은 시점의 status·refunded_amount 를 조건에 걸어 UPDATE 한다.
--
-- 그런데 신규 결제 행은 refunded_amount 가 NULL 이고, 코드는 이를 0 으로 읽어
-- (Number(x ?? 0)) 조건에 `refunded_amount = 0` 을 건다. SQL 에서 NULL = 0 은 참이
-- 아니므로 매칭 0행 → "환불이 이미 처리 중" 409. 즉 정상 환불이 100% 실패했다.
-- 심사용 테스트 결제(4,900원)의 청약철회가 실제로 이 이유로 막혔다.
--
-- 조치: 기본값 0 + 기존 NULL 백필. 앞으로 이 컬럼에 NULL 이 들어가지 않는다.
-- (payment-cancel 쪽에도 NULL 을 0 으로 취급하는 방어를 함께 넣었다.)

UPDATE public.billing_history
   SET refunded_amount = 0
 WHERE refunded_amount IS NULL;

ALTER TABLE public.billing_history
  ALTER COLUMN refunded_amount SET DEFAULT 0;

ALTER TABLE public.billing_history
  ALTER COLUMN refunded_amount SET NOT NULL;
