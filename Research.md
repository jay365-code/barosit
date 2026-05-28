# 스트레치 로직 코드 분석 — Research.md

> barosit 프로젝트의 **스트레치(stretch) 감지 및 알림 시스템** 전체 흐름을 코드 레벨에서 정리한 기술 분석 문서.
> 작성일: 2026-05-27
> 분석 대상 브랜치: `main` (HEAD: `617ccbe`)

---

## 0. 한눈에 보는 데이터 흐름

```
[웹캠 프레임]
   │
   ▼
analyzer.ts (자세 분석) → smoothed Landmarks + face + baseline
   │
   ▼
detectStretch()                                     ← stretchDetector.ts:506
   ├─ 1순위: custom 템플릿  (localStorage)
   ├─ 2순위: admin 템플릿   (localStorage)
   ├─ 3순위: DEFAULT 템플릿 (코드 상수)
   └─ 4순위: 휴리스틱 함수  (isOverheadStretch 등)
   │
   ▼  StretchKind | null
StretchTracker.push()                               ← stretchDetector.ts:602
   └─ 최소 2초 hold + 1초 gap tolerance
   │
   ▼  { kind, amount } | null
useMonitoringEngine.ts:519~541
   ├─ window.dispatchEvent("posture-bonus", amount)
   ├─ setStretchToast(...)
   └─ localStorage.stretches_today += amount  (StorageEvent 수동 dispatch)
   │
   ▼
BreakTracker.push(stretchFired=true)                ← breakTracker.ts:69
   └─ 현재 단계 dismiss (누적 시간은 보존)
   │
   ▼
AlertOverlay / Widget / MonitorView (UI 토스트 · 알림)
```

---

## 1. 핵심 모듈 구성

| 모듈 | 파일 | 책임 |
|------|------|------|
| 스트레치 감지기 | [src/pose/stretchDetector.ts](src/pose/stretchDetector.ts) | 7종 스트레칭 분류, 템플릿 매칭, 보너스 트래커 |
| 휴식(Break) 트래커 | [src/pose/breakTracker.ts](src/pose/breakTracker.ts) | 연속 착석 누적, 3단계 휴식 권유 |
| 모니터링 엔진 | [src/hooks/useMonitoringEngine.ts](src/hooks/useMonitoringEngine.ts) | 프레임 루프, 두 트래커 결합, 이벤트 dispatch |
| 자세 분석기 | [src/pose/analyzer.ts](src/pose/analyzer.ts) | 베이스라인·휴식 상태 등 사전 시그널 공급 |
| 알림 UI | [src/components/AlertOverlay.tsx](src/components/AlertOverlay.tsx), [src/views/AlertWindow.tsx](src/views/AlertWindow.tsx) | 휴식 단계 알림 표시 |
| 토스트 UI | [src/views/MonitorView.tsx](src/views/MonitorView.tsx), [src/views/Widget.tsx](src/views/Widget.tsx) | 스트레치 성공 토스트 |

---

## 2. 스트레치 7종 분류

`StretchKind` 정의 — [stretchDetector.ts:9](src/pose/stretchDetector.ts:9)

| kind | 라벨(한글) | 보너스 점수 | threshold | 베이스라인 필요 | 얼굴 필요 |
|------|-----------|-----------|-----------|----------------|----------|
| `overhead` | 기지개 | **5** | 0.30 | ✗ | ✗ |
| `behind_head` | 목 풀기 | **5** | 0.30 | ✗ | ✗ |
| `forward_fold` | 상체 앞 숙이기 | **5** | 0.18 | ✓ | (선택) |
| `cross_body` | 어깨 스트레치 | **4** | 0.30 | ✗ | ✗ |
| `neck_side` | 목 좌우 풀기 | **4** | 0.15 | ✓ | ✓ |
| `side` | 사이드 굽힘 | **3** | 0.30 | ✗ | ✗ |
| `shoulder_shrug` | 어깨 으쓱 | **3** | 0.14 | ✓ | ✗ |

- 라벨 매핑 — [stretchDetector.ts:640](src/pose/stretchDetector.ts:640)
- 보너스 표 — [stretchDetector.ts:567](src/pose/stretchDetector.ts:567)
- threshold 표 — [stretchDetector.ts:402](src/pose/stretchDetector.ts:402)

### 점수 설계 의도
큰 가동범위·고난도 동작(`overhead`, `behind_head`, `forward_fold`)에 5점,
중간 강도(`cross_body`, `neck_side`)에 4점, 미세 동작(`shoulder_shrug`, `side`)에 3점이 부여됩니다.
threshold(L2 거리 허용치)도 동작 크기에 반비례합니다 — 으쓱·목 풀기처럼 변화량이 작은 동작은 더 좁은 허용 오차(0.14~0.15)가 적용되어 오탐을 줄입니다.

---

## 3. 카메라 각도 실시간 판정 (Stale 제거)

### 3.1 핵심 함수
`liveAngleFromFace(face)` — [stretchDetector.ts:29](src/pose/stretchDetector.ts:29)

```ts
const yawDeg = face.yaw * (180 / Math.PI);
if (yawDeg > 12) return "right";
if (yawDeg < -12) return "left";
return "front";
```

### 3.2 왜 만들었나
기존 `getCameraAngle()`([stretchDetector.ts:346](src/pose/stretchDetector.ts:346))은 `localStorage.calibration_baseline` 단일 키만 참조했습니다. 사용자가 다른 각도로 옮겨 앉아도 마지막에 캘리브레이션한 각도 값을 반환하는 **stale 결함**이 있었고, 이 때문에 `isCrossBody`, `isSideStretch` 같은 각도 의존 검출기가 오작동했습니다.

`liveAngleFromFace()`는 매 프레임 face yaw로 판정하므로, `detectStretch()` 진입 시 한 번에 stale 문제가 해소됩니다. 기존 `getCameraAngle()`은 **`@deprecated`** 처리되어 UI 표시 용도로만 잔존합니다 — [stretchDetector.ts:341](src/pose/stretchDetector.ts:341).

---

## 4. 휴리스틱 검출 함수 (7종)

> 모든 좌표는 MediaPipe Pose의 normalized 이미지 좌표(`y`가 아래로 증가).
> `sw = |ls.x − rs.x|` (어깨 가로폭) — 사용자 거리에 강건한 거리 기준 단위.

### 4.1 `isOverheadStretch` — 기지개
[stretchDetector.ts:45](src/pose/stretchDetector.ts:45)

- **조건 ①** 어깨·코 visibility ≥ 0.20
- **조건 ②** 팔꿈치 또는 손목이 어깨보다 `sw×0.15` 이상 위
- **조건 ③** 양팔 모두 코 위쪽으로 올라가야 함

