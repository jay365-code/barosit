import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { CalibrationView } from "./views/CalibrationView";
import { MonitorView } from "./views/MonitorView";
import { SettingsDrawer } from "./views/SettingsDrawer";
import { Onboarding } from "./views/Onboarding";
import { ProfileView } from "./views/ProfileView";
import { AdminDashboardView } from "./views/AdminDashboardView";
import { PricingView } from "./views/PricingView";
import { AlertOverlay } from "./components/AlertOverlay";
import { UpdateNotice } from "./components/UpdateNotice";
import { useUpdater } from "./updater";
import {
  LegalDocument,
  type LegalDocKind,
} from "./components/LegalDocument";
import { clearBaseline, loadBaseline } from "./pose/calibration";
import type { CalibrationBaseline, PostureStatus } from "./pose/types";
import {
  hideMainWindow,
  loadAppMode,
  onMainCloseRequested,
  onMainReopened,
  onPauseEvent,
  onResumeEvent,
  setWidgetVisible,
  switchToMainMode,
  switchToWidgetMode,
  updateStatus,
} from "./ipc";
import { platform } from "./platform";

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
            화면 렌더링 중 문제가 발생했어요
          </div>
          <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 480 }}>
            {this.state.error?.message ?? "알 수 없는 오류"}
            <br />
            아래 버튼을 누르거나 앱을 재시작해주세요.
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
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [baseline, setBaseline] = useState<CalibrationBaseline | null>(() =>
    loadBaseline(),
  );
  const [paused, setPaused] = useState(false);
  const [, setStatus] = useState<PostureStatus>("good");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState<boolean>(
    () => localStorage.getItem(ONBOARDED_KEY) !== "1",
  );
  const updater = useUpdater();
  const [legalDoc, setLegalDoc] = useState<LegalDocKind | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [visible, setVisible] = useState<boolean>(
    typeof document === "undefined" ? true : !document.hidden,
  );

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

  useEffect(() => {
    let unsubPause: (() => void) | undefined;
    let unsubResume: (() => void) | undefined;
    let unsubClose: (() => void) | undefined;
    onPauseEvent(() => setPaused(true)).then((u) => (unsubPause = u));
    onResumeEvent(() => setPaused(false)).then((u) => (unsubResume = u));
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
      unsubClose?.();
      unsubReopen?.();
    };
  }, []);

  useEffect(() => {
    updateStatus("good").catch(() => undefined);
  }, []);

  const recalibrate = () => {
    clearBaseline();
    setBaseline(null);
  };

  const finishOnboarding = () => {
    localStorage.setItem(ONBOARDED_KEY, "1");
    setOnboardingOpen(false);
  };

  return (
    <ErrorBoundary>
      <div className="app">
        <main className="content">
          {!baseline ? (
            <CalibrationView
              onComplete={(b) => {
                setBaseline(b);
                platform
                  .requestPermissionsForMonitoring()
                  .catch(() => undefined);
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
              onStatusChange={setStatus}
            />
          )}
        </main>
        {profileOpen && (
          <ProfileView 
            onGoHome={() => setProfileOpen(false)} 
            onOpenAdmin={() => setAdminOpen(true)}
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
        {adminOpen && (
          <AdminDashboardView onClose={() => setAdminOpen(false)} />
        )}
        <AlertOverlay />
        <UpdateNotice state={updater} />
      </div>
    </ErrorBoundary>
  );
}
