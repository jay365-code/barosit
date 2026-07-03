# 타이머 모델 (Timer & Counter Reference)

> 작성일: 2026-07-03 · 목적: "올바른 자세는 없다 · 최고의 자세는 다음 자세다" 철학을 구현한 타이머들이 여러 파일에 흩어져 중복·혼동되므로 한 장으로 정리
> 관련: [[posture-nudge-design]] · [[posture-evidence-and-reflection]] · [[detection-algorithm]]
> 코드: breakTracker.ts / variabilityTracker.ts / violationTracker.ts / cumulativeLoadTracker.ts / complianceTracker.ts / jitaiGate.ts

---

## 0. 한 문장 요약

타이머가 많아 보이지만 **"다음 자세" 철학을 구현한 핵심 시계는 딱 2개**다 — **축 A(착석 시간)** 와 **축 B(자세 변동성)**. 둘 다 **"1분 움직임"** 이라는 하나의 리셋 버튼을 공유한다. 나머지 타이머는 전부 이 둘을 덜 짜증나게 만드는 **보조(노이즈 필터·매너)** 다. 그리고 이와 별개로 **"나쁜 자세" 가족(위반·누적부하)** 이 공존한다 — 철학이 정반대이므로 섞어 보면 헷갈린다.

---

## 1. 핵심 시계 2개 (= "다음 자세" 철학)

앱은 앉아있는 사용자에게 서로 다른 **두 질문**을 던진다. 각각 독립된 시계로 돈다.

| | **축 A — "너무 오래 앉았다"** | **축 B — "너무 안 움직인다"** |
|---|---|---|
| 재는 것 | 연속 착석 **누적 시간** (카운트업 스톱워치) | 최근 **10분 창** 안에서 자세가 얼마나 흔들렸나 |
| 던지는 말 | "이제 그만 일어나 / 움직여" | "가만히 고여있네, 자세 좀 바꿔" |
| 핵심 값 | `secsSeated` | `movementIndex` (10분 롤링 표준편차) |
| 발동 | 30분 / 50분 / 120분 (micro→standup→deep) | index가 정체 임계(5.0) 밑으로 떨어질 때 |
| 앉은 시간과 관계 | 시간이 곧 트리거 | **무관** — 12분만 앉아도 고여있으면 울림 |
| 근거 | KOSHA 30분 규칙 (오래 앉음 자체가 문제) | McGill (좋은 자세도 오래 고정되면 나쁨) |
| 파일 | `src/pose/breakTracker.ts` | `src/pose/variabilityTracker.ts` |

두 축 모두 "올바른 자세는 없다"의 두 얼굴이다. **A는 *휴식으로 넘어가라*, B는 *제자리에서 바꿔라*.**

### 1.1 축 A — 착석 시간 장부 (breakTracker.ts)

착석 스톱워치 `secsSeated` 가 정해진 임계에 닿을 때마다 단계가 오른다 (단방향: `none → micro → standup → deep`).

| 단계 | 임계 (연속 착석) | 기본값 | 메시지 성격 |
|---|---|---|---|
| `micro` | 30분 | ✅ | 가벼운 마이크로 무브먼트 |
| `standup` | 50분 | ✅ | 일어서기 (KOSHA H-30) |
| `deep` | 120분 | ✅ | 강한 휴식 |

보조 카운터 (모두 breakTracker 내부):

| 변수 | 뜻 | 리셋 임계 |
|---|---|---|
| `secsSeated` | 연속 착석 누적(초) | 아래 4가지 중 하나 |
| `secsAbsent` | 미검출(자리비움) 누적(초) | 5분(`ABSENCE_RESET_SECS`) → secsSeated 리셋 |
| `secsResting` | 등받이 깊은 휴식 누적(초) | 5분(`RESTING_RESET_SECS`) → 리셋 |
| `secsStanding` | 선 자세 누적(초) | 5분(`STANDING_RESET_SECS`) → 리셋 |
| `movementSecs` | 알림 후 움직임 누적(초) | 목표(60초) 도달 시 완료+리셋 |

### 1.2 축 B — 자세 변동성 (variabilityTracker.ts)

앉은 시간과 무관하게, **최근 10분 창**의 자세 흔들림(어깨 Y·코 Y/Z·face pitch의 표준편차 합 = `movementIndex`)을 본다.