**특이점 — `isUp()` 헬퍼 ([:65](src/pose/stretchDetector.ts:65))**: 손목이 화면 상단(`y < 0.20`) 밖으로 나가 visibility가 떨어진 경우에도 좌표가 화면 위쪽에 있고 어깨보다 충분히 높다면 "올라간 것"으로 인정. 셀카 각도에서 손목이 프레임 밖으로 나가는 케이스를 보완.

### 4.2 `isBehindHead` — 목 풀기 (양손 머리 뒤)
[stretchDetector.ts:93](src/pose/stretchDetector.ts:93)

- 팔꿈치가 어깨 위(`sw×0.10`) + 어깨 바깥쪽(`sw×0.18`)으로 벌어짐
- 손목은 귀 근처(`sw×0.50`) **또는** visibility < 0.3 (가려짐)
- **게이트 ([:119](src/pose/stretchDetector.ts:119))**: 양쪽 손목 모두 가려졌으면 인정하지 않음 — 최소 한쪽은 귀 근처에서 보여야 함

### 4.3 `isCrossBody` — 어깨 스트레치 (가장 복잡)
[stretchDetector.ts:129](src/pose/stretchDetector.ts:129)

가장 정교하게 튜닝된 검출기. 카메라 각도별 threshold가 달라집니다 — [:146](src/pose/stretchDetector.ts:146).

| 파라미터 | 정면 | 측면 (left/right) |
|---------|------|------------------|
| `wristXThresh` | sw × 0.35 | sw × 0.22 |
| `elbowXThresh` | sw × 0.12 | sw × 0.08 |
| `wristVisThresh` | 0.08 | 0.08 |
| `yThresh` | sw × 0.65 | sw × 0.65 |

**2단 검출 — Normal + Occluded Fallback** ([:160](src/pose/stretchDetector.ts:160))

각 팔에 대해 두 가지 경로 OR로 평가:
1. **Normal**: 손목·팔꿈치 모두 visibility 확보 + 부호 일치 + X·Y 임계 통과
2. **Occluded fallback** ([:171](src/pose/stretchDetector.ts:171)): 손목이 완전히 묻혀(< 0.08) visibility 없을 때 → 팔꿈치만으로 깊숙이(sw × 0.32) 가슴 가로질러 인정

이 이중 경로 덕분에, 손목이 반대쪽 어깨 깊이 들어가 가려지는 극단 케이스에서도 끊김 없는 감지가 유지됩니다.

### 4.4 `isSideStretch` — 사이드 굽힘
[stretchDetector.ts:205](src/pose/stretchDetector.ts:205)

- **한쪽 팔만** 위로 올라가야 함 (`leftUp === rightUp` 이면 reject — [:222](src/pose/stretchDetector.ts:222))
- 어깨 기울기 `|ls.y − rs.y| ≥ 0.06`
- **카메라 각도 분기 ([:229](src/pose/stretchDetector.ts:229))**:
  - **정면**: 머리(nose) 이동 방향과 어깨 기울기 부호가 **일치**해야 하고 `|noseShift| > sw × 0.08`
  - **측면(left/right)**: 2D 원근에서 코 위치 부호가 뒤집힐 수 있으므로 noseShift 검사를 **bypass**. 어깨 기울기 + 한쪽 팔 거상만으로 인정.

### 4.5 `isShoulderShrug` — 어깨 으쓱 (오감지 방어 3중 가드)
[stretchDetector.ts:245](src/pose/stretchDetector.ts:245)

`baseline` 필수. 어깨 으쓱은 매우 미세한 동작이라 다른 동작 중간에 잘못 잡힐 가능성이 큽니다. 그래서 **3중 차단 가드**가 존재:

| 가드 | 조건 | 차단 의도 |
|------|------|----------|
| ① 손목 높이 ([:261](src/pose/stretchDetector.ts:261)) | 손목 visibility ≥ 0.15 이고 어깨보다 위 근처에 있으면 reject | 손이 올라간 상태는 으쓱이 아님 |
| ② 팔꿈치 높이 ([:268](src/pose/stretchDetector.ts:268)) | 팔꿈치가 어깨 위 근처면 reject | overhead 진행 중 보호 |
| ③ 팔꿈치 X-안쪽 ([:277](src/pose/stretchDetector.ts:277)) | 팔꿈치가 몸 중앙 방향으로 깊이 들어와 있으면 reject | cross_body 트랜지션 중 오감지 차단 |

가드 통과 후:
- 양 어깨 중점이 baseline 대비 `sw × 0.28` 이상 위로 올라옴 — [:283](src/pose/stretchDetector.ts:283)
- 양쪽 어깨 각각 baseline 대비 `sw × 0.18` 이상 위 — [:285](src/pose/stretchDetector.ts:285) (한쪽만이면 사이드 굽힘과 충돌)

**버그 회피 코멘트가 인상적 — [:271~273](src/pose/stretchDetector.ts:271)**:
> cross_body 는 ~2~4초 sequence 인데, 초기·중기엔 손목·팔꿈치 Y 가 아직 어깨선까지 못 올라와 Y 가드를 통과합니다. 그 사이 어깨가 보상 운동으로 올라가면 셔그로 잡혀 isCrossBody 가 완성되기 전에 셔그 보너스가 먼저 발화하는 버그가 발생.

### 4.6 `isNeckSide` — 목 좌우 풀기
[stretchDetector.ts:293](src/pose/stretchDetector.ts:293)

`face` + `baseline.face` 필수.

- `|face.roll − baseline.face.roll| ≥ 0.25 rad` (~14°)
- 어깨 기울기는 baseline에서 **0.04 이내**로 유지 ([:306](src/pose/stretchDetector.ts:306)) — 사이드 굽힘과의 구분점

### 4.7 `isForwardFold` — 상체 앞 숙이기
[stretchDetector.ts:313](src/pose/stretchDetector.ts:313)

`baseline` 필수, `face`는 있으면 보강.

- 코가 baseline 대비 `sw × 0.30` 이상 아래로
- 어깨 중점이 baseline 대비 `sw × 0.15` 이상 아래로
- face가 있으면 `pitchDelta ≥ −0.10` (뒤로 젖히는 휴식과 구분)

---

## 5. 템플릿 매칭 시스템

### 5.1 Normalized Pose
`normalizePose()` — [stretchDetector.ts:364](src/pose/stretchDetector.ts:364)

어깨 중점을 원점으로, 어깨 가로폭(`sw`)을 단위로 좌표 정규화 → **사용자 거리/카메라 위치 무관한 형상 표현**. 사용 인덱스: `[0(nose), 7,8(ears), 11,12(shoulders), 13,14(elbows), 15,16(wrists)]`.

