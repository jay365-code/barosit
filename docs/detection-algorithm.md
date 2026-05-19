# 자세 감지 알고리즘

## 파이프라인 개요

```
카메라 프레임 (15 FPS, 256×192)
    ↓
MediaPipe 4개 모델
    ├─ Pose Landmarker (33점)
    ├─ Face Landmarker (478점 + 변환 행렬)
    ├─ Hand Landmarker (21점 × 2)
    └─ Image Segmenter (multiclass 마스크, 3틱마다 ≈ 5 FPS)
    ↓
LandmarkSmoother (7프레임 이동평균)
    ↓
analyzeFrame() — 4종 자세 raw 판정
    ↓
ViolationSmoother (EMA + 히스테리시스 + 최소 그레이스)
    ↓
ViolationTracker (지속 시간 기반 알람 발사)
    ↓
usePostureScore (점수 갱신)
    ↓
broadcast (localStorage + Tauri event)
```

## 모델 구성

[src/pose/detector.ts](../src/pose/detector.ts)

| 모델 | URL | 매 틱? |
|---|---|---|
| pose_landmarker_lite | float16 | ✓ |
| face_landmarker | float16 | ✓ (`runFace`) |
| hand_landmarker | float16 | ✓ (`runHands`) |
| selfie_multiclass_256x256 | float32 | 3틱마다 (`segmentEveryN`) |

마스크는 `Uint8Array` 버퍼를 모듈 스코프에 두고 재사용 — GC 압력 최소화.

## 카메라 입력

해상도 **256×192** ([useCamera.ts](../src/hooks/useCamera.ts)) — Face Landmarker 입력(192×192)과 가까워 모델 리사이즈 비용 최소.

`visibilitychange` 이벤트로 윈도우 재가시 시 스트림 재시작 + 실패 시 800ms 후 자동 재시도.

## 자세 4종 판정 (analyzeFrame)

[src/pose/analyzer.ts](../src/pose/analyzer.ts) — 베이스라인 대비 변화량으로 판정.

### 1. 거북목 (forward_head)
4가지 신호 합산 (sensitivity 1.0 초과면 위반):
- `headSizeScore` — 귀-귀 거리 / 어깨 너비 비율 변화 (가장 신뢰도 높음)
- `-zDelta / 0.05` — pose z 좌표 변화 (노이즈 큼)
- `headDrop / 0.04` — 코의 y 좌표 변화
- `pitchScore = pitchDelta / 0.20` — Face Landmarker pitch 변화

### 2. 턱 괴임 (chin_resting)
3가지 경로 중 하나라도 만족:
- **Pose 기반 좌**: `wristAtChin(lWrist) && forearmUp(lWrist, lElbow)`
- **Pose 기반 우**: `wristAtChin(rWrist) && forearmUp(rWrist, rElbow)`
- **Hand 기반**: 어느 손가락 끝이든 코로부터 `faceRadius * 0.7` 이내

### 3. 어깨 기울임 (shoulder_tilt)
`|shoulderTiltY - baseline.shoulderTiltY| > 0.04 * sensitivity`

### 4. 등 구부정 (slouching)
`(1 - widthRatio) / 0.08 + yDrop / 0.04 > sensitivity`
- widthRatio = 현재 어깨 너비 / 베이스라인
- yDrop = 어깨 중심 y 변화

## 위반 안정화 (ViolationSmoother)

[src/pose/violationSmoother.ts](../src/pose/violationSmoother.ts) — 노이즈로 인한 status ping-pong 방지.

**EMA + 히스테리시스 + 최소 유지**:
```
violationProb[type] = 0.85 × prev + 0.15 × (raw_violated ? 1 : 0)

상태 전이:
  비위반 → 위반:  violationProb > 0.6 (진입 임계)
  위반   → 비위반: violationProb < 0.3 + 최소 3초 유지 (이탈 임계 + 그레이스)
```

이로써:
- 0~2초 미세 흔들림: 진입 임계 미달 → 위반 안 잡힘
- 한번 위반 진입 시 최소 3초 유지 → 즉시 회복해도 한 사이클 카운트
- 0.3까지 떨어지지 않으면 위반 유지 → 노이즈로 깜빡임 없음

각 자세별 **지속 시간**도 추적해 점수 계산에 사용.

## 알람 발사 (ViolationTracker)

[src/pose/violationTracker.ts](../src/pose/violationTracker.ts)

