#!/usr/bin/env bash
# BaroSit 결제 백엔드 배포 (토스 승인 불필요 — 테스트 키로 전체 동작 검증 가능)
#
# 사전: supabase CLI 로그인 + 프로젝트 링크
#   supabase login
#   supabase link --project-ref <your-project-ref>
#
# 토스 키:
#   - 테스트(승인 전): Toss 개발자센터에서 받은 test_sk_... (실 결제 안 됨)
#   - 라이브(승인 후): live_sk_...
# 사용:
#   TOSS_SECRET_KEY=test_sk_xxxx ./supabase/deploy-payments.sh
set -euo pipefail

if [[ -z "${TOSS_SECRET_KEY:-}" ]]; then
  echo "❌ TOSS_SECRET_KEY 환경변수를 설정하세요 (test_sk_... 또는 live_sk_...)."
  echo "   예: TOSS_SECRET_KEY=test_sk_xxxx ./supabase/deploy-payments.sh"
  exit 1
fi

echo "▶ 시크릿 등록 (SUPABASE_URL / SERVICE_ROLE_KEY 는 런타임 자동 주입)"
supabase secrets set "TOSS_SECRET_KEY=${TOSS_SECRET_KEY}"

echo "▶ Edge Functions 배포"
supabase functions deploy billing-issue
supabase functions deploy payment-cancel
supabase functions deploy subscription-manage
supabase functions deploy toss-webhook --no-verify-jwt   # Toss 가 직접 호출
supabase functions deploy charge-renewals

echo "✅ 배포 완료."
echo
echo "남은 수동 단계:"
echo "  1) 대시보드 Database→Extensions 에서 pg_cron / pg_net 활성화 후,"
echo "     migrations/20260521000010_payment_backend.sql 하단 cron.schedule 블록을"
echo "     project-ref / service_role key 로 치환해 SQL Editor 에서 1회 실행."
echo "  2) Toss 개발자센터 웹훅 URL 등록:"
echo "     https://<project-ref>.supabase.co/functions/v1/toss-webhook"
echo "  3) 테스트 카드로 결제→환불→정기청구 E2E QA (라이브 키는 토스 승인 후)."