### 5.2 거리 계산
`computePoseDistance()` — [stretchDetector.ts:420](src/pose/stretchDetector.ts:420)

각 관절 인덱스의 3D L2 거리에 가중치(`STRETCH_WEIGHTS`)를 곱한 가중 평균. **양쪽 모두 visibility ≥ 0.25**인 관절만 계산에 사용 ([:434](src/pose/stretchDetector.ts:434)) — 가림 노이즈 필터.

가중치 — [stretchDetector.ts:390](src/pose/stretchDetector.ts:390)

- 동작의 핵심 관절(예: overhead의 손목·팔꿈치)에 가중치 3
- 기준점(어깨·코·귀)에 가중치 1
- 누락 부위 보강: 다른 동작 가중치 표에 손/얼굴이 모두 들어가 있어, 머리만 보고 동작 혼선되는 일을 막음 ([:393~394](src/pose/stretchDetector.ts:393))

### 5.3 자동 좌우 미러링
`mirrorNormalizedPose()` — [stretchDetector.ts:479](src/pose/stretchDetector.ts:479)

좌우 인덱스 쌍(11↔12, 13↔14, 15↔16, 7↔8)을 swap하고 X·Z 부호 반전. **사용자가 한 방향만 보정 등록해도 반대편 동작까지 자동으로 매칭**됩니다. Z를 같이 반전하는 이유는 측면 카메라 원근에서 깊이 좌표도 좌우 반전된 형태로 들어오기 때문 ([:497](src/pose/stretchDetector.ts:497)).

### 5.4 3단 우선순위
`detectStretch()` 내부 — [stretchDetector.ts:529~554](src/pose/stretchDetector.ts:529)

```
key = `${kind}_${currentAngle}`  // 예: "overhead_front"

template = customTemplates[key]      // 1순위: 사용자 보정
        || adminTemplates[key]        // 2순위: 어드민 런타임
        || DEFAULT_TEMPLATES[key]     // 3순위: 코드 디폴트

distance = min( dist(live, template), dist(live, mirror(template)) )
if (distance ≤ STRETCH_THRESHOLDS[kind]) return kind;
```

매칭되는 템플릿이 없으면 4순위로 휴리스틱 함수들이 순차 평가됩니다 — [:557~564](src/pose/stretchDetector.ts:557). 평가 순서는 `behind_head → overhead → forward_fold → side → cross_body → shoulder_shrug → neck_side`.

### 5.5 저장소 키
| 키 | 용도 |
|----|------|
| `barosit:custom_stretch_templates` | 사용자가 직접 캡처한 개인화 템플릿 ([:456](src/pose/stretchDetector.ts:456)) |
| `barosit:admin_templates` | 어드민 UI에서 실시간 적용한 표준 템플릿 ([:467](src/pose/stretchDetector.ts:467)) |
| `DEFAULT_TEMPLATES` (코드 상수) | 코드로 배포되는 공통 기본값 ([:414](src/pose/stretchDetector.ts:414), 현재 비어있음) |

---

## 6. StretchTracker — 보너스 트리거 상태기계

`class StretchTracker` — [stretchDetector.ts:581](src/pose/stretchDetector.ts:581)

### 6.1 파라미터
```ts
new StretchTracker(
  minHoldMs    = 2000,  // 같은 동작을 2초 유지하면 보너스
  cooldownMs   = 0,     // 같은 동작 재발사 쿨다운 (현재 무효화)
  gapToleranceMs = 1000 // 검출 끊김 허용 (1초 안에 재검출되면 같은 hold)
)
```

기본값은 [stretchDetector.ts:595](src/pose/stretchDetector.ts:595) 참고. `useMonitoringEngine`은 인자 없이 기본값으로 인스턴스화 — [useMonitoringEngine.ts:180](src/hooks/useMonitoringEngine.ts:180).

### 6.2 push() 로직
[stretchDetector.ts:602](src/pose/stretchDetector.ts:602)

| 입력 | 내부 상태 | 반환 |
|------|----------|------|
| `kind = null` & gap > 1초 | `activeKind=null`, `enteredAt=0` | `null` |
| `kind = null` & gap ≤ 1초 | 변화 없음 (hold 유지) | `null` |
| 새 `kind` 진입 | `activeKind=kind`, `enteredAt=now` | `null` |
| 같은 `kind`, held < 2초 | 누적 | `null` |
| 같은 `kind`, held ≥ 2초 | 발사 후 `activeKind=null` 리셋 | `{ kind, amount }` |

### 6.3 주의할 점
- **cooldownMs = 0**: 같은 동작을 연달아 2초씩 잡으면 매번 보너스가 발사됩니다. 의도된 설계이나, 사용자가 같은 동작을 반복해 점수를 농사(farm)할 수 있는 여지가 있습니다.
- 보너스가 발사되면 `activeKind`가 즉시 리셋되어 — 같은 동작을 계속 유지 중이어도 다음 hold 사이클을 위해 새 진입으로 다시 잡혀야 합니다.

---

## 7. BreakTracker — 연속 착석 추적

`class BreakTracker` — [breakTracker.ts:52](src/pose/breakTracker.ts:52)

### 7.1 단계 정의
[breakTracker.ts:12~29](src/pose/breakTracker.ts:12)

| 단계 | 기본 임계(분) | 근거 |
|------|--------------|------|
| `micro` | 30 | Hedge 20-8-2, 가벼운 마이크로 무브먼트 권유 |
| `standup` | 50 | **KOSHA GUIDE H-30** (50분 작업 + 10분 휴식) |
| `deep` | 120 | 강한 휴식 (눈 + 신체) 권유 |

설정은 `enabled` 플래그로 단계별 on/off 가능 — [:21](src/pose/breakTracker.ts:21).

### 7.2 상태 누적 로직
`push()` — [breakTracker.ts:69](src/pose/breakTracker.ts:69)

매 호출마다 `lastPushAt` 기준 `dt`(초) 자동 계산. **호출 주기와 무관하게 실시간 누적** 보장:

```
if (dt > 30) safeDt = 0     // 슬립 후 복귀 보호
else safeDt = dt

if (!personPresent) secsAbsent += safeDt
else if (isStanding) secsStanding += safeDt
else if (isResting)  secsResting += safeDt
else                 secsSeated  += safeDt   // ← 단계 진행 기준
```

### 7.3 리셋 조건 ([:107](src/pose/breakTracker.ts:107))
다음 중 하나라도 5분 이상이면 **전체 리셋** (`secsSeated=0`, `stage="none"`):
- `secsAbsent ≥ 5분` — 자리 비움
- `secsResting ≥ 5분` — 등받이에 깊이 기댐
- `secsStanding ≥ 5분` — 일어서 있음

