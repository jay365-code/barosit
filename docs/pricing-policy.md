# BaroSit 구독 요금 및 환불 정책 (Pricing & Refund Policy)

본 문서는 BaroSit 서비스의 비즈니스 가격 책정 모델 및 요금제별 차등 제공 기능 목록과 국내 전자상거래법에 준거한 청약철회 및 환불 규정을 명확히 규정합니다.

---

## 1. 가격 정책 개요 (Pricing Policy Overview)

BaroSit은 사용자의 인지적 부하를 최소화하고 결제 전환율을 극대화하기 위하여, 기존의 복잡한 3단계(Premium 포함) 요금 설계 대신 직관적인 **2단계 이원화 요금제(Dual Plan)**를 채택합니다.

- **FREE (웹 브라우저 무료 체험)**: 평생 무료로 웹 브라우저에서 서비스의 핵심 감지 엔진을 직접 사용 및 체감할 수 있는 온보딩 모델입니다.
- **PRO (데스크톱 전용 앱 - 가치 극대화)**: 브라우저가 가진 백그라운드 스로틀링(Throttling) 제약을 완벽히 넘어서는 네이티브 데스크톱 앱(Tauri 기반 macOS / Windows 버전) 사용 권한 및 AI 코칭, 장기 정밀 대시보드를 제공하는 완전체 모델입니다.

---

## 2. 요금 스펙 및 결제 구조

| 요금 플랜 | 단가 (부가가치세 포함) | 결제 주기 및 청구 방식 | 비고 |
| :--- | :--- | :--- | :--- |
| **FREE** | **0원 (무료)** | 청구 없음 | 웹 브라우저 전용, 평생 무료 사용 |
| **PRO (월간 구독)** | **월 4,900원** | 매월 자동 정기 결제 | 언제든 구독 해지 가능 |
| **PRO (연간 구독)** | **연 36,000원** | 매년 1회 선불 결제 | **월 환산 시 3,000원** (정확히 **38.7%**의 파격적인 할인가 제공) |

> [!TIP]
> **"하루 단돈 100원, 한 달 커피 반 잔(3,000원) 가격"**이라는 강력한 마케팅 카피를 장착하여, 연간 결제로의 유도를 최적화합니다.

---

## 3. 플랜별 상세 기능 및 접근 제약 비교

웹 브라우저의 기본적 한계를 PRO 등급(데스크톱 네이티브 앱)의 차별적 셀링 포인트(USP)로 적극 부각하여 자연스러운 결제를 유도합니다.

### 3.1. FREE (웹 전용 기본형)
- **제공 기능**:
  - 4종 핵심 자세 감지 (거북목, 턱괴기, 좌우 척추 기울임, 둔부 비대칭)
  - 실시간 웹 화면 내 경고 메시지 렌더링
  - 실루엣 온디바이스 렌더링 (철저한 로컬 프라이버시 유지)
  - 4종 스트레칭 감지 및 자세 복구 보상 피드백
- **제약 사항**:
  - **백그라운드 차단**: 웹 브라우저 탭이 가려지거나 최소화되면 실시간 고성능 카메라 자세 분석 엔진 작동이 즉각 정지됩니다. (OS의 절전 스로틀링 제약)
  - **OS 알림 미지원**: 시스템 트레이나 화면 밖 네이티브 OS 푸시 알림을 수신할 수 없습니다. 반드시 웹 브라우저 화면을 상시 켜두어야 합니다.
  - **제한된 이력**: 최근 7일 내의 간이 대시보드 스코어만 로컬 스토리지에 유지됩니다.

### 3.2. PRO (데스크톱 설치형 앱 전용)
- **제공 기능**:
  - **완벽한 백그라운드 모니터링**: 앱 화면을 최소화하거나 가려도 카메라 센서가 백그라운드에서 리소스를 최소화하며 무자각으로 실시간 감지를 계속 이어갑니다.
  - **네이티브 OS 알림 및 시스템 트레이**: 브라우저를 방해하지 않고 화면 우하단 푸시 및 메뉴바/트레이 이모지 변화를 통해 바른 자세 상태를 관제합니다.
  - **Claude 4.5 AI 맞춤 코칭**: 누적 자세 이력 데이터를 분석하여 사용자 고유의 습관 패턴을 짚어내고 실천 가이드를 전송하는 지능형 피드백을 제공합니다.
  - **90일 자세 정밀 분석**: 일별/주별 캘린더 대시보드와 정밀한 시간대별 피크(Peak) 자세 붕괴 구간 통계 및 자세 개선율 추이를 제공합니다.
  - **다중 기기 실시간 동기화**: Supabase 클라우드 동기화를 통해 사무실 PC, 서브 노트북, 태블릿 간 설정을 실시간으로 연동합니다.

---

## 4. 청약철회 및 환불 규정 (Refund Policy)

국내 전자상거래 등에서의 소비자보호에 관한 법률 및 콘텐츠산업 진흥법을 엄격히 준수하여 정밀하고 신뢰할 수 있는 환불 조항을 제공합니다.

### 4.1. 청약철회 및 즉시 환불 (결제 완료 후 7일 이내 & 미사용 시)
- **조건**: 유료 PRO 구독 결제 완료일로부터 **7일(168시간) 이내**이고, 유료 서비스의 **이용 이력(데스크톱 앱 모니터링 가동 이력)**이 전혀 존재하지 않는 상태인 경우.
  - *미사용 판단*: 결제 시점 이후 데스크톱 앱을 통한 수집 모니터링 누적 시간이 0분인 경우 (자세 감지 이벤트 및 일별 점수 기록이 단 1회도 생성되지 않은 상태).
