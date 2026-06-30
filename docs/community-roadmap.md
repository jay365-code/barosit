# 커뮤니티 로드맵 / 할일 (이어받기용)

> **이 문서가 커뮤니티 작업의 단일 TODO 출처.** 대화창의 작업 트래커는 세션 전용이라 안 넘어감 → 여기서 픽업.
> 최종 갱신 2026-06-30. 관련 상세: [service-completeness.html](service-completeness.html) CM-1~3 · [마케팅전략.html](마케팅전략.html) §7~9.

---

## ✅ 오늘(2026-06-30) 완료·배포됨
- **유저별 좋아요(하이브리드)** — 로그인=DB 조인테이블(post_likes/comment_likes)+toggle RPC, 게스트=localStorage. 좋아요 취소.
- **댓글/답글 UX** — 👍·💬·👁 아이콘 통계(따봉 클릭=추천+팝), 인라인 답글, 연결선 스레드, "답글 N개" 접기, 답글엔 답글버튼 숨김.
- **작성자 활동 모달** — 이름 클릭→글·댓글 모아보기→스레드 점프+하이라이트.
- **폴리시** — 상대시간·토스트·모달 ESC·댓글수 카드 동기화·인기순 정렬·본인 댓글 수정·영어 복수형·"더 보기" 페이지네이션.
- **실시간 댓글** — 코드+publication. ⚠️ 로컬 라이브 미검증(아래 #14).
- **배포** — migrations 080000~100000 원격 `db push` + main 푸시→Cloudflare. (마이그레이션 dafc510 커밋)
- 상세: [changelog.md](changelog.md) §0-9.

## ⚠️ 미커밋 문서 (내일 먼저 커밋 권장)
`docs/마케팅전략.html`, `docs/service-completeness.html`, `docs/changelog.md`, `docs/community-roadmap.md`(이 파일), `docs/marketing-beta-plan.md`(tombstone). → 디스크엔 있으니 작업은 이어지나, `git add docs && git commit` 권장.

---

## 📋 할일 (우선순위)

### 🥇 다음 작업 — 둘 중 택1로 시작
- [ ] **#19 ⭐ 프로덕트 매니저 에이전트 (참여 루프)** — 💡기능 제안 전담: 접수→중복 클러스터링→"N명 요청·검토중/예정/완료" 상태 회신→공개 로드맵. cm-agent-draft에 PM 역할(intent=feature_request)+로드맵 상태 스키마(feature_requests/votes/status). 상세: service-completeness **CM-2**.
- [ ] **#18 ⚠️ 커뮤니티 SEO 구조 리팩토링 (마케팅 토대)** — 현재 해시 라우팅+글 permalink 부재로 검색·소셜·AI에 0 노출. ① 글 path URL `/community/p/<id>`+pathname 라우팅+Cloudflare SPA fallback ② **Cloudflare Pages Function 엣지 SSR**(Supabase 조회→meta·OG·본문·JSON-LD QAPage→SPA 하이드레이션; UGC라 빌드타임 정적생성 불가) ③ 동적 사이트맵. MVP=글 상세 SSR만. 상세: service-completeness **CM-3** · 마케팅전략 **§9**.
  - **연계 미결정**: **📣 공지를 블로그 포맷 + SSR 첫 타겟으로** (운영자전용·저volume·고가치라 SEO 첫 적용 이상적). 방식 (A) 보드 내 공지만 블로그 렌더+우선 SSR / (B) 정식 블로그로 승격+기존 `/blog` 통합. **추천=(A) 시작**. 부가: 마크다운+이미지, JSON-LD는 공지=Article·UGC=QAPage, 댓글 유지. → **사용자 결정 대기.**

> 💡 베타 어필이 목적이면 외부 유입 입구(검색·공유)가 먼저라 **#18(특히 공지=블로그)부터** 권장. 참여 루프 우선이면 #19.

### 🥈 그다음
- [ ] **#11 알림 시스템** — 내 글/댓글에 답글·추천 시 인앱 벨/뱃지→이메일. 유저 알림 인프라 신규(admin_notifications·RESEND 패턴). #19와 합치면 "제안→상태 알림→반영" 루프 완결.
- [ ] **#12 Aria 후속답변** — 현재 글(POST)에만 반응. 댓글/답글 INSERT 웹훅+스레드 맥락 → Aria 답변에 되물으면 이어서 대화.
- [ ] **#13 신고/모더레이션** — 스팸·욕설·PII 신고→어드민 큐, 에이전트 1차 분류. 외부 공개 전 필수.
- [ ] **#14 실시간 댓글 원격 검증 (5분)** — 원격 barosit.com 두 창으로 라이브 동작 확인, 안 되면 대시보드 Database→Replication 토글. **오늘의 loose end.**

### 🥉 참여/성장
- [ ] **#15 게이미피케이션** — 🔥자세인증 챌린지↔점수/뱃지 연동, 주간 리더보드, 공유 카드.
- [ ] **#16 이메일 주간 다이제스트** — 인기글+내 활동. RESEND+pg_cron.
- [ ] **#17 Aria 지식베이스 보강** — docs/faq.md 빈발 질문 사실 추가→신뢰도↑.

---

## 🧭 핵심 결정사항 (맥락)
- **에이전트 = 오케스트레이터 1개 + 역할 뱃지**(코치/매니저/프로덕트), 사람은 Aria 1명. 성장 시 "팀" 분기. 백그라운드(모더레이터·애널리스트·큐레이터)는 별도 잡.
- **좋아요 = 하이브리드**(로그인 DB / 게스트 localStorage), 카운트 컬럼 보존.
- **게스트 추천 = 유지**(차단 안 함, 참여 우선).
- **실시간 = 무해 degrade**(안 떠도 refetch로 동작).
- **마케팅 = 1문서**(마케팅전략.html). 베타 목표=활성화·리텐션·증언·피드백(매출 아님). 커뮤니티 플라이휠이 차별 엔진.

## 📂 어디에 뭐가 있나
- 기능/상태: `docs/service-completeness.html` CM-1(보드 UX·완료)·CM-2(에이전트 로스터·PM우선)·CM-3(SEO 리팩토링).
- 마케팅: `docs/마케팅전략.html` §7 베타플랜·§8 플라이휠·§9 SEO리팩토링(체크리스트 통합).
- 변경이력: `docs/changelog.md` §0-9.
- 코드: `src/web/Marketing.tsx`(커뮤니티 전체)·`src/components/Icon.tsx`·`supabase/functions/cm-agent-draft/*`·`supabase/migrations/2026063008~10*`.
- 메모리: barosit-community-board / barosit-community-agent / barosit-seo-marketing.
