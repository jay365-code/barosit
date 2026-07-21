# BaroSit 업데이트 내역

<!--
이 파일은 사용자에게 노출되는 릴리스 노트의 단일 소스입니다. 관리 주체 = PM 에이전트 Ethan
(docs/agent-roster.md) 초안 + 관리자 승인(PR 머지).

규칙:
- 한 항목 = 사용자가 체감하는 변화 한 문장. 내부 리팩토링·빌드·문서·테스트 변경은 쓰지 않는다.
- 기술 용어(세그멘터·훅·마이그레이션 등) 금지. 보안 수정은 "보안 개선"으로 뭉뚱그린다.
- 가격·출시일·법적 약속 금지.

포맷(다국어 ko+en, v0.9.5~):
- 각 버전 섹션은 "**한국어**" 블록과 "**English**" 블록으로 나눠 같은 내용을 두 언어로 적는다.
  한국어는 웹/앱의 한국어 UI, English 는 그 외 언어(en/ja)에 노출된다.

  ## vX.Y.Z — YYYY-MM-DD

  **한국어**

  - 변화 1

  **English**

  - Change 1

파이프라인(자동):
- 태그 vX.Y.Z 푸시 시 CI 가 "## vX.Y.Z" 섹션을 추출(한국어/영어 블록 분리)해 GitHub Release 본문·
  releases 테이블(content/content_en)로 게시한다. 섹션이 없으면 릴리스가 실패한다.
