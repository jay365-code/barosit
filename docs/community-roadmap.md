# 커뮤니티 로드맵 / 할일 (이어받기용)

> **이 문서가 커뮤니티 작업의 단일 TODO 출처.** 대화창의 작업 트래커는 세션 전용이라 안 넘어감 → 여기서 픽업.
> 최종 갱신 2026-07-01. 관련 상세: [service-completeness.html](service-completeness.html) CM-1~3 · [마케팅전략.html](마케팅전략.html) §7~9.

---

## ✅ 오늘(2026-06-30) 완료·배포됨
- **유저별 좋아요(하이브리드)** — 로그인=DB 조인테이블(post_likes/comment_likes)+toggle RPC, 게스트=localStorage. 좋아요 취소.
- **댓글/답글 UX** — 👍·💬·👁 아이콘 통계(따봉 클릭=추천+팝), 인라인 답글, 연결선 스레드, "답글 N개" 접기, 답글엔 답글버튼 숨김.
- **작성자 활동 모달** — 이름 클릭→글·댓글 모아보기→스레드 점프+하이라이트.
- **폴리시** — 상대시간·토스트·모달 ESC·댓글수 카드 동기화·인기순 정렬·본인 댓글 수정·영어 복수형·"더 보기" 페이지네이션.
- **실시간 댓글** — 코드+publication. ✅ 원격 검증 완료(2026-07-01, #14 참조).
- **배포** — migrations 080000~100000 원격 `db push` + main 푸시→Cloudflare. (마이그레이션 dafc510 커밋)
- 상세: [changelog.md](changelog.md) §0-9.

## ⚠️ 미커밋 문서 (내일 먼저 커밋 권장)
`docs/마케팅전략.html`, `docs/service-completeness.html`, `docs/changelog.md`, `docs/community-roadmap.md`(이 파일), `docs/marketing-beta-plan.md`(tombstone). → 디스크엔 있으니 작업은 이어지나, `git add docs && git commit` 권장.

---

## 📋 할일 (우선순위)

### 🥇 다음 작업 — 둘 중 택1로 시작
- [ ] **#19 ⭐ 프로덕트 매니저 에이전트 (참여 루프)** — 💡기능 제안 전담: 접수→중복 클러스터링→"N명 요청·검토중/예정/완료" 상태 회신→공개 로드맵. cm-agent-draft에 PM 역할(intent=feature_request)+로드맵 상태 스키마(feature_requests/votes/status). 상세: service-completeness **CM-2**.
- [x] **#18 ✅ 커뮤니티 SEO 구조 리팩토링 (마케팅 토대) — 배포+프로덕션 검증 완료(2026-07-01, 커밋 21f314f·abf9dab·fc9fbc7).** 프로덕션 curl 검증: /community(CollectionPage)·글 상세(QAPage)·사이트맵(200)·404·정적페이지 무회귀 전부 OK. **남은 운영 TODO: ① GSC+네이버에 community-sitemap.xml 제출+수집요청 ② 별개 보안이슈 게스트 password_hash 익명노출(task chip) ③ (후속) 글별 동적 OG 이미지.** 아래는 구현 상세 ↓ 결정=**A안(공지=블로그, `📣 공지`→BlogPosting; UGC→DiscussionForumPosting/QAPage)**. 구현: ① permalink `/community/p/<id>`(pathname 라우팅, 해시 라우팅과 공존)+`public/_redirects` SPA fallback ② **Cloudflare Pages Function 엣지 SSR**(`functions/community/p/[id].ts`: REST 단건조회→HTMLRewriter로 title/meta/OG/canonical override+정적 JSON-LD 제거+글별 JSON-LD·noscript 주입+404·이스케이프) ③ `public/_routes.json`로 함수 범위 한정. 클라: 리스트 제목 real `<a href>`+pushState, 뒤로/popstate/document.title 동기화. 빌드: `scripts/copy-functions.mjs`가 `functions/`→`dist-web/functions/` 복사. **로컬 wrangler 검증 OK**(SSR meta·QAPage JSON-LD·noscript·404·이스케이프·SPA 하이드레이션·back/forward, 콘솔에러 0). **Phase 2도 구현+로컬검증 완료(2026-07-01)**: 목록을 clean URL `/community`로(해시 제거 — 사용자 지적) + 목록 SSR(`functions/community/index.ts`: CollectionPage/ItemList JSON-LD + `<noscript>` 글 링크 나열로 크롤러 발견) + **동적 사이트맵**(`functions/community-sitemap.xml.ts` → `/community`+전체 글 permalink urlset, robots.txt 등록). nav/footer 링크 `#/community`→`/community`(해시 라우팅은 하위호환 유지). `_shared/ssr.ts` 헬퍼 공유. 라우팅 우선순위: 명시적 해시(≠community) > `/community`(/p/<id>) pathname > 해시 #/community > landing. wrangler 검증: `/community` 200·CollectionPage·noscript링크·사이트맵 urlset·글 상세 유지·하이드레이션(로드→목록·클릭→상세·뒤로→목록, 해시 0)·콘솔에러 0. **남은 것**: 배포 후 prod `curl`로 함수 실감지 재확인(리스크1) · 공지 BlogPosting 분기 실데이터 검증(공지 첫 게시 시). 상세: service-completeness **CM-3** · 마케팅전략 **§9** · 계획 `~/.claude/plans/humming-petting-kettle.md`.

> 💡 베타 어필이 목적이면 외부 유입 입구(검색·공유)가 먼저라 **#18(특히 공지=블로그)부터** 권장. 참여 루프 우선이면 #19.
> ⚠️ **배포 모델(중요)**: HEAD의 dist-web 번들에도 로컬 URL(127.0.0.1:54331)이 있으나 prod는 정상 → **Cloudflare가 리포에서 rebuild**(`.env.local` gitignore라 없음→supabase.ts prod 하드코딩 폴백). 즉 루트 `functions/`+`public/` 자동 반영. 커밋용 dist-web은 `.env.local` 치우고 빌드해 prod-url로 만듦(Case A/B 양쪽 안전).

### 🥈 그다음
- [ ] **#11 알림 시스템** — 내 글/댓글에 답글·추천 시 인앱 벨/뱃지→이메일. 유저 알림 인프라 신규(admin_notifications·RESEND 패턴). #19와 합치면 "제안→상태 알림→반영" 루프 완결.
- [ ] **#12 Aria 후속답변** — 현재 글(POST)에만 반응. 댓글/답글 INSERT 웹훅+스레드 맥락 → Aria 답변에 되물으면 이어서 대화.
- [ ] **#13 신고/모더레이션** — 스팸·욕설·PII 신고→어드민 큐, 에이전트 1차 분류. 외부 공개 전 필수.
- [x] **#14 실시간 댓글 원격 검증** — ✅ 완료(2026-07-01). 마이그 100000 prod remote 적용 확정(CLI) + 콘솔 비파괴 핸드셰이크로 `comments` postgres_changes 구독 `SUBSCRIBED` 도달 확인(Realtime 서비스·publication OK, DB 쓰기 0). 게시판 안 더럽힘. ⚠️ MCP execute_sql은 org 오매핑으로 타임아웃 → **prod 작업은 CLI(linked) 경로 사용**.

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