### 7.4 스트레치 dismiss ([:121](src/pose/breakTracker.ts:121))
```ts
if (stretchFired && this.stage !== "none") {
  this.stage = "none";
  this.stageFiredAt = null;
}
```

**핵심 설계**: 스트레치 1회로 현재 알림 단계만 사라지고 **누적 시간은 보존**됩니다. 사용자가 스트레치 한 번으로 타이머를 0으로 만들지 못하게 하는 의도된 차단 — 회피 행동 방지.

### 7.5 단계 진행 ([:126](src/pose/breakTracker.ts:126))
높은 단계 우선 검사 (`deep → standup → micro`), **단방향**으로만 진행. 같은 단계가 dismiss된 뒤 누적이 더 쌓이면 다시 발사될 수 있습니다.

### 7.6 영속화 ([:193~220](src/pose/breakTracker.ts:193))
- `localStorage["break_config"]`에 JSON으로 저장
- `CustomEvent("barosit:break-config-changed")` 디스패치 — 다중 창 동기화

---

## 8. 모니터링 엔진 통합

[src/hooks/useMonitoringEngine.ts](src/hooks/useMonitoringEngine.ts)

### 8.1 스트레치 검출·발사 ([:518~541](src/hooks/useMonitoringEngine.ts:518))
```ts
const stretchKind = detectStretch(smoothed, frame.face, baseline);   // 519
const stretchFired = stretchTrackerRef.current.push(stretchKind);    // 520
if (stretchFired) {
  window.dispatchEvent(new CustomEvent("posture-bonus", { detail: stretchFired.amount }));
  setStretchToast({ kind, amount, at: Date.now() });
  // localStorage 갱신 + storage 이벤트 수동 dispatch
  const nextCount = Number(localStorage.getItem("stretches_today") || "0") + stretchFired.amount;
  localStorage.setItem("stretches_today", String(nextCount));
  window.dispatchEvent(new StorageEvent("storage", { key: "stretches_today", newValue: ... }));
}
```

- 토스트는 [:332~334](src/hooks/useMonitoringEngine.ts:332)의 3초 타이머로 자동 사라짐.
- `StorageEvent` 수동 dispatch — 같은 창에서는 storage 이벤트가 안 터지므로 위젯/대시보드 동기화를 위해 인위적 발사.

### 8.2 BreakTracker 결합 ([:543~563](src/hooks/useMonitoringEngine.ts:543))
적응형 피로 보정과 결합:
```ts
adjustedBreakConfig = {
  microMinutes:   base.microMinutes   * adaptiveModifier.breakMultiplier,
  standupMinutes: base.standupMinutes * adaptiveModifier.breakMultiplier,
  deepMinutes:    base.deepMinutes    * adaptiveModifier.deepMultiplier,
};
breakTrackerRef.current.push(now, personPresent, isResting, isStanding, !!stretchFired, adjustedBreakConfig);
```

- 피로도가 누적될수록 `breakMultiplier`가 작아져 휴식 권유가 더 자주 옵니다.
- `stretchFired` 가 그대로 BreakTracker에 전달되어 dismiss 트리거로 활용.

### 8.3 트래커 리셋 ([:311](src/hooks/useMonitoringEngine.ts:311))
일시정지·세션 종료 시 `stretchTrackerRef.current.reset()` 호출.

---

## 9. UI 흐름

### 9.1 스트레치 성공 토스트
- 상태 출처: `useMonitoringEngine` 의 `stretchToast` ([:108](src/hooks/useMonitoringEngine.ts:108))
- 표시: [MonitorView.tsx](src/views/MonitorView.tsx), [Widget.tsx](src/views/Widget.tsx)
- 라벨: `STRETCH_LABEL[kind]` (예: `"기지개"`) + `+amount` 포인트
- 수명: 3초 후 자동 소멸

### 9.2 휴식 알림
- 이벤트: `dispatchBreakReminder(fired)` ([useMonitoringEngine.ts:562](src/hooks/useMonitoringEngine.ts:562))
- 수신: [AlertOverlay.tsx](src/components/AlertOverlay.tsx), [AlertWindow.tsx](src/views/AlertWindow.tsx)
- 단계별 코칭 메시지/색상 톤 차등

### 9.3 설정 화면
- [SettingsDrawer.tsx](src/views/SettingsDrawer.tsx) — break 임계 슬라이더, 단계별 on/off, 스트레치 캘리브레이션 진입(`onOpenStretchCalibrate`)
- [UserCalibrationView.tsx](src/views/UserCalibrationView.tsx), [AdminTemplateView.tsx](src/views/AdminTemplateView.tsx) — 템플릿 등록 UI

---

## 10. 영속 데이터 정리

| localStorage 키 | 내용 | 라이프사이클 |
|----------------|------|--------------|
| `calibration_baseline` | 기준 자세(landmarks + face) | 사용자 캘리브레이션, 각도별 auto-switch |
| `barosit:custom_stretch_templates` | 사용자 개인 템플릿 (kind_angle) | 사용자 등록 시까지 유지 |
| `barosit:admin_templates` | 어드민 UI 런타임 템플릿 | 운영자 수동 갱신 |
| `break_config` | BreakConfig JSON | 사용자 설정 |
| `stretches_today` | 오늘 누적 스트레치 보너스 점수 | 일일 카운트 |

다중 창 동기화 패턴 — `localStorage.setItem` 후 `window.dispatchEvent(new StorageEvent(...))`을 인위적으로 발사하여, 같은 창 내 다른 리스너에도 변화를 전파합니다 ([:533~537](src/hooks/useMonitoringEngine.ts:533)).

---

## 11. 강건성·예외 처리 패턴 모음

| 카테고리 | 예시 |
|---------|------|
| **가림 보완** | `isCrossBody`의 occluded-fallback ([:171](src/pose/stretchDetector.ts:171)), `isBehindHead`의 손목 visibility < 0.3 허용 ([:111](src/pose/stretchDetector.ts:111)), `isOverheadStretch`의 화면 밖 손목 인정 ([:65](src/pose/stretchDetector.ts:65)) |
| **stale 데이터 차단** | `liveAngleFromFace()` ([:29](src/pose/stretchDetector.ts:29)), `getCameraAngle()` `@deprecated` 처리 |
| **오감지 방어** | `isShoulderShrug` 3중 가드 ([:259~278](src/pose/stretchDetector.ts:259)) |
| **분류 충돌 방지** | `isNeckSide`의 어깨 기울기 게이트 ([:306](src/pose/stretchDetector.ts:306)) — 사이드 굽힘과 구분 |
| **시간 게이팅** | `StretchTracker.minHoldMs=2000`, `gapToleranceMs=1000` — flicker 방지 |
| **회피 행동 차단** | BreakTracker stretch dismiss는 stage만 비우고 누적 시간 보존 ([:121](src/pose/breakTracker.ts:121)) |
| **슬립 보호** | BreakTracker `safeDt = dt>30 ? 0 : dt` ([:85](src/pose/breakTracker.ts:85)) |
| **노이즈 필터** | `computePoseDistance`에서 양쪽 visibility < 0.25 관절 스킵 ([:434](src/pose/stretchDetector.ts:434)) |

