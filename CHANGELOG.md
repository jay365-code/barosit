# BaroSit 업데이트 내역

<!--
이 파일은 사용자에게 노출되는 릴리스 노트의 단일 소스입니다. 관리 주체 = PM 에이전트 Ethan
(docs/agent-roster.md) 초안 + 관리자 승인(PR 머지).

규칙:
- 한 항목 = 사용자가 체감하는 변화 한 문장. 내부 리팩토링·빌드·문서·테스트 변경은 쓰지 않는다.
- 기술 용어(세그멘터·훅·마이그레이션 등) 금지. 보안 수정은 "보안 개선"으로 뭉뚱그린다.
- 가격·출시일·법적 약속 금지.
- 각 버전 마지막에 *(en)* 한 줄 영어 요약.

파이프라인(자동):
- 태그 vX.Y.Z 푸시 시 CI 가 "## vX.Y.Z" 섹션을 추출해 GitHub Release 본문으로 게시한다.
  섹션이 없으면 릴리스가 실패한다. → 새 버전 태그 전에 반드시 이 파일에 섹션을 추가할 것.
- Release 본문은 앱 업데이트 배너(latest.json notes)와 웹 업데이트 내역(#/changelog, releases 테이블)에 전파된다.
- 초안 생성: GitHub Actions "Prepare Release Notes" 수동 실행 → Ethan 이 커밋 로그를 요약해 PR 생성.
-->

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
