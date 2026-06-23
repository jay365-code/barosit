<#
.SYNOPSIS
  BaroSit Windows MSIX 패키징 자동화 — MSIX Packaging Tool GUI 캡처를 대체.
  Windows + Windows SDK(makeappx/signtool) + Rust + Node 환경에서 실행.

.DESCRIPTION
  Tauri 릴리스 빌드 → 페이로드 레이아웃 구성(exe + WebView2Loader + 로고 + 매니페스트)
  → makeappx pack 으로 .msix 생성. Store 제출용은 서명 불필요(Partner Center 재서명).
  로컬 사이드로드 테스트는 -Sign 으로 자체 인증서 서명.

.EXAMPLE
  pwsh scripts/build-msix.ps1                 # Store 제출용 .msix (미서명)
  pwsh scripts/build-msix.ps1 -Sign -CertPath dev.pfx -CertPassword pw   # 로컬 테스트 서명
#>
param(
  [string]$Version,                 # 미지정 시 tauri.conf.json 에서 읽음 (x.y.z → x.y.z.0)
  [switch]$Sign,                    # 로컬 사이드로드 테스트용 서명
  [string]$CertPath,
  [string]$CertPassword
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# --- 버전 산정 (Identity Version 은 4파트) ---
if (-not $Version) {
  $conf = Get-Content "src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json
  $Version = $conf.version
}
if ($Version -notmatch '\.\d+\.\d+\.\d+$') { $Version = "$Version.0" }  # x.y.z → x.y.z.0
Write-Host "MSIX 버전: $Version"

# --- 1) Tauri 릴리스 빌드 (barosit.exe 생성) ---
# --no-bundle: NSIS/업데이터 번들 단계를 건너뛰고 exe 만 컴파일 → 업데이터 서명키 의존 제거.
Write-Host "■ Tauri 빌드 (--no-bundle)…"
npm run tauri build -- --no-bundle
$ReleaseDir = "src-tauri/target/release"
$Exe = Join-Path $ReleaseDir "barosit.exe"
if (-not (Test-Path $Exe)) { throw "barosit.exe 를 찾지 못함: $Exe" }

# --- 2) 페이로드 레이아웃 구성 ---
$Layout = "windows/layout"
if (Test-Path $Layout) { Remove-Item $Layout -Recurse -Force }
New-Item -ItemType Directory -Path "$Layout/Assets" -Force | Out-Null

Copy-Item $Exe $Layout
# WebView2Loader.dll 등 동반 파일(있으면). Tauri 가 resources/sidecar 를 쓰면 여기서 함께 복사.
Get-ChildItem $ReleaseDir -Filter "*.dll" -ErrorAction SilentlyContinue | Copy-Item -Destination $Layout
# 로고: Tauri 가 생성해 둔 Square*/StoreLogo 를 그대로 사용
Copy-Item "src-tauri/icons/Square44x44Logo.png","src-tauri/icons/Square71x71Logo.png",`
          "src-tauri/icons/Square150x150Logo.png","src-tauri/icons/Square310x310Logo.png",`
          "src-tauri/icons/StoreLogo.png" "$Layout/Assets"

# 매니페스트: {{VERSION}} 치환
(Get-Content "windows/AppxManifest.xml" -Raw).Replace("{{VERSION}}", $Version) |
  Set-Content "$Layout/AppxManifest.xml" -Encoding UTF8

# --- 3) makeappx pack ---
$OutDir = "windows/dist"; New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$Msix = Join-Path $OutDir "BaroSit_${Version}_x64.msix"
Write-Host "■ makeappx pack → $Msix"
makeappx pack /o /d $Layout /p $Msix

# --- 4) (선택) 로컬 테스트 서명 ---
if ($Sign) {
  if (-not $CertPath) { throw "-Sign 에는 -CertPath(.pfx) 필요" }
  Write-Host "■ signtool sign (로컬 테스트용)"
  signtool sign /fd SHA256 /a /f $CertPath /p $CertPassword $Msix
}

Write-Host "✅ 완료: $Msix"
Write-Host "   Store 제출: Partner Center → 제품 9NMG33L2THHH → 패키지 업로드(미서명 가능, MS 재서명)."
Write-Host "   로컬 테스트: -Sign 후 'Add-AppxPackage $Msix' (인증서가 신뢰된 루트에 있어야 함)."
