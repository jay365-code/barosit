import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "./i18n";
import { initTrayI18n } from "./trayI18n";
import { CalibrationView } from "./views/CalibrationView";
import { MonitorView } from "./views/MonitorView";
import { SettingsDrawer } from "./views/SettingsDrawer";
import { Onboarding } from "./views/Onboarding";
import { ProfileView } from "./views/ProfileView";
import { AdminDashboardView } from "./views/AdminDashboardView";
import { PricingView } from "./views/PricingView";
import { UserCalibrationView } from "./views/UserCalibrationView";
import { AlertOverlay } from "./components/AlertOverlay";
import { UpdateNotice } from "./components/UpdateNotice";
import { useUpdater } from "./updater";
import { useMemoryReloadGuard } from "./hooks/useMemoryReloadGuard";
import { loadSnapshot, clearSnapshot } from "./lib/viewportSnapshot";
import {
  LegalDocument,
  type LegalDocKind,
} from "./components/LegalDocument";
import { loadBaseline } from "./pose/calibration";
import { resolveEffectivePlan, isBetaFree, refreshLaunchMode, LAUNCH_MODE_CHANGED_EVENT } from "./launchMode";
import type { CalibrationBaseline, PostureStatus } from "./pose/types";
import {
  hideMainWindow,
  loadAppMode,
  onMainCloseRequested,
  onMainReopened,
  onPauseEvent,
  onResumeEvent,
  onTogglePauseEvent,
  setWidgetVisible,
  switchToMainMode,
  switchToWidgetMode,
  updateStatus,
} from "./ipc";
import { platform } from "./platform";
import { supabase } from "./auth/supabase";
import { pullProfileFromServer, pullSettingsFromServer } from "./lib/syncService";

const ONBOARDED_KEY = "onboarded_v1";

/**
 * React 렌더 에러를 잡아 빈 화면 대신 복구 UI 표시. 메인 윈도우가 블랙으로
 * 보이는 케이스(렌더 중 unhandled 예외)에 대한 안전망.
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[barosit] React render error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--b-bg, #1a1a1a)",
            color: "var(--b-fg, #fff)",
            padding: 40,
            textAlign: "center",
            gap: 16,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {i18n.t("errors:render.title")}
          </div>
          <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 480 }}>
            {this.state.error?.message ?? i18n.t("errors:render.unknown")}
            <br />
            {i18n.t("errors:render.hint")}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 12,
              padding: "10px 20px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid var(--b-line, #444)",
              background: "var(--b-sig, #5b8c7a)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {i18n.t("common:refresh")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Reload 직후 잠깐 표시되는 정지 화면. useMemoryReloadGuard 가 reload 전에
 * MonitorView 의 video + silhouette 합성을 sessionStorage 에 저장해 두면,
 * 새 페이지 mount 시 이 컴포넌트가 즉시 표시 후 첫 mask 도착 시 fade-out.
 *
 * 사용자가 분 단위 자동 reload 자체를 인지하지 못하는 게 목적.
 */
function SnapshotOverlay() {
  const [data, setData] = useState(() => loadSnapshot());
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!data) return;
    let timeoutId: number | null = null;
    const startFade = () => {
      setFading(true);
      // 300ms transition 끝나면 DOM 에서 완전 제거.
      timeoutId = window.setTimeout(() => {
        setData(null);
        clearSnapshot();
      }, 320);
    };
    const onMaskReady = () => startFade();
    window.addEventListener("barosit:mask-ready", onMaskReady);
    // 안전망: 첫 mask 가 4초 안에 안 오면 (segmenter off 등) 강제 fade-out.
    const safetyId = window.setTimeout(startFade, 4000);
    return () => {
      window.removeEventListener("barosit:mask-ready", onMaskReady);
      window.clearTimeout(safetyId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [data]);

  if (!data) return null;
  // rect 있으면 silhouette canvas 위치에 정확히 매칭, 없으면 viewport fallback.
  // 사용자 화면의 카메라 영상은 CSS scaleX(-1) 로 mirror 표시되므로 snapshot
  // 도 동일하게 좌우 반전해야 자연스러움.
  const positionStyle: React.CSSProperties = data.rect
    ? {
        position: "fixed",
        top: data.rect.top,
        left: data.rect.left,
        width: data.rect.width,
        height: data.rect.height,
      }
    : {
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
      };
  return (
    <img
      src={data.dataURL}
      alt=""
      aria-hidden
      style={{
        ...positionStyle,
        objectFit: "cover",
        transform: "scaleX(-1)",
        zIndex: 99_999,
        pointerEvents: "none",
        opacity: fading ? 0 : 1,
        transition: "opacity 300ms ease-out",
      }}
    />
  );
}