| 파라미터 | 기본값 | 뜻 |
|---|---|---|
| `windowMinutes` | 10분 | 롤링 윈도우 |
| `threshold` | 5.0 | index < 5.0 → **정체** 판정(알림) |
| `movementThreshold` | 6.5 | index ≥ 6.5 → **유의미한 움직임** 인정 |
| `cooldownMinutes` | 15분 | 재발사 쿨다운 (백오프로 최대 2배) |

> 실측(2026-07-02, MacBook 내장캠): 정지 착석 ≈ 3.4~4.3 / 의도적 움직임 ≈ 7.4~7.9. 사이 5.0~6.5는 애매 구간(알림·기여 없음).

윈도우는 **자리비움/휴식 진입 시 끊긴다**(`continuouslyPresent=false`, `lastInterruptedAt` 갱신). 복귀 후에는 새 창을 다시 채워야 발사 가능하다. → 자세한 상호작용은 §5 참조.

---

## 2. 공유 리셋 버튼: "1분 움직임" (딱 하나)

두 축 모두 **같은 방법으로 초기화**된다. 이게 철학의 심장이다.

> **`movementGoalSecs` = 60초.** 알림이 뜬 뒤 누적으로 1분 움직이면 → 착석 시계 0으로, "제대로 쉼" 인정 + 보상.

- 1초 찔끔 움직임으론 안 됨(회피 방지). 근거: 1분 dose가 혈당·디스크 회복 최소선 ([[posture-nudge-design]]).
- 기여 행동: 기립 / 등받이 휴식 / 자리비움 / 스트레치 감지 / 변동성 `movementIndex ≥ 6.5`.
- **혼동 주의**: `movementSecs`(1분 목표 진행률, 단위 초)와 `movementIndex`(변동성 지수, 무차원)는 이름만 비슷한 별개 값. index가 6.5를 넘으면 movementSecs에 기여하는 것이 둘 사이 **유일한 연결고리**.

---

## 3. 보조 타이머 — "핵심 2개를 덜 짜증나게" (개념 아님)

핵심 시계를 방해 없이 굴리기 위한 매너·노이즈 필터. 헷갈릴 필요 없다.

| 종류 | 값 | 역할 | 파일 |
|---|---|---|---|
| 착석 유예 | 30초 (`PRESENCE_GRACE_SECS`) | 검출 노이즈로 "자리 떴다" 오판 방지 | presenceStabilizer.ts |
| 화면 배지 유예 | 8초 (`ABSENCE_GRACE_MS`) | 자리비움 배지 표시용 (트래커와 별개) | useMonitoringEngine.ts |
| 위반 재알림 쿨다운 | 5분 (`ALERT_COOLDOWN_MS`) | 같은 위반 도배 방지 | violationTracker.ts |
| 변동성/누적 쿨다운 | 15분 | 정체·누적 알림 도배 방지 | variabilityTracker.ts / cumulativeLoadTracker.ts |
| JITAI 보류 | 최대 90초 (`maxHoldSecs`) | "고개 돌리는 틈" 등 방해 가능 순간까지 대기 후 발사 | jitaiGate.ts |
| 적응형 백오프 | 최대 2배 | 계속 무시하면 알림 빈도 스스로 낮춤 (자율성) | complianceTracker.ts |
| 움직임 완화 | 최대 2배 | 활발히 움직이는 중이면 잠깐 나쁜 자세 봐줌 | violationTracker.ts |

준수 추적(complianceTracker): 알림 후 60초 응답 윈도우 안에 움직였나 판정 → `ignoreStreak`(연속 무시)이 백오프 배수를 만든다.

---

## 4. ⚠️ 함께 헷갈리는 "다른 가족" — 나쁜 자세 판정

`violationTracker.ts`(거북목·어깨기울임·구부정 등)와 `cumulativeLoadTracker.ts`(누적 부하)는 위 철학과 **정반대 가족**이다. 여기엔 "나쁜 자세"가 명시적으로 존재한다(예: forward_head 5초 지속 → 알림; 30분 창에서 나쁜 자세 25% 누적 → 알림).

앱의 철학은 사실상 두 갈래로 공존한다:

1. **"올바른 자세 없음 / 다음 자세" 가족** → 축 A(착석시간) + 축 B(변동성)
2. **"이건 나쁜 자세다" 가족** → 위반 + 누적부하

"타이머가 중복돼 헷갈린다"는 느낌의 상당 부분은 이 **두 철학이 한 화면에서 섞여 보이기 때문**이다.

---

