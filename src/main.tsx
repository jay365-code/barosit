import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "./i18n"; // i18n 초기화 (렌더 전 동기 — 깜빡임/누락 방지)
import { Marketing, routeFromHash, type MarketingRoute } from "./web/Marketing";
import { applyThemeMode, watchOsTheme } from "./themeConfig";
import { reconcileProfileCache } from "./userProfile";
import { initErrorReporting } from "./lib/errorReporting";
import { initUsageAnalytics } from "./lib/usageAnalytics";

// 전역 에러/크래시 자동 리포트 (OPS-1) — 모든 진입점(앱·위젯·알림·마케팅) 공통.
initErrorReporting();
// 익명 사용 분석(활성화 퍼널/재방문) — 앱 버전 캐시 준비.
initUsageAnalytics();

// 사용자가 명시 선택한 테마(localStorage)를 가장 먼저 적용해 깜빡임 방지
applyThemeMode();
watchOsTheme();

// 계정 전환 시 이전 계정의 프로필 캐시(user_profile_v1)가 새어 다른 계정 화면에
// 표시되던 누수를 렌더 전 동기적으로 차단. (import 만으로 auth 변경 리스너도 등록됨)
reconcileProfileCache();

// 토스페이먼츠 결제 완료 후 돌아왔을 때 query string의 redirect_route를 감지하여 해시 라우트 복원
if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  const redirectRoute = params.get("redirect_route");
  // 데스크톱 앱이 결제를 웹으로 위임하며 연 경우(from=desktop). 브라우저는 앱과
  // 세션을 공유하지 않아 대개 로그아웃 상태이고, 비로그인은 테스터 판정이 안 돼
  // 베타 가드가 #/pricing 을 #/landing 으로 되돌린다. 그래서 앱은 #/login 으로
  // 열고, 여기서 로그인 후 목적지를 심어 둔다(Login 이 읽어 복귀).
  // 이미 로그인된 브라우저면 Login 이 즉시 이 값을 읽어 요금제로 통과시킨다.
  if (redirectRoute === "pricing" && params.get("from") === "desktop") {
    try {
      localStorage.setItem("barosit:auth_redirect", "#/pricing");
    } catch {
      /* localStorage 비활성 — 로그인 후 랜딩으로 떨어질 뿐, 치명적이지 않음 */
    }
  } else if (redirectRoute === "profile" && params.get("from") === "desktop") {
    // 데스크톱 "카드 변경" 위임 — 브라우저는 로그아웃 상태라 #/profile 로 바로
    // 보내면 보호 라우트 가드가 #/landing 으로 되돌린다. 로그인 후 목적지를 심어
    // 두면 Login 이 읽어 #/profile(카드 관리)로 잇는다(pricing 과 동일 패턴).
    try {
      localStorage.setItem("barosit:auth_redirect", "#/profile");
    } catch {
      /* localStorage 비활성 — 로그인 후 랜딩으로 떨어질 뿐, 치명적이지 않음 */
    }
  } else if (redirectRoute === "pricing") {
    window.location.hash = "#/pricing";
  } else if (redirectRoute === "app") {
    window.location.hash = "#/app";
  } else if (redirectRoute === "profile") {
    window.location.hash = "#/profile";
  }
}

const IS_WEB =
  (import.meta.env.VITE_PLATFORM as string | undefined) === "web" ||
  (typeof window !== "undefined" && !(window as any).__TAURI_INTERNALS__ && !(window as any).__TAURI__);

// 라우팅 규칙(#18): 커뮤니티만 clean path(/community, /community/p/<id>), 그 외는 전부 해시(pathname "/").
// 따라서 pathname 이 /community* 인데 해시가 붙은 혼합 URL(/community#/admin, /community#/landing 등)은
// 해시 라우트가 우선이므로 pathname 을 / 로 정리한다. App 모드(#/app·#/admin·#/qa) 직접 진입도 여기서 커버.
if (
  IS_WEB &&
  typeof window !== "undefined" &&
  window.location.hash &&
  /^\/community(\/p\/[^/]+)?\/?$/.test(window.location.pathname)
) {
  window.history.replaceState({}, "", "/" + window.location.hash);
}