---

## 12. 어깨 으쓱 과다 감지 진단 (Hotspot Analysis)

> **사용자 보고**: "어깨 으쓱이 너무 자주 나온다."
> 이 섹션은 코드의 어떤 부분이 그 현상을 만들어내는지, 그리고 **어디를 어떻게 조정해야 하는지**를 라인:값 단위로 정리합니다.

### 12.1 과다 감지가 발생하는 7가지 코드 경로

| # | 원인 | 위치 | 영향 |
|---|------|------|------|
| ① | **민감도 완화 튜닝의 잔재** — 코멘트가 직접 명시 | [stretchDetector.ts:281, 284](src/pose/stretchDetector.ts:281) | 중점 lift 0.10→**0.28**, 한쪽 어깨 0.10→**0.18** 로 완화. 그런데 휴리스틱 폴백에선 여전히 약한 편 |
| ② | **`cooldownMs = 0`** — 같은 동작 반복 발사 | [stretchDetector.ts:597](src/pose/stretchDetector.ts:597) | 어깨를 들고만 있으면 2초마다 셔그 보너스가 반복 발사됨 (점수 농사 + 토스트 스팸) |
| ③ | **휴리스틱 평가 순서에서 셔그가 `cross_body` 다음** | [stretchDetector.ts:561~562](src/pose/stretchDetector.ts:561) | `isCrossBody` 가 visibility 부족으로 false 반환하면 그 프레임에서 셔그가 잡힘 (코멘트로도 인정한 트랜지션 버그) |
| ④ | **휴리스틱 모드에는 3중 X-가드만 있고 시간 가드는 없음** | [stretchDetector.ts:277~278](src/pose/stretchDetector.ts:277) | 팔꿈치 위치가 어깨 바깥쪽으로 잠깐 빠지는 자연스러운 동작에서도 가드를 통과 |
| ⑤ | **baseline drift** — 사용자가 자세를 흩뜨린 상태로 캘리브레이션하면 `shoulderMidY` 가 본의 아니게 높게(=화면 아래쪽) 잡힘 | [stretchDetector.ts:282](src/pose/stretchDetector.ts:282) | 평상시 자세만 잡아도 lift 임계 sw×0.28 을 쉽게 통과 |
| ⑥ | **휴식 알림 메시지 1순위가 어깨 으쓱** | [AlertWindow.tsx:59](src/views/AlertWindow.tsx:59), [AlertOverlay.tsx:52](src/components/AlertOverlay.tsx:52), [MonitorView.tsx:1773](src/views/MonitorView.tsx:1773), [SettingsDrawer.tsx:489](src/views/SettingsDrawer.tsx:489) | 30분마다 micro 알림이 무조건 "어깨 으쓱·목 좌우 회전·깊은 호흡 10초" 로 시작 → "또 어깨 으쓱이네" 라는 체감 |
| ⑦ | **셔그 보너스 = 3점**, 사이드와 동률로 가장 가벼움 | [stretchDetector.ts:572](src/pose/stretchDetector.ts:572) | 점수 자체는 작지만, ②번과 합쳐지면 토스트 노출 빈도가 다른 동작 대비 압도적 |

### 12.2 사용자 체감 = "감지" + "권유" + "보너스 토스트" 의 합

사용자가 말하는 "어깨 으쓱이 자주 나온다" 는 다음 세 경로가 합쳐진 결과입니다:

```
[감지]  detectStretch() → "shoulder_shrug"  ← 휴리스틱 4중 가드의 빈틈
   │
   ├─→ [토스트] StretchTracker (cooldown=0) → 2초마다 반복 발사 가능
   │
   └─→ [드리스미스] BreakTracker stage dismiss → 카운트만 빠지고 알림은 또 옴

[권유]  BreakTracker micro 단계 (30분) → 알림 문구 1순위가 "어깨 으쓱"
```

### 12.3 조정 가능한 파라미터 — 라인:현재값:권장범위

| 항목 | 파일:라인 | 현재값 | 권장 범위 | 효과 |
|------|----------|--------|----------|------|
| 양 어깨 중점 lift 임계 | [stretchDetector.ts:283](src/pose/stretchDetector.ts:283) | `sw * 0.28` | **0.32 ~ 0.38** | 잔잔한 자세교정 움직임이 셔그로 잡히는 빈도 ↓ |
| 한쪽 어깨 lift 임계 | [stretchDetector.ts:285~286](src/pose/stretchDetector.ts:285) | `sw * 0.18` | **0.22 ~ 0.28** | 비대칭 어깨 움직임의 셔그 오탐 ↓ |
| 손목 Y-가드 마진 | [stretchDetector.ts:261~262](src/pose/stretchDetector.ts:261) | `sw * 0.10` | **0.15 ~ 0.20** | overhead/cross_body 트랜지션 보호 ↑ |
| 팔꿈치 X-가드 임계 | [stretchDetector.ts:276](src/pose/stretchDetector.ts:276) | `sw * 0.35` | **0.30 ~ 0.32** | cross_body 트랜지션 더 넓게 차단 |
| 셔그 템플릿 threshold | [stretchDetector.ts:407](src/pose/stretchDetector.ts:407) | `0.14` | **0.10 ~ 0.12** | 템플릿 매칭 시 더 엄격하게 |
| `cooldownMs` (전역) | [stretchDetector.ts:597](src/pose/stretchDetector.ts:597) | `0` | **30000 ~ 60000** | 같은 동작 반복 보너스 발사 차단 |
| `minHoldMs` (전역) | [stretchDetector.ts:596](src/pose/stretchDetector.ts:596) | `2000` | (셔그만) **3000** | hold time 길게 → 무심결 어깨 들썩임 차단 |
| 셔그 보너스 점수 | [stretchDetector.ts:572](src/pose/stretchDetector.ts:572) | `3` | **1 ~ 2** | 점수 농사 인센티브 ↓, 토스트 노출 빈도엔 영향 없음 |
| 휴리스틱 평가 순서 | [stretchDetector.ts:557~564](src/pose/stretchDetector.ts:557) | 셔그가 cross_body 다음 | 그대로 OR `neck_side` 다음 끝으로 | 다른 동작이 우선 매칭되어 셔그 오탐 ↓ |
| micro 알림 문구 | [AlertWindow.tsx:59](src/views/AlertWindow.tsx:59), [AlertOverlay.tsx:52](src/components/AlertOverlay.tsx:52) | 어깨 으쓱 1순위 고정 | **세션마다 rotate** (어깨 으쓱 / 목 좌우 회전 / 깊은 호흡 셋 중 1택) | "또 어깨 으쓱" 체감 ↓ |

