# BaroSit Edge Functions (결제 백엔드)

P0-1 결제 백엔드. 클라이언트는 절대 Toss Secret Key 를 다루지 않으며, 구독 등급(plan_id/status)
변경은 결제 검증을 통과한 **service_role Edge Function** 만 가능하다
(`prevent_subscription_tampering` 트리거가 일반 사용자/익명을 차단).

## 함수 목록

| 함수 | 인증 | 역할 |
|---|---|---|
| `billing-issue` | user JWT | authKey+customerKey → 빌링키 발급 → 첫 청구 → PRO 활성화. `mode:"update_card"` 면 청구 없이 카드만 교체 |
| `payment-cancel` | user JWT | 청약철회(7일+미사용) 재검증 → 실제 Toss 취소 → FREE 강등 + 원장 환불 |
| `subscription-manage` | user JWT | `action:"cancel"` 해지 예약 / `"resume"` 철회 (status 변경) |
| `toss-webhook` | **없음** (`verify_jwt=false`) | Toss 직접 호출. S2S 교차검증 후 원장 멱등 동기화 |
| `charge-renewals` | service_role | pg_cron 일배치 — 만기 정기청구 + 더닝(7일 유예→FREE) |

## 로컬 검증 (배포 전, 토스 승인 불필요)

```bash
cd supabase/functions && deno task check   # 5종 타입체크 (2026-06-04 통과 ✅)
```

## 배포 (원커맨드)

```bash
supabase login && supabase link --project-ref <ref>      # 최초 1회
TOSS_SECRET_KEY=test_sk_xxx ./supabase/deploy-payments.sh  # 테스트키로 전체 동작 검증 가능
```

스크립트가 시크릿 등록 + 5종 배포(`toss-webhook` 은 `--no-verify-jwt`)를 수행한다.
수동 동등 명령:

```bash
supabase secrets set TOSS_SECRET_KEY=live_sk_xxx     # 심사 전엔 test_sk_xxx
supabase functions deploy billing-issue
supabase functions deploy payment-cancel
supabase functions deploy subscription-manage
supabase functions deploy toss-webhook --no-verify-jwt
supabase functions deploy charge-renewals
```

## 정기청구 스케줄 (pg_cron)

대시보드에서 `pg_cron` / `pg_net` 확장 활성화 후 SQL Editor 에서
`supabase/migrations/20260521000010_payment_backend.sql` 하단 주석의 `cron.schedule(...)`
블록을 프로젝트 ref / service_role key 로 치환해 1회 실행.

## 웹훅 등록

Toss 개발자센터 → 웹훅 URL:
`https://<project-ref>.supabase.co/functions/v1/toss-webhook`

## 프론트 연동 지점

- 결제 성공: `src/views/PricingView.tsx`, `src/web/Marketing.tsx` → `billing-issue`
- 카드 변경: `src/web/Marketing.tsx` (update_card)
- 해지/복구: `subscription-manage` (Marketing PlanTab, ProfileView)
- 환불: `payment-cancel` (Marketing PlanTab, ProfileView)
- 데스크톱 ProfileView 의 카드 등록/변경은 `platform.openBrowser` 로 웹 결제창을 연다 (자체 카드 입력폼 제거 — PCI).