- 위반이 `thresholds[type].durationSecs` 초 이상 연속 → 알람 1회 발사
- 알람 후 같은 종류는 **5분 쿨다운** (`ALERT_COOLDOWN_MS`) — OS 알림 빈도 제한
- 위반 종류별 기본 `durationSecs`: 거북목·턱괴임·어깨·등 모두 5초 ([thresholds.ts](../src/pose/thresholds.ts))

알람 발사 시:
- OS 푸시 알림 (`show_posture_alert`)
- 이벤트 로그 (대시보드용)
- 옵션 LLM 코칭 메시지 비동기 fetch → 추가 알림

## 캘리브레이션

[src/pose/calibration.ts](../src/pose/calibration.ts), [CalibrationView.tsx](../src/views/CalibrationView.tsx)

5초간 사용자의 "바른 자세"를 측정 → 베이스라인으로 저장.

**5가지 적합성 체크** (모두 ✓ 여야 시작 버튼 활성):
1. `bodyVisible` — 코·양어깨 가시성 0.6 이상
2. `headNotTiltedDown` — face pitch < 15° (≈머리 안 숙임)
3. `headUpright` — face roll < 12° (≈머리 좌우 수평)
4. `noChinRest` — 손가락 끝이 얼굴 근처 아님
5. `stable` — 최근 ~1.2초 어깨 위치 변동 < 4%

5초간 80% 이상 적합 프레임이어야 베이스라인으로 저장. 미달 시 거부 + 재시도.

**측면 카메라 지원**: yaw/centered 체크 없음 — 노트북 옆 모니터 사용해도 그 각도가 베이스라인이 됨.

## 점수 시스템 (usePostureScore)

[src/hooks/usePostureScore.ts](../src/hooks/usePostureScore.ts) — 0~100 점수, localStorage `posture_score` 에 저장.

### 위반 시 패널티 (지속 시간 가속)
| 지속 | 초당 패널티 |
|---|---|
| 0–2초 | 0 (그레이스) |
| 2–10초 | −0.5 |
| 10–30초 | −1 |
| 30–60초 | −2 |
| 60초+ | **−3** |

동시 위반 N개 → 합산.

### 좋은 자세 회복 (연속 시간 가속)
| 좋음 지속 | 초당 회복 |
|---|---|
| 0–5분 | +1 |
| 5–15분 | +2 |
| 15분+ | **+3** |

**회복 보너스**: 위반 해제 후 10초 이내면 일회성 +2 (빠른 자세 교정 보상).

### 스트레칭 보너스
[src/pose/stretchDetector.ts](../src/pose/stretchDetector.ts) — 4종 + 종류별 60초 쿨다운.

| 종류 | 검출 조건 | 보너스 |
|---|---|---|
| 기지개 (overhead) | 양 팔꿈치가 어깨 위로 25% 이상 | +5 |
| 목 풀기 (behind_head) | 양 손목이 양 귀 근처 또는 팔꿈치 옆으로 펴짐 | +5 |
| 어깨 스트레치 (cross_body) | 한 손목이 반대편 어깨 너머 | +4 |
| 사이드 굽힘 (side) | 한 팔꿈치만 어깨 위 + 어깨 4%+ 기울임 | +3 |

2초 유지 후 발사. 검출 600ms 끊김까지 허용.

### 윈도우 간 동기화
- 매 정수 변화 시 localStorage 쓰기
- `storage` 이벤트로 다른 윈도우 hook 자동 sync
- `visibilitychange` / `focus` 시 localStorage 재로드 (suspend 보상)

### Frozen 조건
점수 tick 중단 — 다음 중 하나라도 만족:
- 비활성 owner (반대편 모드)
- 일시정지 (`paused`)
- 카메라 미준비 (`!cameraReady`)
- 베이스라인 없음

## 상태 (PostureStatus)

`good` / `warning` / `bad` / `paused`

- `good` — 활성 위반 없음
- `warning` — 위반 있지만 아직 알람 미발사
- `bad` — 알람 이미 발사된 위반 활성 중 (`tracker.hasAlertedActive()`)
- `paused` — 사용자 일시정지 or 8초 이상 사람 미감지

## 알림 단계 (stage)

위젯 표시에 사용. 최장 위반 지속 시간 기반:
- 0: 위반 없음
- 1: 0–15초
- 2: 15–30초
- 3: 30–60초
- 4: 60초+

현재는 상태색만 다르고 깜빡임 등은 제거됨 (사용자가 거슬리다 함).