// 레거시 네비게이션(location.hash = "" 로 홈 이동, 예: 어드민 닫기)이 URL 에 남기는
// 맨 '#'(예: /# )을 제거해 깔끔한 / 로 정리한다. 웹 전용(데스크톱은 URL 미노출).
if (
  IS_WEB &&
  typeof window !== "undefined" &&
  window.location.hash === "" &&
  window.location.href.endsWith("#")
) {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

const isWidget = !IS_WEB && window.location.hash === "#widget";
const isAlert = !IS_WEB && window.location.hash === "#alert";
// 웹은 마케팅 페이지가 기본 진입점. 모니터링 앱은 #/app 으로 명시 진입.
const isWebAppRoute = IS_WEB && (window.location.hash === "#/app" || window.location.hash === "#/admin");
const isQaRoute = window.location.hash === "#/qa" || window.location.hash === "#/qa-checklist";

// 커뮤니티 글 permalink(SEO #18): /community/p/<id> pathname 라우팅. 해시 라우팅과 공존 —
// 이 pathname 으로 진입하면 커뮤니티 라우트를 강제하고 해당 글을 자동으로 연다.
const communityPostMatch =
  IS_WEB && typeof window !== "undefined"
    ? window.location.pathname.match(/^\/community\/p\/([^/]+)\/?$/)
    : null;
const initialCommunityPostId = communityPostMatch ? decodeURIComponent(communityPostMatch[1]) : null;
// 목록 clean URL(/community). 글 상세와 함께 커뮤니티를 해시 없는 path 로 크롤 가능하게.
const isCommunityListPath =
  IS_WEB && typeof window !== "undefined" && /^\/community\/?$/.test(window.location.pathname);


const COMMUNITY_PATH_RE = /^\/community(\/p\/[^/]+)?\/?$/;

function MarketingHost({ initial, initialPostId }: { initial: MarketingRoute; initialPostId?: string | null }) {
  const [route, setRoute] = useState<MarketingRoute>(initial);
  useEffect(() => {
    // 커뮤니티만 clean path(/community). 그 외는 기존 해시 라우팅 유지.
    // /community 에서 해시 내비(#/landing 등)로 이동하면 pathname 에 /community 가 남아
    // /community#/landing 처럼 섞이므로, 해시 라우트로 전환될 때 pathname 을 루트로 정리해
    // 기존 해시 URL(/#/landing) 형태로 맞춘다(리로드 없음). community 자체는 건드리지 않음.
    const normalize = (r: MarketingRoute | null) => {
      if (r && r !== "community" && window.location.hash && window.location.pathname !== "/") {
        window.history.replaceState({}, "", "/" + window.location.hash);
      }
    };
    normalize(initial);
    // hashchange/popstate 공통 재평가. back/forward 로 /community↔해시라우트를 오갈 때
    // pathname 이 함께 바뀌면 hashchange 가 안 뜨고 popstate 만 오므로 둘 다 구독한다.
    const apply = () => {
      const raw = routeFromHash(window.location.hash);
      if (raw) {
        setRoute(raw);
        normalize(raw);
        return;
      }
      // 해시가 비었고 커뮤니티 pathname → 커뮤니티로 전환(리로드 없음).
      if (!window.location.hash && COMMUNITY_PATH_RE.test(window.location.pathname)) {
        setRoute("community");
        return;
      }
      // 그 외 알 수 없는 해시(#/app·#/qa·#/admin 등) → App/QA 로 전환.
      // pathname 이 /community* 로 남아 있으면 정리 후 리로드(/community#/admin → /#/admin).
      if (window.location.pathname !== "/") {
        window.history.replaceState({}, "", "/" + window.location.hash);
      }
      window.location.reload();
    };
    window.addEventListener("hashchange", apply);
    window.addEventListener("popstate", apply);
    return () => {
      window.removeEventListener("hashchange", apply);
      window.removeEventListener("popstate", apply);
    };
  }, []);
  return <Marketing route={route} initialPostId={initialPostId} />;
}

// 웹 라우트 결정. 우선순위: 앱/QA 제외 → 명시적 해시 라우트(community 아님)가
// pathname community 보다 우선(/community#/pricing → pricing) → /community(/p/<id>) pathname →
// 해시 #/community → 웹 기본 landing.
const rawMarketingRoute = routeFromHash(window.location.hash);
const marketingRoute: MarketingRoute | null = (() => {
  if (!IS_WEB || isWebAppRoute || isQaRoute) return null;
  if (rawMarketingRoute && rawMarketingRoute !== "community") return rawMarketingRoute;
  if (initialCommunityPostId || isCommunityListPath) return "community";
  if (rawMarketingRoute) return rawMarketingRoute;
  return "landing";
})();

// back/forward·bfcache 로 상위 모드(App 셸 #/app·#/admin·#/qa ↔ 마케팅/커뮤니티)가
// URL 과 어긋나면 리로드로 맞춘다. 상위 모드는 로드 시점에 갈리고 전환엔 reload 가 필요한데,
// pathname 이 바뀌는 back(예: /#/admin → /community)은 hashchange 가 아니라 popstate 만
// 발화해 기존 hashchange reload 로는 못 잡는다. (예: 어드민 화면이 /community URL 에 잔류)
if (IS_WEB && typeof window !== "undefined" && !isWidget && !isAlert) {
  const renderedApp = !marketingRoute && !isQaRoute; // 이 문서가 App 셸로 렌더됐는가
  const renderedQa = isQaRoute;
  const reconcile = () => {
    const h = window.location.hash;
    const wantQa = h === "#/qa" || h === "#/qa-checklist";
    const wantApp = h === "#/app" || h === "#/admin";
    if (wantQa !== renderedQa || wantApp !== renderedApp) {
      window.location.reload();
    }
  };
  window.addEventListener("popstate", reconcile);
  window.addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted) reconcile();
  });
}