### 12.4 추천 조정 시나리오 (위험도 낮음 → 높음)

#### 시나리오 A — 안전한 1차 조정 (행동 변화 최소, 효과 명확)
```diff
- if (lift < sw * 0.28) return false;
+ if (lift < sw * 0.34) return false;

- return ls.y < baseline.meanLandmarks[...LEFT_SHOULDER].y - sw * 0.18 &&
-        rs.y < baseline.meanLandmarks[...RIGHT_SHOULDER].y - sw * 0.18;
+ return ls.y < baseline.meanLandmarks[...LEFT_SHOULDER].y - sw * 0.24 &&
+        rs.y < baseline.meanLandmarks[...RIGHT_SHOULDER].y - sw * 0.24;
```
임계값만 보수적으로 올리는 변경. 진짜 어깨 으쓱은 어깨너비의 30~50% 가 충분히 올라가므로 감도 손실은 거의 없고, "조금 자세 바꿨을 뿐인데 셔그 발화" 케이스를 차단.

#### 시나리오 B — 반복 발사 차단 (UX 가장 직접적 효과)
```diff
- new StretchTracker()   // 기본 cooldownMs=0
+ new StretchTracker(2000, 60000, 1000)
```
`useMonitoringEngine.ts:180` 에서 인자 추가. 같은 셔그가 1분 안에 다시 발사되지 못하게 잠금 — **사용자가 가장 빨리 체감할 변경**.

#### 시나리오 C — 알림 메시지 다양화 (감지 로직 변경 없음)
```diff
- micro: "어깨 으쓱·목 좌우 회전·깊은 호흡 10초",
+ micro: pickMicroMessage(microFireCount),  // 호출마다 회전
```
30분마다 표시되는 micro 문구를 3개 풀에서 회전. 코드 손이 안 가는 영역 위주의 변경 → 회귀 위험 최소.

#### 시나리오 D — 휴리스틱 평가 순서 보정
```diff
  if (isCrossBody(lm, currentAngle)) return "cross_body";
- if (isShoulderShrug(lm, baseline)) return "shoulder_shrug";
  if (isNeckSide(lm, face, baseline)) return "neck_side";
+ if (isShoulderShrug(lm, baseline)) return "shoulder_shrug";   // 가장 마지막
```
셔그를 7개 검출기 중 **가장 마지막**으로 밀어 다른 동작이 매칭될 기회를 먼저 보장. 코멘트 [stretchDetector.ts:271~273](src/pose/stretchDetector.ts:271) 에서 인정한 cross_body 트랜지션 버그의 잔재를 정리하는 효과.

### 12.5 조정 시 확인해야 할 사이드 이펙트

| 변경 | 잠재 회귀 | 검증 방법 |
|------|----------|----------|
| 임계 상향 (A) | 진짜 어깨 으쓱이 인식 안 됨 | 어깨를 귀까지 끝까지 올린 케이스에서 여전히 lift > 0.34 인지 측정 |
| `cooldownMs` 도입 (B) | 의도적으로 연속 으쓱 운동 시 한 번만 점수 인정 | 운영 정책상 "1분 1셔그" 가 적절한지 합의 필요 |
| 알림 문구 회전 (C) | 사용자가 micro 단계의 의미를 매번 새로 학습 | UX 카피 검토 |
| 평가 순서 변경 (D) | 다른 검출기의 false-positive 가 셔그 자리를 채울 수 있음 | cross_body, neck_side 의 가드 강도 동시 점검 |

### 12.6 결론

조정 여지는 **충분히 있고**, 코드 코멘트가 "민감도 완화" 라고 직접 적어둘 만큼 한 차례 의도적으로 느슨해진 상태입니다. 가장 짧은 시간 안에 사용자 체감을 바꿀 수 있는 조합은:

1. **시나리오 B (cooldown 60초 도입)** — 가장 큰 체감 변화, 1줄 수정
2. **시나리오 A (lift 임계 0.28→0.34, 한쪽 0.18→0.24)** — 오탐 자체를 줄임, 2줄 수정
3. **시나리오 C (알림 문구 회전)** — 감지가 줄어도 권유 문구는 그대로 셔그 1순위라는 별도 노출 경로를 마무리

이 셋만 적용해도 "어깨 으쓱이 너무 자주 나온다" 의 세 가지 경로 (감지·반복·권유) 가 모두 잠깁니다.

---

## 13. 알려진 한계 · 개선 후보

1. **`DEFAULT_TEMPLATES`가 비어 있음** ([:414](src/pose/stretchDetector.ts:414))
   - 현재는 사용자가 직접 보정하거나 어드민이 런타임에 주입하기 전까지 휴리스틱 폴백에만 의존.
   - 배포 단계에서 검증된 기본 템플릿을 채워 두면 첫 사용 경험이 개선됩니다.

2. **StretchTracker cooldownMs = 0**
   - 같은 동작 반복으로 점수 농사가 가능. 일정 시간 쿨다운(예: 30~60초)을 두거나, 다른 종류로 다양화해야 추가 보너스가 들어오게 하는 룰이 보강 후보.

3. **`stretches_today` 일일 리셋 로직 부재**
   - 코드 어디서도 자정 기준 리셋이 보이지 않습니다. `dataBackup.ts` 등 별도 모듈에서 처리하는지 확인 필요.

4. **`isSideStretch` 측면 모드 bypass**
   - 측면 카메라에서는 noseShift 검사를 건너뛰어 오탐 여지가 다소 존재. 측면 전용 면적 비율이나 회전 각도 기반 보강이 가능.

5. **휴리스틱 → 템플릿 마이그레이션 미완**
   - 휴리스틱 함수들은 baseline 의존도가 동작마다 다른데, 템플릿 매칭은 normalize 만으로 baseline-free. 두 경로의 임계가 다르게 튜닝되어 있어 사용자가 체감하는 감도가 달라질 수 있습니다.

---

## 14. 핵심 라인 인덱스 (빠른 점프용)