- Release 본문은 앱 업데이트 배너(latest.json notes)와 웹 업데이트 내역(#/changelog, releases 테이블)에 전파된다.
- 초안 생성: GitHub Actions "Prepare Release Notes" 수동 실행 → Ethan 이 커밋 로그를 ko/en 으로 요약해 PR 생성.
- (구 포맷: 한국어 단일 + *(en)* 한 줄. v0.9.4 이하. CI 는 이 경우 한국어만 전파.)
-->

## v0.9.14 — 2026-07-21

**한국어**

- 결제 후 완료·승인 대기 화면이 정상적으로 표시됩니다.
- 앱에서 결제가 되지 않던 문제를 수정했습니다.

**English**

- The payment confirmation and approval screens now display correctly after checkout.
- Fixed an issue where in-app payments could not be completed.

## v0.9.13 — 2026-07-21

**한국어**

- 결제수단 목록 조회 및 삭제 기능을 웹에서 직접 사용할 수 있습니다.
- 구독을 해지한 후 이전 카드 정보가 사라지지 않고 남아 보이던 문제를 수정했습니다.
- 환불 요청이 오류로 막히던 문제를 수정하고, 연간 구독 중도 해지 시 환불을 받을 수 있습니다.
- 라이트 테마에서 요금제 안내 팝업의 내용이 보이지 않던 문제와 달력·툴팁 표시 오류를 수정했습니다.
- 구독 관리 화면에 잘못 표시되던 사용 통계를 바로잡았습니다.
- 브라우저 탭 아이콘이 일부 환경에서 깨지거나 충돌하던 문제를 수정했습니다.
- 보안을 개선했습니다.

**English**

- You can now view and remove your saved payment methods directly on the web.
- Fixed an issue where a previous card remained visible after canceling a subscription.
- Refund requests are no longer blocked by an error, and mid-term refunds are now available for annual subscriptions.
- Fixed the plan details popup showing no text in light theme, along with calendar and tooltip display errors.
- Corrected inaccurate usage statistics shown on the subscription management screen.
- Fixed browser tab icon rendering issues that caused broken or conflicting icons in some environments.
- Improved security.

## v0.9.12 — 2026-07-16

**한국어**

- Microsoft Store에서 설치한 경우의 업데이트 안내를 개선했습니다.

**English**

- Improved update guidance for installs from the Microsoft Store.

## v0.9.11 — 2026-07-16

**한국어**

- 앱 안정성을 개선했습니다.

**English**

- General stability improvements.

## v0.9.10 — 2026-07-16

**한국어**

- 중요한 업데이트가 있을 때 최신 버전을 놓치지 않고 계속 이용하실 수 있도록 업데이트 안내를 개선했습니다.

**English**

- Improved update handling so you don't miss important updates and can keep using the latest version.

## v0.9.9 — 2026-07-16

**한국어**

- 자리를 비우고 쉰 시간이 휴식으로 제대로 인정되도록 개선했습니다 — 배터리 절약으로 카메라가 꺼져 있던 동안 쉰 시간도 자리로 돌아오면 반영됩니다.

**English**

- Time spent resting away from your desk is now credited properly — including breaks taken while the camera was off to save battery, counted once you return.

## v0.9.8 — 2026-07-15

**한국어**

- 자리를 비운 동안에도 휴식·움직임 시간이 미니바에 올바르게 반영되도록 개선했습니다.
- 자세를 살짝 고쳐 앉는 동작이 '어깨 으쓱' 스트레칭으로 잘못 집계되던 문제를 바로잡아 스트레칭 점수가 더 정확해졌습니다.
- 인터넷 연결이 없어도 최대 14일간 정상적으로 이용할 수 있도록 오프라인 이용 기간을 정비했습니다.

**English**

- Rest and movement time now updates correctly in the mini bar even while you're away from your seat.
- Fixed slight posture adjustments being miscounted as a "shoulder shrug" stretch, so your stretch score is more accurate.
- Refined the offline access window so the app keeps working for up to 14 days without an internet connection.

## v0.9.7 — 2026-07-08

**한국어**

- 커뮤니티 게시글에 이미지를 최대 5장까지 첨부할 수 있습니다.
- Microsoft Store에서 설치한 경우, 업데이트가 스토어를 통해 매끄럽게 이뤄집니다.
- 여러 언어로 작성된 글 목록이 각 언어에 맞게 올바로 표시됩니다.

**English**

- You can now attach up to 5 images to a community post.
- For installs from the Microsoft Store, updates are now handled smoothly through the Store.
- Multilingual post lists now display correctly for each language.

## v0.9.6 — 2026-07-03

**한국어**

- 절전 모드 또는 자리 비움 상태에서 돌아온 후 자세 감지가 자동으로 다시 작동합니다.

**English**

- Posture detection now resumes automatically after waking from sleep or returning from away mode.

## v0.9.5 — 2026-07-03

**한국어**

- 자동 시작을 켜면 시스템 설정의 로그인 항목에 앱 이름 'BaroSit'으로 표시됩니다.

**English**

- When auto-start is on, BaroSit now appears by its own name in the system's login-items list.

## v0.9.4 — 2026-07-03

- 자리를 비운 시간이 실제와 다르게 기록되던 문제를 수정했습니다.
- 휴식 알림이 떴을 때 응답할 수 있는 시간이 3분으로 늘어나 알림을 놓치기 어려워졌습니다.
- '몇 분마다 일어나야 할까 — 최적 휴식 주기' 아티클이 새롭게 추가되었습니다.

*(en)* Away-time tracking is now accurate, break-response window extended to 3 min, and a new article on optimal break intervals is live.

## v0.9.3 — 2026-07-03

- 미니바의 연속 착석 시간이 실제보다 짧게 계산되던 문제를 수정했습니다. 새로고침이나 창 전환에도 시간이 이어집니다.
- 조명·각도 때문에 인식이 잠깐 끊겨도 착석 시간이 끊기지 않습니다.
- "한 자세가 오래됐어요"(자세 변동성) 알림이 실제 환경에서 동작하도록 감지 기준을 다시 조정했습니다.
- 가만히 있어도 "잘 움직였어요"로 잘못 인정되던 오류를 고쳤습니다 — 이제 실제로 일어나거나 크게 움직여야 인정됩니다.
- 자세 알림(거북목 등)이 설정보다 늦게 뜨던 문제를 바로잡았습니다.
- 받은 기능 제안의 진행 상황을 보여주는 공개 로드맵 페이지가 웹에 생겼습니다.
- 커뮤니티 블로그에 "스탠딩 데스크, 정말 효과 있을까" 글이 올라왔습니다.

*(en)* Fixed the seated timer undercounting and losing time on reloads, recalibrated stillness detection so posture-change nudges fire reliably, movement is now only credited when you actually move, plus a public feature roadmap page and a new blog post on standing desks.

## v0.9.2 — 2026-07-01

- 하단 미니바가 내용 길이에 맞춰 크기가 조절돼, 오른쪽 버튼이 잘리던 문제를 수정했습니다.
- 모니터링을 일시정지하면 카메라를 완전히 꺼서 OS 카메라 표시등도 함께 꺼집니다.
- 커뮤니티 블로그가 한국어·영어·일본어로 제공되고, 언어가 달라도 댓글을 함께 나눌 수 있습니다.

*(en)* Minibar now resizes to fit its content, pausing fully turns off the camera (indicator light included), and the community blog is available in Korean, English, and Japanese.

## v0.9.1 — 2026-07-01

- 오래 같은 자세로 앉아 있는 것을 막는 기능을 개편했습니다 — 30분마다 1분 움직임 목표와 상시 타이머가 생겼습니다.
- 커뮤니티 블로그에 "모니터 높이 세팅" 가이드 글이 올라왔습니다.

*(en)* New anti-static-sitting system: a "1 minute of movement every 30 minutes" goal with an always-on timer.

## v0.9.0 — 2026-07-01

- 장시간 사용 중 카메라 화면(실루엣)이 멈추면 자동으로 복구합니다.
- 커뮤니티가 크게 개편됐습니다: 블로그 채널, 글마다 고유 주소(공유·검색 가능), 답글과 추천 기능.
- 커뮤니티 운영자 AI "아리아(Aria)"가 활동을 시작했습니다 — 질문에 운영자가 검수한 답변을 드립니다.
- 계정과 데이터를 앱에서 직접 삭제(회원탈퇴)할 수 있습니다.

*(en)* Self-recovery for frozen camera view, a revamped community (blog, permalinks, replies & likes), our AI community manager Aria, and self-service account deletion.

## v0.3.11 — 2026-06-29

- Apple 로그인과 이메일 회원가입·로그인·비밀번호 찾기를 지원합니다.
- 통계 카드 숫자가 흔들려 보이던 정렬 문제를 수정했습니다.

*(en)* Sign in with Apple and email sign-up/password recovery are now supported.

## v0.3.10 — 2026-06-26

- 사내망·오프라인 환경에서도 안정적으로 동작합니다 — 네트워크가 막혀도 Pro 기능이 풀리지 않고, 차단 원인을 안내합니다.

*(en)* Better resilience on corporate/offline networks — Pro features persist and blocked connections are explained.

## v0.3.9 — 2026-06-26

- 자리를 비웠다 돌아왔을 때 카메라가 다시 켜지지 않던 문제를 수정했습니다.
- 자세 인식 모델을 앱에 내장해 인터넷 없이도 동작합니다.
- 캘리브레이션이 실패하면 원인과 해결 방법을 안내합니다.
- 클라우드 동기화가 더 안정적으로 동작하고, 동기화 상태를 확인할 수 있습니다.
- 앱 안에서 바로 의견을 보낼 수 있는 피드백 기능이 생겼습니다.

*(en)* Fixed camera not resuming after you return to your desk, bundled the pose model for offline use, added calibration failure guidance, more reliable cloud sync, and in-app feedback.

## v0.3.8 — 2026-06-24

- 장시간 사용 시 메모리 사용량이 서서히 늘던 문제를 수정했습니다.

*(en)* Fixed a slow memory build-up during long sessions.

## v0.3.7 — 2026-06-23

- 카메라 영상이 나오지 않던 문제를 복구하고, 화면 깜빡임을 완화했습니다.

*(en)* Restored camera preview and reduced flicker.

## v0.3.6 — 2026-06-23

- macOS 설치 과정을 안정화한 릴리스입니다. 이제 다운로드한 설치 파일에서 보안 경고가 나타나지 않습니다.

*(en)* Stabilized macOS installation — no more security warnings on the downloaded installer.

## v0.3.5 — 2026-06-23

- 설치 파일 서명 안정화 릴리스입니다.

*(en)* Installer signing stabilization release.

## v0.3.4 — 2026-06-23

- macOS 설치 시 "확인되지 않은 개발자" 경고가 사라졌습니다 (공식 서명·공증 적용).
- Windows는 Microsoft Store에서 설치할 수 있습니다.
- 휴식 알림이 더 똑똑해졌습니다: 무시하면 빈도를 줄이고, 방해가 덜 되는 순간에 알려주며, 집중모드를 지원합니다.
- 어깨 으쓱임을 잘못 감지하던 문제를 수정했습니다.
- 자세 과학 근거를 정리한 "근거" 페이지가 웹사이트에 생겼습니다.

*(en)* Signed & notarized macOS builds (no more security warnings), Microsoft Store for Windows, smarter break reminders (adaptive frequency, better timing, focus mode), and a science evidence page.

## v0.3.3 — 2026-06-11

- 무료 베타 기간이 시작됐습니다 — 모든 기능을 무료로 사용할 수 있습니다.
- 다운로드 페이지가 사용 중인 운영체제를 자동으로 감지합니다.
- 소셜 로그인이 일부 환경에서 실패하던 문제를 보완했습니다.

*(en)* Free beta begins, download page auto-detects your OS, and social login reliability improved.

## v0.3.2 — 2026-06-09

- 어깨 으쓱임을 과하게 감지해 알림이 반복되던 문제를 수정했습니다.
- 로그인하지 않은 상태의 카메라 화면에 안내를 추가했습니다.

*(en)* Fixed over-detection of shoulder shrugs and added guidance on the camera view when signed out.

## v0.3.1 — 2026-06-09

- 결제·플랜 권한이 꼬일 수 있던 문제들을 점검·보완했습니다.
- 커뮤니티 좋아요/조회수가 잘못 집계되던 버그를 수정했습니다.

*(en)* Hardened billing/plan entitlement handling and fixed community like/view counters.

## v0.3.0 — 2026-06-05

- 결제 시스템을 도입했습니다 (무료 베타 기간에는 결제 없이 모든 기능 사용 가능).

*(en)* Payment system introduced (everything remains free during the beta).

## v0.2.29 — 2026-06-04

- 해외 사용자를 위해 가격에 달러/엔 근사 금액을 함께 표시합니다.
- 웹 앱의 버전 표시가 실제 버전과 다르던 문제를 수정했습니다.

*(en)* Prices now show approximate USD/JPY amounts, and the web app displays its real version.

## v0.2.28 — 2026-06-04

- 한국어·영어·일본어 3개 언어를 지원합니다.

*(en)* BaroSit now speaks Korean, English, and Japanese.

## v0.2.27 — 2026-06-01

- 자리비움 표시가 잘못 나타나던 문제를 수정했습니다.

*(en)* Fixed an incorrect away-from-desk indicator.

## v0.2.26 — 2026-06-01

- 자리를 비우면 카메라를 자동으로 꺼서 배터리를 아낍니다.

*(en)* Camera turns off automatically while you're away to save battery.

## v0.2.25 — 2026-05-30

- 컴퓨터가 유휴 상태일 때 절전 모드 진입을 막지 않도록 개선했습니다 (배터리 절약).

*(en)* BaroSit no longer prevents your computer from sleeping when idle, saving battery.