// HMR 안전 — 같은 컨테이너에 createRoot가 두 번 불리면 React가 경고함.
// 모듈 스코프에 캐시해 두고 두 번째부터는 root.render만.
const container = document.getElementById("root") as HTMLElement;
type RootHolder = { _barositRoot?: ReactDOM.Root };
const holder = container as HTMLElement & RootHolder;
const root = holder._barositRoot ?? ReactDOM.createRoot(container);
holder._barositRoot = root;

// 웹 + App 페이지(MonitorView/CalibrationView) 에선 hash가 바뀌면 reload 해서
// 라우터가 다시 평가하게 함. 마케팅 페이지는 MarketingHost가 자체 처리.
if (!isWidget && !isAlert && !marketingRoute) {
  window.addEventListener("hashchange", () => {
    window.location.reload();
  });
}

if (isWidget) {
  document.documentElement.classList.add("is-tauri-transparent");
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  container.style.background = "transparent";
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  import("./views/Widget").then(({ Widget }) => {
    root.render(
      <React.StrictMode>
        <Widget />
      </React.StrictMode>,
    );
  });
} else if (isAlert) {
  document.documentElement.classList.add("is-tauri-transparent");
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  container.style.background = "transparent";
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  import("./views/AlertWindow").then(({ AlertWindow }) => {
    root.render(
      <React.StrictMode>
        <AlertWindow />
      </React.StrictMode>,
    );
  });
} else if (isQaRoute) {
  import("./views/QaDashboardView").then(({ QaDashboardView }) => {
    root.render(
      <React.StrictMode>
        <QaDashboardView />
      </React.StrictMode>,
    );
  });
} else if (marketingRoute) {
  root.render(
    <React.StrictMode>
      <MarketingHost initial={marketingRoute} initialPostId={initialCommunityPostId} />
    </React.StrictMode>,
  );
} else {
  import("./App").then(async ({ default: App }) => {
    const { DialogHost } = await import("./lib/dialog");
    root.render(
      <React.StrictMode>
        <App />
        <DialogHost />
      </React.StrictMode>,
    );
  });
}