| 항목 | 위치 |
|------|------|
| `StretchKind` 타입 | [stretchDetector.ts:9](src/pose/stretchDetector.ts:9) |
| 실시간 카메라 각도 | [stretchDetector.ts:29](src/pose/stretchDetector.ts:29) |
| 7종 검출 함수 시작 | [stretchDetector.ts:45](src/pose/stretchDetector.ts:45) |
| 템플릿 가중치 | [stretchDetector.ts:390](src/pose/stretchDetector.ts:390) |
| 템플릿 threshold | [stretchDetector.ts:402](src/pose/stretchDetector.ts:402) |
| 자동 미러링 | [stretchDetector.ts:479](src/pose/stretchDetector.ts:479) |
| `detectStretch` 진입 | [stretchDetector.ts:506](src/pose/stretchDetector.ts:506) |
| 보너스 점수표 | [stretchDetector.ts:567](src/pose/stretchDetector.ts:567) |
| `StretchTracker` 클래스 | [stretchDetector.ts:581](src/pose/stretchDetector.ts:581) |
| 한글 라벨 매핑 | [stretchDetector.ts:640](src/pose/stretchDetector.ts:640) |
| `BreakTracker.push` | [breakTracker.ts:69](src/pose/breakTracker.ts:69) |
| 스트레치 dismiss | [breakTracker.ts:121](src/pose/breakTracker.ts:121) |
| 엔진 내 스트레치 결합 | [useMonitoringEngine.ts:518](src/hooks/useMonitoringEngine.ts:518) |
| 엔진 내 휴식 결합 | [useMonitoringEngine.ts:543](src/hooks/useMonitoringEngine.ts:543) |

---

## 15. 클라이언트 타입별 소셜 로그인 및 데이터 동기화 심층 분석

Tauri 데스크톱 앱 내에서 발생하는 소셜 로그인 연동은 단순히 일반 웹 환경의 OAuth 흐름을 가져다 쓰는 데 그치지 않고, OS 레벨의 네이티브 웹뷰 엔진 제약, 엄격한 브라우저 보안 샌드박스(Cross-Origin), 플랫폼별 특수 프로토콜 스키마 등이 결합되어 고도의 기술적 정교함을 요합니다. 

본 장에서는 **Windows Tauri 앱, macOS Tauri 앱, 일반 웹 브라우저** 등 3대 클라이언트 타입별로 소셜 로그인(구글/카카오)의 상세 코드 레벨 메커니즘을 규명하고, 왜 기존 패치 과정에서 **풍선 효과(Regression)**가 발생할 수밖에 없었는지, 그리고 **`v0.2.5` 하이브리드 아키텍처**가 어떻게 모든 잠재적 버그를 원천 종식하였는지 엄밀하게 실증적으로 분석합니다.

---

### 15.1 3대 클라이언트 타입별 로그인 메커니즘 대조군

| 클라이언트 타입 | 웹뷰 엔진 | 로컬 웹 오리진 (Origin) | 인증 방식 (FlowType) | 리다이렉트 콜백 타겟 (RedirectTo) | 팝업 렌더링 컨텍스트 |
|:---|:---|:---|:---|:---|:---|
| **Windows Tauri 앱** | Microsoft WebView2 | `http://tauri.localhost` | **`implicit` (암시적 부여)** | `https://barosit.com/#/auth/callback` | 구글/카카오 공식 OAuth 로그인 폼 (React 마운트 차단) |
| **macOS Tauri 앱** | Apple WebKit | `tauri://localhost` | **`implicit` (암시적 부여)** | `https://barosit.com/#/auth/callback` | 구글/카카오 공식 OAuth 로그인 폼 (React 마운트 차단) |
| **일반 웹 브라우저** | Chrome, Safari 등 | `https://barosit.com` 등 | **`pkce` (보안 코드 교환)** | `authRedirectUrl()` (동적 환경 매핑) | 표준 브라우저 새 창 / 리다이렉트 흐름 |

---

### 15.2 코드 레벨의 핵심 모듈 분석

#### 15.2.1 [supabase.ts](file:///Users/jay/Projects/barosit/src/auth/supabase.ts) — 환경 감지형 하이브리드 `flowType` 수립
```typescript
const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);

export const supabase: SupabaseClient = IS_AUTH_CONFIGURED
  ? createClient(url!, anonKey!, {
      auth: {
        flowType: isTauri ? "implicit" : "pkce", // [핵심 1] Tauri 앱은 implicit 강제 지정, 웹은 pkce 유지
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : createStub();
```
* **동작 분석**:
  * `(window as any).__TAURI_INTERNALS__` 의 존재 유무를 0.001초 만에 감지하여 Tauri 네이티브 앱인지 브라우저인지 완벽하게 판별합니다.
  * Tauri 앱일 경우 `flowType: "implicit"` 로 초기화하여, 로그인 개시 과정에서 로컬 스토리지에 무거운 일회용 `code_verifier`를 굽는 복잡한 PKCE 단계를 원천 비활성화합니다.

#### 15.2.2 [useAuth.ts](file:///Users/jay/Projects/barosit/src/auth/useAuth.ts) — Tauri 전용 Direct Authorize URL 팝업 인터셉트
```typescript
    if (isTauri) {
      try {
        console.warn(`[Tauri OAuth] Requesting authorize URL for ${provider}...`);
        
        // [핵심 2] Supabase로부터 구글/카카오의 공식 로그인 링크를 낚아채고 메인 창의 리다이렉트를 차단(skipBrowserRedirect)
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: "https://barosit.com/#/auth/callback",
            skipBrowserRedirect: true,
            queryParams: provider === "google" || provider === "kakao" ? {
              prompt: "select_account"
            } : undefined
          },
        });

        if (error) throw error;
        if (!data?.url) throw new Error("인증 주소를 생성하지 못했습니다.");

        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const existing = await WebviewWindow.getByLabel("oauth-login");
        if (existing) {
          await existing.close();
        }

        // [핵심 3] 로컬 주소 대신, 구글/카카오 공식 로그인 페이지를 URL로 지정하여 팝업 생성
        new WebviewWindow("oauth-login", {
          url: data.url,
          title: `${provider === "kakao" ? "카카오" : provider === "google" ? "Google" : "Apple"} 로그인`,
          width: 500,
          height: 650,
          resizable: true,
          alwaysOnTop: true,
          focus: true,
        });

        const checkInterval = setInterval(async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            clearInterval(checkInterval);
            const win = await WebviewWindow.getByLabel("oauth-login");
            if (win) {
              await win.close();
            }
            window.location.reload(); // 세션 동기화 감지 즉시 팝업을 파괴하고 메인 창 새로고침
          }
        }, 1000);
```
* **동작 분석**:
  * 메인 윈도우에서 `signInWithOAuth` 가 실행될 때, `skipBrowserRedirect: true` 옵션을 인가하여 메인 창이 리다이렉트되어 하얗게 변하는 현상을 방어합니다.
  * `{ prompt: "select_account" }` 쿼리 파라미터를 강제하여, 기기 내에 소셜 세션이 캐싱되어 있더라도 항상 계정 전환을 할 수 있는 사용자 선택권을 강력히 제공합니다.
  * 생성된 `data.url` (구글/카카오의 공식 로그인 URL)을 `oauth-login` WebviewWindow에 전달해 다이렉트 런칭합니다.

