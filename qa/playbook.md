# BaroSit QA Playbook (검증 운영 지식)

> 테스트 에이전트/러너가 매 실행 시 읽는 **환경 사실 + 절차**. 대화 맥락이 아니라 이 파일이 진실 소스다.

## 0. 단일 진실 소스
- 체크리스트: `qa/checklist.json` (id·category·title·method·expected·platforms·**verifyTier**)
  - TSX(`src/views/QaDashboardView.tsx`)에서 `node qa/scripts/extract-checklist.mjs` 로 재생성.
- 결과: `qa/results/<YYYYMMDD-HHMM>.json` — 대시보드 Import 호환 배열 `[{id,status,actualResult}]`.
  - status ∈ `Untested|Pass|Fail|N/A`.

## 1. 실행 범위(scope)
- `auto` : `verifyTier != manual` (≈50). 사람 개입 없이 검증. 러너/CI 기본값.
- `full` : auto + `manual`(13). manual 은 **사람 행위 필요** → 서브에이전트가 요청·관찰로 판정, 러너는 "needs-human"으로 표기.

## 2. verifyTier 별 검증 방법
- **integration** — 로컬 Supabase REST/Admin API 로 실증 (트리거·RLS·RPC·가입). §3.
- **runtime** — 웹 프리뷰(1431) DOM 구동: 라우트 진입·요소 렌더·토글 동작. §4.
- **unit** — vitest (`npx vitest run <file>`). 예: `src/pose/analyzer.test.ts`(MONI-02).
- **code** — 소스 화이트박스: 상수·로직·와이어링 확인(grep/read). 예: 5분 타이머, CHUNK_SIZE=50, 4.5s 토스트.
- **manual** — 카메라+신체 / Tauri 데스크톱 네이티브 클릭 / 실 결제·업데이트. §5.

## 3. 로컬 Supabase (integration)
- 가동 확인: `supabase status` (URL/REST/DB/키). 미가동 시 `supabase start`.
- 기본 포트(이 프로젝트): API `http://127.0.0.1:54331`, DB `postgresql://postgres:postgres@127.0.0.1:54332/postgres`, Studio 54334.
- 키 취득: `supabase status` → `anon`(sb_publishable_…), `service_role`(sb_secret_…). 하드코딩 금지, 실행 시 조회.
- DDL/마이그레이션 적용(리셋 없이): `docker exec -i $(docker ps --filter name=supabase_db -q|head -1) psql -U postgres -d postgres < <file.sql>`.
- 핵심 시나리오(이 세션에서 검증됨):
  - 가입 프로비저닝(AUTH-05): Admin API 로 유저 생성 → `profiles/user_settings/user_subscriptions(free,active)` 행 확인.
  - 어드민 자동지정(AUTH-06): `jhlee@gubed.co.kr` 가입 → `profiles.is_admin=true`.
  - OAuth provider(AUTH-01/02): `GET /auth/v1/authorize?provider=google|kakao` → 302 + 공급자 동의 URL(실 client_id). 외부 동의 클릭만 사람.
  - 변조방지(BILL-06): user JWT 로 `PATCH user_subscriptions {plan_id:pro}` → HTTP400 트리거 차단.
  - 어드민 플랜변경(ADMN-03): admin JWT PATCH → 200.
  - Q&A(COMM-01/03/04): user JWT posts/comments insert 201, 타인 글 DELETE → 0행(RLS).
  - 좋아요/조회수(COMM-02): `POST /rest/v1/rpc/increment_post_likes {p_id}` → 200, likes+1 (RPC, 마이그레이션 20260521000011).
  - 알림(ADMN-05/BILL-08): `admin_notifications` insert 201 + admin 조회.
- **정리 필수**: 테스트 유저 삭제 `DELETE /auth/v1/admin/users/<id>` (posts/comments/subscriptions FK 캐스케이드). `qa.*@example.com` 패턴 사용.
- 주의: `UID` 는 셸 예약변수 → 변수명 회피.

## 4. 웹 프리뷰 런타임 (runtime)
- 사용자가 1430 dev 서버를 직접 띄움. 검증용은 **포트 1431**(`.claude/launch.json` 의 `web-verify`).
- 라우트: `#/qa`(대시보드, 인증불요), `#/app`(모니터/설정, 게스트 가능), `#/pricing`·`#/terms`·`#/privacy`·`#/changelog`·`#/download/mac`·`#/community`(웹 마케팅).
- 해시 변경은 reload 유발 → `location.href=origin+'/#/<route>'` 후 ~3s 대기.
- `#/app` 은 캘리브레이션 게이트가 먼저 뜸 → `localStorage.setItem('calibration_baseline','{}')` 로 우회하면 메인 모니터 진입(설정 드로어 접근 가능). 온보딩은 `onboarded_v1` 제거 후 reload.
- 설정 드로어: "설정 열기" 버튼 클릭(클릭 후 ~1.5s 대기해야 렌더). SET-01~10 섹션 + 언어(LIFE-02). 데스크톱 전용(자동시작/미니바)은 웹에서 숨김(정상).
- 헤드리스라 **카메라 없음** → 포즈 검출 화면(MONI-01/02/08/09)은 UI 스캐폴딩까지만.

## 5. manual (사람 개입) 항목 — full scope 프로토콜
서브에이전트는 항목별로 **준비 → 사람에게 1줄 요청 → 응답 후 자동 판정**:
- DESK-01~09 (Tauri): 앱 빌드·실행 후 "X 클릭/최소화/Cmd+R/트레이 우클릭" 요청 → `pgrep -f target/debug/barosit` 종료 여부·로그·창 상태로 판정. (`osascript` GUI 자동화는 Accessibility 권한 없으면 불가)
- MONI-01/09 (카메라): 사용자 기기 브라우저에서 "거북목/고개 좌우" 요청 → 화면 관측/스샷으로 판정.
- AUTH-01/02 (OAuth 동의): "로그인 버튼→공급자 동의" 요청 → `supabase.auth.getSession()` 세션 수립 확인.
- BILL-04(실 Toss 결제), LIFE-03(실 업데이트 서버+서명빌드): 환경 제약 큼 — 사용자 수행, 에이전트는 DB/로그로 사후 확인.

## 5.5 판정 기준 (중요)
- 체크리스트 항목에 **`verifyNote` 가 있으면 그것이 정확한 합격 기준**이다. `expected` 가 모호하면 `verifyNote` 를 우선한다.
- 스펙을 임의로 좁혀 해석하지 말 것 (예: MONI-03 을 "FREE 전용 정지"로 읽어 PRO도 멈춘다고 Fail 처리 ✗ — verifyNote 참고).
- 코드 추정만으로 Fail 내기 전, 해당 티어로 실제 검증이 가능하면(런타임/통합) 그걸 우선한다.

## 6. 출력 규약
- 각 항목 actualResult 앞에 검증방식 태그: `[실증]`(integration/runtime) `[단위테스트]` `[코드]` `[부분]` `[수동필요]`.
- 결과 JSON 저장 후 요약(집계 + Fail/주의 목록) 보고.
- Fail 발견 시: 원인(file:line) + 수정안 제시. (예: COMM-02 → SECURITY DEFINER RPC)
