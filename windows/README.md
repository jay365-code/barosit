# Windows MSIX 패키징 (자동화)

MSIX Packaging Tool GUI 캡처 없이 스크립트로 `.msix` 를 만든다.

## 구성
- `AppxManifest.xml` — 패키지 매니페스트 템플릿. Identity(Partner Center 예약값)·`runFullTrust`·`webcam`·`barosit://` 프로토콜 선언. `{{VERSION}}` 은 빌드 시 치환.
- `../scripts/build-msix.ps1` — Tauri 빌드(`--no-bundle`) → 페이로드 레이아웃 → `makeappx pack`.
- `../.github/workflows/windows-msix.yml` — `windows-latest` 러너 무인 빌드(태그 `v*` 또는 수동).
- `layout/`, `dist/` — 빌드 산출물(gitignore).

## 로컬 실행 (Windows + Windows SDK + Rust + Node)
```powershell
pwsh scripts/build-msix.ps1                 # Store 제출용(.msix, 미서명)
pwsh scripts/build-msix.ps1 -Sign -CertPath dev.pfx -CertPassword pw   # 로컬 사이드로드 테스트 서명
```

## CI
`v*` 태그 푸시 또는 Actions 수동 실행 → `barosit-msix` 아티팩트로 `.msix` 생성. Windows 머신 불필요.

## Store 제출
Partner Center → 제품 `9NMG33L2THHH` → 패키지 업로드. **미서명 .msix 업로드 가능**(MS가 재서명). 제출 자동화는 `msstore` CLI 또는 StoreBroker(워크플로 주석 참고).

## 검증 필요 항목 (Windows에서 확인)
- 페이로드 파일 집합: `barosit.exe` 외에 Tauri 가 런타임에 필요로 하는 동반 파일(WebView2Loader.dll, resources/sidecar 등)이 모두 `layout/` 에 들어갔는지. 누락 시 `build-msix.ps1` 의 복사 단계에 추가.
- 로컬 설치 후 `barosit://` 딥링크 + 웹캠 권한 동작 (1차 거부 원인이었던 부분 — loopback 폴백 병행).