## 5. 축 A ↔ 축 B 상호작용 (자리비움 전후)

자리비움이 발생하면:

- **축 A**: `secsAbsent`가 5분에 닿으면 `secsSeated` = 0 리셋 (일어났다 온 것으로 간주).
- **축 B**: 자리비움 순간 윈도우가 끊기고(`continuouslyPresent=false`, `lastInterruptedAt` 갱신) 복귀 후 새 창을 다시 채워야 정체 알림 발사 가능.

### 5.1 "자리비움 리셋 직후 축 B 오발사" — 확정 버그 + 수정 (2026-07-03)

관찰(스크린샷 확정): 5분+ 자리비움으로 축 A가 리셋된 직후, **"10분째 같은 자세 / 한 자세로 오래 계셨어요"** = 정확히 축 B 변동성 알림이 오발사됨.

**근본 원인 (두 겹) — 10분 경과 가드가 무력화됨:**

1. **엔진 early-return**: 자리비움 확정 블록(useMonitoringEngine.ts:530-558)이 `breakTracker`엔 자리비움을 넘기지만 곧바로 `return`. `variabilityTracker.push()`는 그 아래(:655)라 **자리비움 동안 호출조차 안 됨** → 변동성 윈도우의 "자리비움→끊기" 로직(variabilityTracker.ts:101-104)이 실전에서 죽은 코드. 복귀 시 트래커는 자리비움을 몰라 **이전 정체 샘플**을 그대로 들고 발사.
2. **가드 초기값**: `continuouslyPresent=true` + `lastInterruptedAt=0`이라 `now - lastInterruptedAt >= windowMs`가 항상 참. 앱 시작·일시정지 해제 직후에도 fps 8 기준 **~4초** 정체만으로 발사 가능.

> 참고: "10분째"는 실제 착석 시간이 아니라 창 길이(`windowMinutes`)를 찍는 **고정 문구**라 오발사 시 더 혼란스러웠다.

**수정 (적용됨):**

- 자리비움 블록에서 `variabilityTracker.push(now, false, …)`를 호출해 윈도우를 명시적으로 끊음 — `breakTracker` 패턴과 동일.
- `continuouslyPresent` 초기값·`reset()`를 `false`로 — 세션 시작을 "끊김"으로 봐 첫 프레임에서 `lastInterruptedAt=now`를 찍고 10분 가드를 무장.
- 회귀 테스트 2종 추가(시작 직후·복귀 직후 오발사 차단). 수정 전 실패 → 수정 후 통과 검증. 전체 111 테스트 통과 · tsc 클린.

> 별개: 누적부하("누적 부하 · 30분 중 {{pct}}%")는 30분 창이 자리비움을 넘어 생존(cumulativeLoadTracker.ts:99, 에피소드는 시간으로만 프루닝)하므로 복귀 직후 발사가 **정상** — 이번 축 B 오발사와는 다른 알림.

---

## 6. 사용자 설명용 4줄 요약

```
① 오래 앉으면 알려줘요       → 30분 스트레칭 · 50분 일어서기 · 120분 휴식 (축 A)
② 제자리에서 자주 바꿔요     → 10분간 안 흔들리면 "고여있다" 경고 (축 B)
③ 1분만 움직이면 초기화돼요  → 두 축 공통 리셋 (움직임 목표 60초)
④ 나쁜 자세는 따로 알려줘요  → 거북목·구부정 등 (다른 가족)
```

---

## 부록: 기본값·상수 요약

| 상수 | 값 | 파일 |
|---|---|---|
| micro / standup / deep | 30 / 50 / 120분 | breakTracker.ts (`break_config`) |
| movementGoalSecs | 60초 | breakTracker.ts |
| ABSENCE / RESTING / STANDING_RESET_SECS | 각 300초(5분) | breakTracker.ts |
| PRESENCE_GRACE_SECS | 30초 | presenceStabilizer.ts |
| variability window / threshold / movementThreshold / cooldown | 10분 / 5.0 / 6.5 / 15분 | variabilityTracker.ts |
| cumulative window / threshold / cooldown | 30분 / 0.25 / 15분 | cumulativeLoadTracker.ts |
| violation durationSecs (기본) | 5~8초 (유형별) | thresholds.ts |
| ALERT_COOLDOWN_MS | 5분 | violationTracker.ts |
| JITAI maxHoldSecs / interruptible YAW | 90초 / 0.26rad(~15°) | jitaiGate.ts |
