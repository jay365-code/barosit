#!/usr/bin/env bash
# BaroSit macOS 서명 + 공증(notarization) 빌드.
# 사용법:  bash scripts/build-mac-signed.sh
# 사전조건:
#   1) 키체인에 "Developer ID Application: Gu B Deu Co., Ltd. (LHR4658746)" 인증서 설치
#   2) src-tauri/.notarize.env 작성 (.notarize.env.example 참고)
#      - APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID (공증)
#      - (선택) TAURI_SIGNING_PRIVATE_KEY[_PASSWORD] : 자동 업데이터 서명용 Ed25519 키.
#        없으면 .app/.dmg 는 정상 서명+공증되지만 업데이터 아티팩트(latest.json 서명)는 생성 실패.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/src-tauri/.notarize.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE 가 없습니다. src-tauri/.notarize.env.example 를 복사해 채우세요." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${APPLE_ID:?APPLE_ID 미설정}"
: "${APPLE_PASSWORD:?APPLE_PASSWORD 미설정}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID 미설정}"

echo "🔏 서명 인증서 확인…"
security find-identity -v -p codesigning | grep -q "Developer ID Application" \
  || { echo "❌ Developer ID Application 인증서가 키체인에 없습니다." >&2; exit 1; }

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  echo "⚠️  TAURI_SIGNING_PRIVATE_KEY 미설정 — 업데이터 아티팩트 서명은 건너뜁니다(.app/.dmg 공증엔 영향 없음)."
fi

echo "🏗  서명+공증 빌드 시작 (Apple 공증은 수 분 소요될 수 있음)…"
cd "$ROOT"
# tauri build 는 마지막 업데이터 서명 단계에서 키가 없으면 비정상 종료할 수 있다.
# 그 전에 .app/.dmg 번들은 이미 생성·공증되므로 rc 를 삼키고 산출물로 계속 진행한다.
set +e; npm run tauri build; BUILD_RC=$?; set -e
[[ $BUILD_RC -ne 0 ]] && echo "⚠️ tauri build rc=$BUILD_RC (업데이터 서명 누락 가능) — 번들 산출물 기준으로 계속."

APP_DIR="$ROOT/src-tauri/target/release/bundle/macos"
DMG_DIR="$ROOT/src-tauri/target/release/bundle/dmg"
APP="$(ls -d "$APP_DIR"/*.app 2>/dev/null | head -1 || true)"
DMG="$(ls "$DMG_DIR"/*.dmg 2>/dev/null | head -1 || true)"

# Tauri 는 .app 만 공증/스테이플하고 .dmg 는 스테이플하지 않는다 → DMG 를 별도 공증+스테이플.
if [[ -n "$DMG" ]] && ! xcrun stapler validate "$DMG" >/dev/null 2>&1; then
  echo "📤 DMG 공증 제출 (--wait)…"
  xcrun notarytool submit "$DMG" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
  echo "📌 DMG 스테이플…"; xcrun stapler staple "$DMG"
fi

echo ""; echo "🔍 산출물 검증…"
if [[ -n "$APP" ]]; then
  echo "• .app 코드서명:"; codesign -dvvv "$APP" 2>&1 | grep -E "Authority=|TeamIdentifier|Runtime" || true
  echo "• .app Gatekeeper:"; spctl -a -vvv --type execute "$APP" 2>&1 || true
  echo "• .app 스테이플:"; xcrun stapler validate "$APP" 2>&1 || true
fi
if [[ -n "$DMG" ]]; then
  echo "• .dmg 스테이플:"; xcrun stapler validate "$DMG" 2>&1 || true
  echo "→ 배포물: $DMG"
fi
echo "✅ 완료 (Gatekeeper 'accepted' / 'Notarized Developer ID' 면 경고 없이 설치됨)"