- **정책**: 상기 조건을 충족할 경우 **100% 무조건 전액 환불(결제 취소)**을 완벽히 보장합니다.
- **처리 방식**: 프로필 결제 탭에서 셀프로 `[즉시 환불 및 결제 취소]` 버튼을 클릭하여 즉각 모의 취소 처리를 완료할 수 있으며, 실제 Production 환경에서는 카드 결제가 자동 취소됩니다.

### 4.2. 중도 환불 및 구독 해지 (결제 후 7일 경과 또는 사용 이력 존재)
- **조건**: 결제 후 **7일이 경과**했거나, 결제 시점 이후 **서비스 이용 이력(모니터링 동작 및 기록)**이 발생한 경우.
- **연간 구독**: 중도 환불을 신청할 수 있습니다. 결제 대금에서 이용 일수 상당액을 공제한 **잔여 대금**에서, 다시 **위약금(잔여 대금의 10% 이내)**을 공제한 금액을 환불합니다.
  - 이용 일수 상당액은 연간 할인 혜택이 소급 소멸되므로 **월간 구독 정가 기준 일할 단가**로 산정합니다 (「콘텐츠이용자보호지침」의 장기계약 중도해지 시 단기 할인율 적용 원칙).
  - 산식과 상수는 `supabase/functions/_shared/toss.ts` 의 `proratedRefund()` 가 단일 소스이며, 요금 상수(`PRICE`)에서 유도되므로 요금 개편 시 자동으로 따라갑니다.
  - 신청 화면에서는 `payment-cancel` 의 `dryRun` 응답으로 **신청 전에 공제 내역과 환불 예정액을 표시**합니다. 클라이언트는 금액을 재계산하지 않습니다.
- **월간 구독**: 중도 환불은 제공하지 않으며, 아래 구독 해지로 안내합니다. (공정거래위원회의 OTT 등 구독 서비스 약관 시정 기준과 동일한 수준)
- **대안 (구독 해지)**: 사용자는 언제든지 프로필 영역에서 `[플랜 취소 (구독 해지)]`를 신청할 수 있으며, 이 경우 이미 결제된 이용 기간의 만료일(Grace Period)까지 PRO 플랜의 모든 혜택을 추가 비용 없이 누릴 수 있습니다. 만료일에 추가 청구 없이 FREE 등급으로 안전하게 자동 전환됩니다.

### 4.3. 수동/예외 환불 처리 프로세스
1. 결제 도중 시스템 오작동, 중복 결제 등 특별한 귀책사유로 예외 환불을 희망할 경우, 공식 CS 대표 이메일(`support@barosit.com`)로 결제 영수증 정보와 계정을 첨부하여 수동 접수합니다.
2. 운영팀에서 해당 사유 검증 및 승인 처리 시 어드민 콘솔을 통해 사용자의 유료 멤버십을 즉각 안전하게 회수하고, PG사 결제 승인을 수동으로 취소 처리합니다.

---

## 5. 실 서비스(Production) 전환을 위한 Toss Payments 결제 취소 API 연동 가이드

추후 테스트 모드를 끝내고 상용 릴리즈로 전환 시, 보안 규정을 엄수하여 안전한 취소 프로세스를 구성해야 합니다.

### 5.1. 보안 프록시(Supabase Edge Function) 아키텍처
결제 취소 API는 가맹점의 `Secret Key`(비밀 키)를 헤더에 포함하므로 절대 프론트엔드 코드에서 직접 호출해서는 안 되며, 반드시 다음과 같이 백엔드 중계 API를 생성해 처리해야 합니다.

#### Supabase Edge Function 예시 코드 (`supabase/functions/cancel-subscription/index.ts`)
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const TOSS_SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const { paymentKey, cancelReason } = await req.json();
  
  // 1. 유저 토큰 인증 및 RLS 우회용 Service Client 생성
  const authHeader = req.headers.get("Authorization")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // 2. 취소 자격 확인 (결제 7일 이내 여부 DB 조회)
  const { data: subscription } = await supabase
    .from("user_subscriptions")
    .select("created_at, plan_id")
    .eq("user_id", user.id)
    .single();

  const isWithin7Days = (new Date().getTime() - new Date(subscription.created_at).getTime()) <= 7 * 24 * 60 * 60 * 1000;
  if (!isWithin7Days) {
    return new Response(JSON.stringify({ error: "Refund window closed" }), { status: 400 });
  }

  // 3. Toss Payments 취소 API 호출
  const basicAuth = btoa(TOSS_SECRET_KEY + ":");
  const response = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ cancelReason })
  });

  const tossResult = await response.json();
  if (!response.ok) {
    return new Response(JSON.stringify({ error: tossResult.message }), { status: response.status });
  }

  // 4. DB 상태 강등 처리
  await supabase
    .from("user_subscriptions")
    .update({ plan_id: "free", status: "active", current_period_end: null })
    .eq("user_id", user.id);

  // 5. 결제 이력 환불 완료로 변경
  await supabase
    .from("billing_history")
    .update({ status: "refunded", refunded_amount: tossResult.cancelAmount, refunded_at: new Date().toISOString() })
    .eq("payment_key", paymentKey);

  return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
});
```