export default function App() {
  const { t } = useTranslation(["app", "common"]);
  const [baseline, setBaseline] = useState<CalibrationBaseline | null>(() =>
    loadBaseline(),
  );

  // 트레이 메뉴/툴팁 다국어 — 시작 시 네이티브로 push + 언어 변경 구독.
  useEffect(() => {
    initTrayI18n();
  }, []);
  const [paused, setPaused] = useState<boolean>(() => {
    return localStorage.getItem("barosit:paused") === "true";
  });

  // paused 상태 동기화 (localStorage + storage 이벤트)
  useEffect(() => {
    localStorage.setItem("barosit:paused", String(paused));
    try {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "barosit:paused",
          newValue: String(paused),
        })
      );
    } catch { /* noop */ }
  }, [paused]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "barosit:paused") {
        setPaused(e.newValue === "true");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const [status, setStatus] = useState<PostureStatus>("good");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stretchCalibrateOpen, setStretchCalibrateOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState<boolean>(
    () => localStorage.getItem(ONBOARDED_KEY) !== "1",
  );
  const updater = useUpdater();
  const [detailedReportOpen, setDetailedReportOpen] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocKind | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState(() =>
    typeof window !== "undefined" ? window.location.hash : "",
  );
  const [pricingOpen, setPricingOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "success" || params.get("payment") === "fail") {
        return true;
      }
      if (localStorage.getItem("barosit:open_pricing_on_load") === "true") {
        localStorage.removeItem("barosit:open_pricing_on_load");
        return true;
      }
    }
    return false;
  });
  const [visible, setVisible] = useState<boolean>(
    typeof document === "undefined" ? true : !document.hidden,
  );

  // 1. 네트워크 온/오프라인 모니터링 상태
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);

  // 2. 인증 리다이렉트 브릿지 로딩 상태 (#/auth/callback 대응)
  const [authCallbackLoading, setAuthCallbackLoading] = useState(false);

  const isAnyModalOpen =
    settingsOpen ||
    profileOpen ||
    pricingOpen ||
    onboardingOpen ||
    stretchCalibrateOpen ||
    legalDoc !== null ||
    detailedReportOpen;

  // V8 외부 메모리 (video frame buffer, canvas backing, GPU staging) 가
  // 활성 사용 중 분당 ~110 MB 자라는 게 관찰됨. 1분 주기로 idle 감지 후
  // 자동 reload 해 release. 모든 state 는 localStorage/supabase 에 영속.
  // paused 상태에선 camera/engine 이 멈춰 메모리 증가 자체가 없으므로
  // reload 도 비활성 — 수면 중 deep race 같은 부작용 회피.
  useMemoryReloadGuard({
    // 평상시 90초마다 모델만 dispose+reinit(깜빡임 없는 경량 회수), 20분마다 한 번만
    // 전체 페이지 reload(잔여 메모리 정리, 이때만 화면 깜빡임). 깜빡임 빈도 분당 1회 → 시간당 3회.
    softIntervalMs: 90_000,
    fullIntervalMs: 1_200_000,
    idleMs: 10_000,
    // 자리비움/일시정지(status "paused") 중엔 비활성화. 그 상태에선 카메라가 꺼지고
    // 모델이 해제돼(메모리 이미 반납) reload 가 불필요하고, idle reload 가 화면을
    // 기본값("good")으로 리셋시키는 현상을 유발하기 때문. 활성 사용 중(잠깐 입력만
    // 멈춤)에는 그대로 동작해 메모리를 회수한다.
    enabled: !isAnyModalOpen && !paused && status !== "paused",
  });

  // 3. 구독 플랜 및 결제 실패 유예기간 상태
  const [_subPlan, setSubPlan] = useState<"free" | "pro">("free");
  const [subStatus, setSubStatus] = useState<string>("active");
  const [gracePeriodUntil, setGracePeriodUntil] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    const onVis = () => {
      setVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("main_visible", visible ? "true" : "false");
    return () => {
      localStorage.setItem("main_visible", "false");
    };
  }, [visible]);

  // 1. 네트워크 연결 상태 감지 Effect
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 2. 인증 리다이렉트 브릿지 (window.location.hash = #/auth/callback) 가로채기 Effect
  //
  // 사용자 원칙 — "UI 는 즉시, 데이터는 백그라운드".
  // 이전 구현은 500ms polling + Promise.all(pullProfile, pullSettings) await +
  // 1.5초 인위 setTimeout 으로 Windows 저사양에선 콜백 화면이 5~10초 멈춰 보이는
  // 문제가 있었습니다. 이를 다음으로 교체:
  //   1. polling 대신 supabase 의 onAuthStateChange(SIGNED_IN) 단발 구독 — 0ms
  //   2. session 확립 즉시 hash 클리어 + authCallbackLoading=false
  //   3. pullProfile/Settings 는 백그라운드 fire-and-forget — UI 블로킹 안 함
  //   4. fallback timeout 은 안전망으로 유지 (10초 → 8초)
  useEffect(() => {
    const hash = window.location.hash;
    const isCallback =
      hash.includes("access_token") ||
      hash.includes("id_token") ||
      hash.includes("type=signup") ||
      hash.includes("error=") ||
      hash.includes("#/auth/callback") ||
      window.location.search.includes("code=");

    if (!isCallback) return;

    console.log("[App] Auth callback URL detected. Waiting for session…");
    setAuthCallbackLoading(true);

    let settled = false;
    const finalize = () => {
      if (settled) return;
      settled = true;
      // URL 해시 클리어 — 다음 reload 시 콜백 effect 재진입 방지.
      if (window.location.hash) {
        window.location.hash = "";
      }
      setAuthCallbackLoading(false);
      window.dispatchEvent(new Event("barosit:subscription-changed"));
    };

    // 즉시 한 번 검사 — supabase 의 detectSessionInUrl 이 이미 세션을 만들었을
    // 수도 있음 (특히 hash 기반 implicit grant). 그 경우 onAuthStateChange 가
    // 마운트보다 *먼저* 발화해 놓쳐도 여기서 회수.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        console.log("[App] Session already established. Finalizing UI…");
        // 데이터는 백그라운드 — UI 블로킹 없음. 실패해도 다른 effect 에서 복원.
        void pullProfileFromServer();
        void pullSettingsFromServer();
        finalize();
      }
    });

    // SIGNED_IN 이벤트 단발 구독. polling 보다 응답성 좋음.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        console.log("[App] SIGNED_IN received. Finalizing UI…");
        void pullProfileFromServer();
        void pullSettingsFromServer();
        finalize();
      }
    });

    // 안전망 — 8초 안에 세션이 안 오면 콜백 오버레이만 닫음. 사용자가 직접
    // 재시도하거나 다른 진입 사용. (네트워크 단절 등 비정상 케이스 대비)
    const timeoutId = window.setTimeout(() => {
      console.warn("[App] Auth callback timeout (8s). Closing overlay.");
      finalize();
    }, 8000);

    return () => {
      data.subscription.unsubscribe();
      window.clearTimeout(timeoutId);
    };
  }, []);

  // 3. 실시간 요금제 및 유예 기간 상태 동기화 Effect
  useEffect(() => {
    const fetchSub = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let actualPlan: "free" | "pro" = "free";
        let status = "active";
        let graceUntil: string | null = null;

        if (session?.user) {
          // 어드민 권한 체크
          const { data: profData } = await supabase
            .from("profiles")
            .select("is_admin")
            .eq("id", session.user.id)
            .maybeSingle();
          setIsAdmin(!!profData?.is_admin);

          const { data, error } = await supabase
            .from("user_subscriptions")
            .select("plan_id, status, current_period_end, grace_period_until")
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (!error && data) {
            actualPlan = resolveEffectivePlan(data);
            status = data.status;
            graceUntil = data.grace_period_until;
          } else {
            // 오프라인 상태 대비 로컬 스토리지 캐시 검증 (베타 모드면 전원 PRO)
            const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
            actualPlan = isBetaFree() ? "pro" : (localPlan || "free");
          }
        } else {
          setIsAdmin(false);
          const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
          actualPlan = isBetaFree() ? "pro" : (localPlan || "free");
        }

        // 게이트(모니터링·동기화)가 직접 읽는 localStorage 캐시를 방금 해석한 실효
        // 플랜과 정합시킨다 — 다운그레이드(해지 만료·환불·더닝 강등)나 로그아웃이
        // 캐시에 반영되지 않아 Free 가 Pro 혜택을 유지하던 누수(§7 E2)를 차단.
        try {
          localStorage.setItem("barosit:subscription_plan", actualPlan);
        } catch { /* localStorage 미지원 환경 — 무시 */ }

        setSubPlan(actualPlan);
        setSubStatus(status);
        setGracePeriodUntil(graceUntil);
        setAuthLoaded(true);
      } catch (err) {
        console.error("App: failed to fetch sub:", err);
        const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
        setSubPlan(localPlan || "free");
        setAuthLoaded(true);
      }
    };

    // 부팅 시 런치 모드 원격값을 먼저 읽고(베타↔유료) 그 다음 플랜 해석
    refreshLaunchMode().finally(() => fetchSub());

    const handleSubChanged = () => {
      fetchSub();
    };
    window.addEventListener("barosit:subscription-changed", handleSubChanged);
    window.addEventListener("storage", handleSubChanged);
    window.addEventListener(LAUNCH_MODE_CHANGED_EVENT, handleSubChanged);
    
    // Supabase 인증 상태 변경 리스너 연동
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        fetchSub();
      }
    });

    return () => {
      window.removeEventListener("barosit:subscription-changed", handleSubChanged);
      window.removeEventListener("storage", handleSubChanged);
      window.removeEventListener(LAUNCH_MODE_CHANGED_EVENT, handleSubChanged);
      subscription.unsubscribe();
    };
  }, []);

  // 4. 앱 내 지역 단축키(Space) 바인딩 Effect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
 
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // 4.5. 앱 새로고침 단축키(Cmd+R, Ctrl+R, F5) 바인딩 Effect
  useEffect(() => {
    const handleReloadKey = (e: KeyboardEvent) => {
      if (
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") ||
        e.key === "F5"
      ) {
        e.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener("keydown", handleReloadKey);
    return () => window.removeEventListener("keydown", handleReloadKey);
  }, []);

  // 5. URL 해시 변경 실시간 리스너 Effect
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    let unsubPause: (() => void) | undefined;
    let unsubResume: (() => void) | undefined;
    let unsubTogglePause: (() => void) | undefined;
    let unsubClose: (() => void) | undefined;
    onPauseEvent(() => setPaused(true)).then((u) => (unsubPause = u));
    onResumeEvent(() => setPaused(false)).then((u) => (unsubResume = u));
    onTogglePauseEvent(() => setPaused((p) => !p)).then((u) => (unsubTogglePause = u));
    let unsubReopen: (() => void) | undefined;
    onMainCloseRequested(() => {
      switchToWidgetMode().catch(() => undefined);
    }).then((u) => (unsubClose = u));
    onMainReopened(() => {
      if (loadAppMode() === "widget") {
        switchToMainMode().catch(() => undefined);
      }
    }).then((u) => (unsubReopen = u));

    if (platform.features.multiWindow) {
      const mode = loadAppMode();
      const minibarOn = localStorage.getItem("minibar_visible") !== "0";
      const floatingVisible = minibarOn || mode === "widget";
      setWidgetVisible(floatingVisible).catch(() => undefined);
      if (mode === "widget") {
        hideMainWindow().catch(() => undefined);
      }
    }

    return () => {
      unsubPause?.();
      unsubResume?.();
      unsubTogglePause?.();
      unsubClose?.();
      unsubReopen?.();
    };
  }, []);

  useEffect(() => {
    updateStatus("good").catch(() => undefined);
  }, []);

  const recalibrate = () => {
    // 기존 다중 앵글 저장소(STORAGE_KEY_MULTI) 데이터를 유지하기 위해 
    // 전체를 날리는 clearBaseline() 호출을 생략하고, 
    // 캘리브레이션 뷰 진입을 위해 런타임 baseline 상태만 null로 비워줍니다.
    setBaseline(null);
  };

  const finishOnboarding = () => {
    localStorage.setItem(ONBOARDED_KEY, "1");
    setOnboardingOpen(false);
  };

  if (currentHash === "#/admin") {
    if (!authLoaded) {
      return null;
    }
    if (!isAdmin) {
      window.location.hash = "";
      return null;
    }
    return (
      <ErrorBoundary>
        <AdminDashboardView onClose={() => { window.location.hash = ""; }} />
      </ErrorBoundary>
    );
  }

  const hashPath = currentHash.split("?")[0];
  const isPopupMode = currentHash.includes("is_popup=true") || window.location.search.includes("is_popup=true");

  if (hashPath === "#/profile" || isPopupMode) {
    return (
      <ErrorBoundary>
        <ProfileView 
          onGoHome={() => { window.location.hash = ""; }} 
          onOpenAdmin={() => { window.location.hash = "#/admin"; }}
          onOpenPricing={() => setPricingOpen(true)}
        />
      </ErrorBoundary>
    );
  }

  const isGracePeriodActive = subStatus === "grace_period" && Boolean(gracePeriodUntil);
  const isUpdateNoticeActive = Boolean(updater.error || updater.info || updater.available);

  let paddingTopVal = 0;
  if (isGracePeriodActive) paddingTopVal += 40;
  if (isUpdateNoticeActive) paddingTopVal += 48;

  return (
    <ErrorBoundary>
      <SnapshotOverlay />
      <div className="app" style={paddingTopVal > 0 ? { paddingTop: `${paddingTopVal}px` } : undefined}>
        {/* 결제 실패 유예기간(Grace Period) 상단 경고 배너 */}
        {subStatus === "grace_period" && gracePeriodUntil && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: "40px",
            zIndex: 9500,
            background: "linear-gradient(90deg, #cc1c1c 0%, #eb7e13 100%)",
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            boxShadow: "0 4px 15px rgba(204, 28, 28, 0.3)",
            color: "#fff",
            fontSize: "12px",
            fontWeight: 700
          }}>
            <span>🚨 <strong>{t("app:gracePeriod.title")}</strong> {t("app:gracePeriod.body")}</span>
            <span>{t("app:gracePeriod.deadline", { date: new Date(gracePeriodUntil).toLocaleDateString(i18n.language) })}</span>
            <button
              onClick={() => setProfileOpen(true)}
              style={{
                background: "#fff",
                color: "#cc1c1c",
                border: "none",
                borderRadius: "6px",
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
                transition: "all 0.2s"
              }}
            >
              {t("app:gracePeriod.cta")}
            </button>
          </div>
        )}

        <main className="content">
          {!baseline ? (
            <CalibrationView
              onComplete={(b) => {
                setBaseline(b);
                platform
                  .requestPermissionsForMonitoring()
                  .catch(() => undefined);
              }}
              onCancel={() => {
                const prev = loadBaseline();
                if (prev) {
                  setBaseline(prev);
                }
              }}
            />
          ) : (
            <MonitorView
              baseline={baseline}
              paused={paused}
              onTogglePause={() => setPaused((p) => !p)}
              onRecalibrate={recalibrate}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenProfile={() => setProfileOpen(true)}
              onOpenPricing={() => setPricingOpen(true)}
              onStatusChange={setStatus}
              detailedReportOpen={detailedReportOpen}
              setDetailedReportOpen={setDetailedReportOpen}
            />
          )}
        </main>
        {profileOpen && (
          <ProfileView 
            onGoHome={() => setProfileOpen(false)} 
            onOpenAdmin={() => { window.location.hash = "#/admin"; }}
            onOpenPricing={() => setPricingOpen(true)}
          />
        )}
        {pricingOpen && (
          <PricingView 
            onClose={() => {
              setPricingOpen(false);
              window.dispatchEvent(new Event("barosit:subscription-changed"));
            }} 
          />
        )}
        {settingsOpen && (
          <SettingsDrawer
            onClose={() => setSettingsOpen(false)}
            updater={updater}
            onShowLegal={setLegalDoc}
            onOpenStretchCalibrate={() => {
              setSettingsOpen(false);
              setStretchCalibrateOpen(true);
            }}
          />
        )}
        {onboardingOpen && (
          <Onboarding
            onFinish={finishOnboarding}
            onSkip={finishOnboarding}
            onShowLegal={setLegalDoc}
          />
        )}
        {legalDoc && (
          <LegalDocument kind={legalDoc} onClose={() => setLegalDoc(null)} />
        )}
        {stretchCalibrateOpen && (
          <UserCalibrationView onClose={() => setStretchCalibrateOpen(false)} />
        )}
        <AlertOverlay />
        <UpdateNotice
          state={updater}
          style={isGracePeriodActive ? { top: "40px" } : undefined}
        />

        {/* 네트워크 오프라인 엠버색 하단 알림 배너 */}
        {!isOnline && (
          <div style={{
            position: "fixed",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9000,
            background: "rgba(224, 136, 102, 0.95)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(224, 136, 102, 0.4)",
            borderRadius: "12px",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 10px 30px rgba(224, 136, 102, 0.25)",
            color: "#fff",
            fontSize: "12px",
            fontWeight: 600,
            lineHeight: 1.4,
            textAlign: "left",
            animation: "fadeInUp 0.3s ease-out"
          }}>
            <span style={{ fontSize: "16px" }}>⚠️</span>
            <div>{t("app:offline")}</div>
          </div>
        )}

        {/* 2. 인증 리다이렉트 브릿지 풀스크린 글래스모피즘 로딩 오버레이 */}
        {authCallbackLoading && (
          <div style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15, 17, 19, 0.8)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff"
          }}>
            <div className="b-spinner" style={{
              width: 40,
              height: 40,
              border: "3px solid rgba(126, 176, 156, 0.2)",
              borderTopColor: "#7eb09c",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: 16
            }} />
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
            <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-0.5px", color: "#e3e9f0" }}>
              {t("app:authLoading.title")}
            </div>
            <div style={{ fontSize: "12px", opacity: 0.6, marginTop: 6 }}>
              {t("app:authLoading.sub")}
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
