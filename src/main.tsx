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
  if (redirectRoute === "pricing") {
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


function MarketingHost({ initial, initialPostId }: { initial: MarketingRoute; initialPostId?: string | null }) {
  const [route, setRoute] = useState<MarketingRoute>(initial);
  useEffect(() => {
    const handler = () => {
      const next = routeFromHash(window.location.hash);
      if (next) setRoute(next);
      else window.location.reload();
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return <Marketing route={route} initialPostId={initialPostId} />;
}

// 웹에선 #/app 이나 #/qa 외에는 marketing route 우선. hash 비어 있으면 landing 강제.
// 단, /community/p/<id> pathname 진입은 해시가 비어도 community 로 강제.
const rawMarketingRoute = routeFromHash(window.location.hash);
const marketingRoute: MarketingRoute | null = (!IS_WEB || isWebAppRoute || isQaRoute)
  ? null
  : initialCommunityPostId
    ? "community"
    : IS_WEB && !rawMarketingRoute
      ? "landing"
      : rawMarketingRoute;

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
  import("./App").then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
}
