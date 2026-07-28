// 유입 출처(어트리뷰션) — 어떤 채널이 실제 활성 사용자를 데려왔는지 잇기 위한 최소 장치.
//
// 정책:
//  - **first-touch**: 최초 유입 출처만 영속 저장하고 이후 방문에서 덮어쓰지 않는다.
//    (재방문 때마다 바뀌면 "누가 데려왔나"를 알 수 없다)
//  - UTM 파라미터가 없으면 외부 리퍼러의 **호스트만** 기록한다. 경로·쿼리는 저장하지
//    않는다 — 검색어나 사용자가 보던 글 URL 같은 흔적을 남기지 않기 위함.
//  - 저장한 값은 usageAnalytics 가 모든 이벤트 props 에 얹어 보낸다. 그래서
//    landing_view → app_opened → calibration_succeeded → onboarding_completed
//    퍼널을 채널별로 쪼개 볼 수 있다. 전송 여부는 기존 옵트아웃 토글을 그대로 따른다.

const ACQ_KEY = "barosit:acq";

export type Acquisition = {
  /** utm_source, 없으면 `ref:<host>` (직접 유입이면 `direct`) */
  source: string;
  /** utm_medium (선택) */
  medium?: string;
  /** utm_campaign (선택) */
  campaign?: string;
  /** 최초 유입 시각(ISO) — 저장만 하고 이벤트에는 싣지 않는다 */
  at: string;
};

/** 값 정규화 — 길이 제한 + 소문자화로 `Reddit`/`reddit` 파편화를 막는다. */
function norm(v: string | null): string | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase().slice(0, 40);
  return s || undefined;
}

/** 우리 도메인/로컬은 외부 유입이 아니다. */
function isSelfHost(host: string): boolean {
  return (
    host === "barosit.com" ||
    host.endsWith(".barosit.com") ||
    host.endsWith(".barosit.pages.dev") ||
    host === "barosit.pages.dev" ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

/**
 * 짧은 유입 링크 `/go/<출처>/<캠페인>` 을 해석한다(캠페인은 생략 가능).
 *
 * utm 파라미터가 붙은 긴 주소는 크리에이터가 영상 설명란에 그대로 붙이지 않는다 —
 * 지저분해 보여서 잘라내거나 자기 단축링크로 바꾸고, 그러면 캠페인이 날아가 전부
 * 직접 유입으로 잡힌다. 그래서 사람이 보기에 멀쩡한 경로 형태를 함께 지원한다.
 *
 * 값이 주소 자체에 들어 있으므로 슬러그 대응표가 없고, 채널이 늘어도 배포가 필요 없다.
 */
export function parseGoPath(pathname: string, now: string): Acquisition | null {
  const m = /^\/go\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!m) return null;
  const source = norm(decodeURIComponent(m[1]));
  const campaign = m[2] ? norm(decodeURIComponent(m[2])) : undefined;
  // 임의 경로로 들어와도 이상한 값이 기록되지 않게 허용 문자를 좁힌다.
  const ok = (v: string | undefined) => v === undefined || /^[a-z0-9_-]+$/.test(v);
  if (!source || !ok(source) || !ok(campaign)) return null;
  return { source, medium: "link", campaign, at: now };
}

/**
 * 순수 함수 — 경로·쿼리스트링·리퍼러에서 유입 출처를 계산한다(저장·부수효과 없음).
 * 우선순위는 `/go/` 경로 > utm > 리퍼러. 판별 못 하면 null (= 직접 유입으로 취급).
 */
export function parseAcquisition(
  search: string,
  referrer: string,
  now: string,
  pathname = "",
): Acquisition | null {
  const fromPath = parseGoPath(pathname, now);
  if (fromPath) return fromPath;

  const params = new URLSearchParams(search);
  const utmSource = norm(params.get("utm_source"));
  if (utmSource) {
    return {
      source: utmSource,
      medium: norm(params.get("utm_medium")),
      campaign: norm(params.get("utm_campaign")),
      at: now,
    };
  }
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, "");
      if (host && !isSelfHost(host)) return { source: `ref:${host}`, medium: "referral", at: now };
    } catch {
      /* 리퍼러가 URL 이 아니면 무시 */
    }
  }
  return null;
}

/** 저장된 first-touch 출처. 없으면 null. */
export function getAcquisition(): Acquisition | null {
  try {
    const raw = localStorage.getItem(ACQ_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Acquisition;
    return v && typeof v.source === "string" ? v : null;
  } catch {
    return null;
  }
}

/** 이벤트 props 에 얹을 평탄화된 출처. 미상이면 빈 객체. */
export function acquisitionProps(): Record<string, string> {
  const acq = getAcquisition();
  if (!acq) return {};
  const out: Record<string, string> = { acq_source: acq.source };
  if (acq.medium) out.acq_medium = acq.medium;
  if (acq.campaign) out.acq_campaign = acq.campaign;
  return out;
}

/**
 * 부팅 시 1회 — 출처를 캡처(최초 1회만)하고 URL 에서 캠페인 흔적을 걷어낸다.
 *
 * `/go/...` 경로는 루트로 되돌리고, utm_* 파라미터는 제거한다. utm 외의 파라미터
 * (redirect_route·from 등 결제 복귀 플로우)와 해시 라우트는 그대로 보존한다.
 */
export function captureAcquisition(): void {
  if (typeof window === "undefined") return;
  try {
    if (!getAcquisition()) {
      const acq = parseAcquisition(
        window.location.search,
        document.referrer,
        new Date().toISOString(),
        window.location.pathname,
      );
      if (acq) localStorage.setItem(ACQ_KEY, JSON.stringify(acq));
    }
  } catch {
    /* localStorage 비활성 — 어트리뷰션만 비고 앱은 정상 동작 */
  }
  // URL 정리: 공유·북마크된 주소에 캠페인 꼬리표가 남지 않게. 캡처는 이미 끝났다.
  try {
    const params = new URLSearchParams(window.location.search);
    let touched = false;
    for (const key of [...params.keys()]) {
      if (key.startsWith("utm_")) {
        params.delete(key);
        touched = true;
      }
    }
    // `/go/...` 는 유입용 주소일 뿐 실제 라우트가 아니다(SPA 폴백으로 랜딩이 뜬다).
    // 루트로 정리해 두면 이후 라우팅·공유 주소가 평소와 같아진다.
    const isGoPath = /^\/go(\/|$)/.test(window.location.pathname);
    const pathname = isGoPath ? "/" : window.location.pathname;
    if (touched || isGoPath) {
      const qs = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        pathname + (qs ? `?${qs}` : "") + window.location.hash,
      );
    }
  } catch {
    /* replaceState 실패는 무해 */
  }
}

/** 테스트 전용 */
export function __resetAcquisition(): void {
  try {
    localStorage.removeItem(ACQ_KEY);
  } catch {
    /* ignore */
  }
}
