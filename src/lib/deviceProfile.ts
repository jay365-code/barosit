// 기기 프로파일 — 계측 이벤트에 실을 최소한의 실행 환경 정보.
//
// 왜 필요한가: usage_events 는 `client`(desktop/web)만 구분해서, 같은 데스크톱
// 안에서 Windows 와 macOS 를 나눠 볼 수 없었다. 캘리브레이션 통과율이 기기 성능에
// 좌우된다는 가설(느린 기기는 유효 fps 가 떨어져 게이트를 통과 못 함)을 검증하려면
// OS 와 CPU 코어 수 축이 필요하다. 실제로 신규 가입자 2명의 OS 를 확인하려 했을 때,
// 자세 이벤트(device_id 에 UA 가 실림)가 없는 쪽은 OS 를 특정할 방법이 아예 없었다.
//
// 정책 — acquisition.ts 와 동일하게 "판정에 필요한 최소한"만 남긴다:
//  - UA 전문을 저장하지 않는다. OS 계열 한 단어로만 환원한다.
//  - OS 버전·브라우저·기기 모델은 담지 않는다 (핑거프린팅 표면을 넓히지 않기 위함).
//  - 코어 수는 성능 대리지표로만 쓴다. 값 자체가 개인을 지목하지 않는다.
//  - 전송 여부는 기존 옵트아웃 토글(usageAnalytics)을 그대로 따른다.
//
// Tauri 웹뷰의 UA 도 호스트 OS 를 그대로 노출하므로(데스크톱 설치본의 UA 에
// "Windows NT 10.0" 이 찍힌 것을 프로덕션에서 확인) 데스크톱·웹이 같은 코드를 쓴다.
// @tauri-apps/plugin-os 를 새로 붙이지 않는 이유이기도 하다 — 네이티브 플러그인
// 추가는 Rust 측 등록·권한 설정·재빌드를 부르는데, 얻는 정보는 UA 파싱과 같다.

export type OsFamily =
  | "windows"
  | "macos"
  | "linux"
  | "android"
  | "ios"
  | "other";

/**
 * UA 문자열에서 OS 계열만 추출한다. 순수 함수 — 테스트 가능.
 *
 * 판정 순서가 중요하다:
 *  - Android UA 에는 "Linux" 가 함께 들어 있어 Linux 보다 먼저 봐야 한다.
 *  - iPadOS 는 데스크톱 모드에서 "Macintosh; Intel Mac OS X" 로 위장하므로,
 *    터치 지원 여부로 갈라야 정확하지만 UA 만으로는 macOS 와 구분되지 않는다.
 *    이 모듈은 UA 만 보므로 그 경우 macos 로 잡힌다(웹 접속 한정, 데스크톱 앱은
 *    해당 없음). 통계 왜곡이 미미하고 추가 신호를 저장할 이유가 없어 감수한다.
 */
export function parseOsFamily(ua: string): OsFamily {
  const s = ua.toLowerCase();
  if (/android/.test(s)) return "android";
  if (/iphone|ipad|ipod/.test(s)) return "ios";
  if (/windows|win32|win64/.test(s)) return "windows";
  if (/macintosh|mac os x|darwin/.test(s)) return "macos";
  if (/linux|x11|cros/.test(s)) return "linux";
  return "other";
}

/**
 * 계측 이벤트에 얹을 기기 프로파일.
 *
 * 값을 못 얻으면 그 키를 생략한다 — 빈 문자열이나 0 을 넣으면 집계에서
 * "값 없음"과 "실제 0"이 섞인다.
 */
export function deviceProps(): Record<string, string | number> {
  if (typeof navigator === "undefined") return {};
  const out: Record<string, string | number> = {};
  try {
    const ua = navigator.userAgent;
    if (ua) out.os = parseOsFamily(ua);
  } catch {
    /* UA 접근 실패는 계측을 막지 않는다 */
  }
  try {
    const cores = navigator.hardwareConcurrency;
    // 성능 대리지표. 비정상값(0·소수·과대)은 버려 집계를 오염시키지 않는다.
    if (Number.isInteger(cores) && cores > 0 && cores <= 512) out.cores = cores;
  } catch {
    /* 미지원 브라우저 — 생략 */
  }
  return out;
}
