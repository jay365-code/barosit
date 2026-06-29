# 윈도우 배포 전략 — 코드서명 직접배포 vs 스토어

> 작성: 2026-06-24 · 상태: **조사 완료, 결정 보류(당분간 스토어 경로 유지)**
>
> 목표: macOS의 "Developer ID 서명 + 공증 → GitHub 릴리스 직접배포"와 동일한
> "애플 같은" 윈도우 직접배포(스토어 없이, 설치 경고 없음)를 할 수 있는지 검토.

## 현 상태 (2026-06)

| 채널 | macOS | Windows |
|---|---|---|
| 직접배포 코드서명 | ✅ Developer ID 서명 + 공증 + staple ([release.yml](../.github/workflows/release.yml)) | ❌ **미서명** (minisign 업데이터 서명만 있음 → SmartScreen "알 수 없는 게시자" 경고) |
| 스토어 | — | ⚠️ MSIX → Microsoft Store ([windows-msix.yml](../.github/workflows/windows-msix.yml)), 제품 9NMG33L2THHH, 1차 거부 이력 |

→ 현재 윈도우 사용자는 GitHub 릴리스의 NSIS 설치파일 실행 시 SmartScreen 경고를 봄.
스토어 경로만 "신뢰된" 배포이나 심사·MSIX 제약(barosit:// 프로토콜 선언 등)이 번거로움.

## macOS ↔ Windows 대응 개념

| | macOS (구현됨) | Windows (목표) |
|---|---|---|
| 신원 인증서 | Developer ID Application | 코드서명 인증서 (OV 또는 EV) |
| 경고 제거 메커니즘 | 공증(notarization) + staple | SmartScreen 평판(reputation) |
| 배포 채널 | GitHub Release (.dmg) | GitHub Release (.exe / NSIS) |
| 비용 | $99/년 (Apple Developer) | 옵션별 상이 (아래) |

스토어를 거치지 않아도 됨. **윈도우 설치파일에 코드서명만 붙이면** macOS와 동일한
직접배포 흐름이 완성됨.

## 2023년 이후 핵심 규정 변경 (반드시 인지)

1. **모든 코드서명 인증서는 키를 하드웨어(HSM/USB토큰)에 저장 의무화** (CA/B 포럼).
   → .pfx 파일을 GitHub Secret에 넣는 옛 방식 불가. CI 자동화하려면 **클라우드 HSM 서명** 필요.
2. **SmartScreen 경고 제거 시점이 인증서 등급에 따라 다름:**
   - **OV/IV**: 평판이 다운로드 누적되며 서서히 쌓여 경고 소멸(며칠~몇 주, 신규 버전마다 약간 리셋). 애플 공증처럼 "즉시 0경고"는 아님.
   - **EV**: 첫날부터 경고 0 (애플 공증과 가장 유사한 경험). 대신 비쌈.

## 발급사 비교

| 옵션 | 등급 | 연 비용(인증서) | CI 서명 비용 | 한국 법인 발급 | 경고 제거 | CI 자동화 |
|---|---|---|---|---|---|---|
| Azure Artifact Signing | (MS 자체) | — | $9.99/월 | ❌ 미·캐·EU·영국만 | 평판 누적식 | ★ 쉬움 |
| SSL.com eSigner OV | OV/IV | $64.5~ | +$20/월 | ✅ 글로벌 | 평판 누적식 | ★ 쉬움(API) |
| SSL.com eSigner EV | EV | $249~ | +$29/월 | ✅ 글로벌 | ✅ 첫날부터 0 | ★ 쉬움(API) |
| Certum Cloud OV | OV | $116~ | 포함(SimplySign) | ✅ 글로벌(EU사) | 평판 누적식 | ★★ 2시간 토큰창 |
| Certum Cloud EV | EV | $226~ | 포함(SimplySign) | ✅ 글로벌 | ✅ 첫날부터 0 | ★★ 2시간 토큰창 |

핵심:
- **Azure($9.99/월)는 최저가이나 한국 법인(Gu B Deu Co., Ltd.) 자격 미달 가능성 높음** — 지원 지역이 미·캐·EU·영국뿐. 사실상 제외.
- **즉시 무경고(애플 수준)를 원하면 EV뿐.** OV/IV는 어디서 사든 평판 누적식.
- **CI 무인 자동화는 SSL.com eSigner가 가장 매끄러움**(API 기반, GH Actions 공식 지원). Certum EV는 더 싸지만 SimplySign 2시간 토큰창 때문에 완전 무인화에 추가 작업 필요.
- 모든 옵션 USB 토큰 없이 클라우드 HSM 가능(2023 규정 안에서 CI 자동화하는 유일한 길).

## 권장안 (직접배포로 전환 시)

| 우선순위 | 추천 | 비용(대략) | 근거 |
|---|---|---|---|
| 첫날부터 무경고 + 무인 CI (애플과 가장 동일) | **SSL.com eSigner EV** | 인증서 $249/년 + eSigner $29/월 ≈ 연 ~$600 | 한국 법인 OK, CI 가장 깔끔 |
| 즉시 무경고를 최저가로 | Certum Cloud EV | $226/년(eSigner 포함) | 단 2시간 토큰창 무인화 추가작업 |
| 경고 며칠 뒤 소멸 허용 + 최저가 | SSL.com eSigner OV | ~$64/년 + $20/월 | 평판 누적 후 경고 소멸 |

## 직접배포 전환 시 구현 개요 (미실행)

- Tauri v2 `signCommand` 사용 → .exe 바이너리 서명 후 NSIS 설치파일까지 한 빌드에서 서명.
- [release.yml](../.github/workflows/release.yml) 윈도우 job에 서명 스텝 통합(현재 macOS 공증 흐름과 동형).
- 자격증명은 GitHub Secrets(SSL.com eSigner API: TOTP secret / username / password 등).
- [windows-msix.yml](../.github/workflows/windows-msix.yml) 스토어 경로는 **보조로 그대로 유지** → 직접배포(서명 NSIS)를 메인, 스토어를 보조로 운영(macOS가 DMG 직접배포를 메인으로 두는 것과 동일).

## 결정 (2026-06-24)

- **당분간 배포는 Microsoft Store(MSIX) 경로 유지.** 직접배포 코드서명은 미도입.
- 인증서 비용/발급 심사 부담 대비 우선순위가 낮아 보류. 직접배포 경고(SmartScreen) 제거가
  사용자 유입의 병목으로 확인되면 위 권장안(SSL.com eSigner EV 우선)으로 전환.
- 전환 트리거 후보: 스토어 심사 재거부 반복 / 직접배포 다운로드 이탈률 데이터 / EV 예산 확보.

## 출처

- Azure Artifact Signing: https://azure.microsoft.com/en-us/products/artifact-signing · FAQ(지역) https://learn.microsoft.com/en-us/azure/artifact-signing/faq · SmartScreen 평판 https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- SSL.com eSigner: 가격 https://www.ssl.com/guide/esigner-pricing-for-code-signing/ · EV https://www.ssl.com/products/software-integrity/code-signing/ev/ · CI/CD https://www.ssl.com/guide/code-signing-automation/
- Certum Cloud: EV https://shop.certum.eu/ev-code-signing-in-the-cloud.html · 가격 https://www.sslmentor.com/certum/certumcodecloudev
- Tauri v2 Windows 코드서명: https://v2.tauri.app/distribute/sign/windows/