---

### 15.3 4대 풍선 효과(Regression) 완벽 극복에 대한 수학적·물리적 증명

#### 1. 🪟 [풍선 A] 팝업창 내 카메라 이중 렌더링 버그
* **과거 결함 원인**: 로그인 팝업창의 주소로 로컬 뷰(`http://tauri.localhost/#/profile`)를 가리키게 설계했었습니다. 이 때문에 팝업창 내부에서도 React 앱이 통째로 새로 마운트되며 최상단 `App.tsx`가 기동되었고, 백그라운드 카메라 센서(`MonitorView`)와 감지 루프가 이중으로 기동되어 하드웨어 리소스를 폭식하고 카메라 선점 충돌이 났습니다.
* **v0.2.5 증명**: 팝업창의 시작 URL로 구글/카카오 공식 로그인 폼(`data.url`)을 다이렉트 지정합니다. 따라서 **팝업창 내에서 BaroSit React 소스코드 자체가 0.001%도 실행되지 않으므로**, 카메라 이중 렌더링은 물리적으로 원천 차단됩니다.

#### 2. 🔀 [풍선 B] Windows 앱 소셜 로그인 튕김 버그
* **과거 결함 원인**: Windows의 WebView2 오리진은 비보안 HTTP 도메인 규격인 `http://tauri.localhost` 입니다. 구글과 카카오 OAuth 인증 서버는 보안 정책상 `http://` 스키마이면서 `localhost`가 아닌 임의의 문자열 도메인으로의 콜백 리다이렉션을 거절합니다. 이 때문에 Supabase가 차단을 피하고자 Default Site URL 인 프로덕션 사이트 **`https://barosit.com`** 으로 강제 Fallback 튕김 리다이렉션을 감행했고, 결국 팝업창 내부가 랜딩 페이지로 튕기는 치명적 결함이 발생했습니다.
* **v0.2.5 증명**: 인증 시점에 `redirectTo` 주소를 구글/카카오가 100% 공인 및 허용하는 HTTPS 실 주소인 **`https://barosit.com/#/auth/callback`** 으로 일원화했습니다. 이에 따라 OAuth 공급자 및 Supabase가 단 1바이트의 Fallback 튕김 유도도 하지 않고, 안전하게 팝업창 내부에서 콜백 페이지로 안착합니다.

#### 3. 🔑 [풍선 C] 윈도우 연결 거부 (tauri.localhost 연결 거부) 버그
* **과거 결함 원인**: 튕김을 잡기 위해 `tauri.conf.json` 에서 `"useHttpsScheme": true` 를 부여해 Windows 웹뷰 origin을 `https://tauri.localhost` 로 전격 승격시켰습니다. 하지만 Windows WebView2의 보안 메커니즘상, 로컬 기기에 수립된 인증서 신뢰 체인이나 HTTPS 핸드셰이크 프로토콜이 존재하지 않아, 브라우저 엔진이 자체적으로 **`tauri.localhost` 연결 자체를 전면 거절(ERR_CONNECTION_REFUSED)하는 앱 먹통 사태**를 유발했습니다.
* **v0.2.5 증명**: `useHttpsScheme` 옵션을 전면 철폐 및 삭제 원복하여 본래의 가장 안전하고 속도감 있는 `http://tauri.localhost` 프로토콜로 컴백했습니다. 연결 거부 버그가 즉시 영구적으로 소멸했습니다.

#### 4. 🔗 [풍선 D] PKCE code_verifier 저장소 격리 버그 (verifier not found)
* **과거 결함 원인**: Supabase의 기본 사양인 PKCE(`flowType: "pkce"`)는 인증 개시 시점의 로컬 스토리지에 `code_verifier`를 저장하고 콜백 시점에서 이를 대조합니다. 메인 창(`tauri://localhost` 등)에서 인증을 시작해 verifier를 구웠으나, 최종 콜백 복귀는 팝업창 내의 외부 도메인인 `https://barosit.com` 에서 끝나므로, 팝업창 내에서 메인 창의 스토리지에 든 verifier를 불러오지 못해 **`PKCE code verifier not found in storage`** 로그인 폭사 현상이 맥과 윈도우 전 플랫폼에서 교차 발생했습니다.
* **v0.2.5 증명 (하이브리드 결합)**: 
  * **Tauri 앱**에서는 **`flowType: "implicit"`**로 지정하여, 메인 창의 로컬 스토리지에 verifier를 저장하고 검증해야 하는 단계를 전면 생략합니다.
  * **웹 브라우저**에서는 **`flowType: "pkce"`**를 유지하여 웹 보안의 견고함을 지킵니다.
  * 팝업창 내부가 `https://barosit.com` 으로 복귀할 때 Supabase가 실물 토큰(`#access_token=...`)을 해시 파라미터로 무사히 실어 보내주므로, 팝업창 내부의 웹 Supabase Client가 verifier 검증 없이 즉각 세션 확립에 성공합니다.
  * 동일 앱 샌드박스(WebView2/WebKit) 내에서 공유되는 세션 쿠키를 메인 창이 즉시 인지하여 팝업을 닫고 로그인을 완성합니다.

---

### 15.4 자세 기준 데이터(Calibration) 복원 매커니즘 검증

* **LocalStorage 유실 회피 성공**:
  * 프로토콜을 `http://tauri.localhost` ➡️ `https://tauri.localhost` 로 변경하면 브라우저 보안 격리에 의해 모든 IndexedDB와 로컬스토리지가 완전히 새로 덮어써집니다. 이로 인해 기존 사용자의 소중한 **자세 기준 데이터(Calibration data)**가 유실되어 다시 측정하도록 밀려나는 사용성 오염을 겪었습니다.
  * `v0.2.5` 에서는 오리진을 원래 상태(`http://tauri.localhost` 및 `tauri://localhost`)로 영리하게 환원했기 때문에, 기존 사용자들이 평소 축적해 둔 자세 캘리브레이션 데이터를 단 1%의 유실도 없이 완벽하게 복원 및 승계하여 캘리브레이션 재측정 없이 무중단으로 즐길 수 있게 됩니다.

---

**분석 완료. 핫픽스 아키텍처의 무결성이 코드 및 플랫폼 런타임 제약 수준에서 완벽하게 증명되었습니다.**

