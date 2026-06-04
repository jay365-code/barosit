// 사용자 프로필 페이지 — Phase 1: 클라우드 동기화 및 구독/결제 관리
// - 이름·아바타·작업환경 입력 및 Supabase 프로필 자동 연동
// - Google/Kakao 실 서비스 로그인 패널 탑재
// - 구독 해지/복구·환불은 service_role Edge Function 경유, 결제수단 등록/변경은
//   웹의 Toss 호스티드 결제창으로 위임 (raw 카드 데이터 미수집 — PCI)
// - "홈으로" 버튼 → 메인 모니터 화면 복귀

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { Icon } from "../components/Icon";
import { AdminTemplateView } from "./AdminTemplateView";
import { platform } from "../platform";
import { supabase, extractSocialAvatarUrl, pickInitial } from "../auth/supabase";
import { useAuth } from "../auth/useAuth";
import { resolveEffectivePlan, isBetaFree } from "../launchMode";
import {
  syncProfileToServer,
  pullProfileFromServer,
  pullSettingsFromServer,
} from "../lib/syncService";
import {
  loadProfile,
  saveProfile,
  PROFILE_CHANGED_EVENT,
  type UserProfile,
  type WorkEnv,
} from "../userProfile";

interface Props {
  onGoHome: () => void;
  onOpenAdmin?: () => void;
  onOpenPricing?: () => void;
}

function getWebAdminUrl(): string {
  const explicit = import.meta.env.VITE_AUTH_REDIRECT_BASE;
  if (explicit) {
    return `${explicit.replace(/\/$/, "")}/#/admin`;
  }
  // 로컬 개발 모드에서의 Vite 웹 포트(1430) 혹은 운영 프로덕션 도메인 기본 폴백
  const isDev = import.meta.env.DEV;
  return isDev ? "http://localhost:1430/#/admin" : "https://barosit.com/#/admin";
}

export function ProfileView({ onGoHome, onOpenAdmin, onOpenPricing }: Props) {
  const { t } = useTranslation(["profile", "common"]);
  const {
    session,
    signInWithGoogle,
    signInWithKakao,
    signOut,
  } = useAuth();

  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [adminModelCalibrateOpen, setAdminModelCalibrateOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [subPlan, setSubPlan] = useState<"free" | "pro">("free");
  const [subStatus, setSubStatus] = useState<string>("active");
  const [subUpdatedAt, setSubUpdatedAt] = useState<string | null>(null);
  const [subPeriodEnd, setSubPeriodEnd] = useState<string | null>(null);
  
  // 결제 관련 추가 상태
  const [cardInfo, setCardInfo] = useState<any>(null);
  const [gracePeriodUntil, setGracePeriodUntil] = useState<string | null>(null);
  const [cardFormOpen, setCardFormOpen] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // 소셜 프로필 이미지 자동 표시 + 로딩 실패 시 이름 이니셜 fallback.
  // 사용자가 *직접 변경*하는 UI 는 없음 — 소셜 OAuth 가 제공한 정보를
  // 읽기 전용으로만 사용. MonitorView 와 동일 헬퍼(pickInitial / extract
  // SocialAvatarUrl)로 양쪽 화면 표시 일관성 보장.
  const initial = pickInitial(profile.name, session?.user);
  const socialAvatarUrl = extractSocialAvatarUrl(session?.user);
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);
  useEffect(() => {
    setAvatarImageFailed(false);
  }, [session?.user?.id]);


  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // 프로필 행이 아직 없는(트리거 이전 가입) 유저는 0행 → .single() 이
          // 406 을 뱉어 콘솔 노이즈가 됨. maybeSingle 로 0행을 정상 null 처리.
          const { data, error } = await supabase
            .from("profiles")
            .select("is_admin")
            .eq("id", session.user.id)
            .maybeSingle();
          
          if (!error && data?.is_admin) {
            setIsAdmin(true);
          }
        }
      } catch (err) {
        console.error("Failed to check admin status:", err);
      }
    };
    checkAdminStatus();
  }, []);

  // 팝업창 전용: provider 쿼리 파라미터 감지 시 자동 OAuth 로그인 트리거 (PKCE 도메인 격리 원천 해소)
  useEffect(() => {
    const hashQuery = window.location.hash.split("?")[1] || "";
    const searchParams = new URLSearchParams(window.location.search || hashQuery);
    const provider = searchParams.get("provider");
    const isPopup = searchParams.get("is_popup");

    if (isPopup && provider) {
      console.warn(`[Tauri OAuth Popup Sandbox] Auto-triggering OAuth flow for: ${provider}`);
      if (provider === "google") {
        signInWithGoogle().catch((err) => {
          console.error("Auto-trigger Google failed:", err);
          alert(err.message || err);
        });
      } else if (provider === "kakao") {
        signInWithKakao().catch((err) => {
          console.error("Auto-trigger Kakao failed:", err);
          alert(err.message || err);
        });
      }
    }
  }, [signInWithGoogle, signInWithKakao]);

  // Tauri OAuth 완료 시 ProfileView 자동 닫기 — 웹의 Marketing.tsx Login
  // 컴포넌트가 user state 변화로 #/app 으로 navigate 하는 것과 동기. 데스크탑은
  // ProfileView 가 overlay 모드 (profileOpen=true, hash 안 바뀜) 로 열렸을 때
  // hash 변경만으론 안 닫히므로 useAuth 의 명시 이벤트 listen 필요.
  useEffect(() => {
    const handler = () => onGoHome();
    window.addEventListener("barosit:login-completed", handler);
    return () => window.removeEventListener("barosit:login-completed", handler);
  }, [onGoHome]);

  // 로그인 성공 시 프로필 & 설정 원격 다운로드 복원
  // dep 를 session?.user?.id 로 좁힘 — 토큰 자동 refresh (1시간 주기) 시
  // session 객체 참조가 바뀌어 매번 무의미한 pull 이 발생하던 비용 제거.
  useEffect(() => {
    if (session?.user) {
      pullProfileFromServer();
      pullSettingsFromServer();
    }
  }, [session?.user?.id]);

  // 프로필 실시간 변경 이벤트 감지 및 반영
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UserProfile>).detail;
      if (detail) setProfile(detail);
    };
    window.addEventListener(PROFILE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    const fetchSub = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let actualPlan: "free" | "pro" = "free";

        if (session?.user) {
          const { data, error } = await supabase
            .from("user_subscriptions")
            .select("plan_id, status, current_period_end, updated_at, card_info, grace_period_until")
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (!error && data) {
            actualPlan = resolveEffectivePlan(data);
            setSubStatus(data.status);
            setSubUpdatedAt(data.updated_at);
            setSubPeriodEnd(data.current_period_end);
            setCardInfo(data.card_info);
            setGracePeriodUntil(data.grace_period_until);
          } else {
            const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
            actualPlan = isBetaFree() ? "pro" : (localPlan || "free");
          }

          const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";

          // [보안 위변조 감지] DB 플랜은 free인데 로컬 캐시가 pro인 경우
          if (actualPlan === "free" && localPlan === "pro") {
            console.warn("Security Warning: Subscription plan tampering detected!");

            // 1. 즉각 admin_notifications 테이블에 critical 경보 적재
            await supabase.from("admin_notifications").insert({
              event_type: "tampering_detected",
              severity: "critical",
              message: `보안 침해 감지: 사용자 ${session.user.email} 님이 로컬 요금제 캐시를 PRO로 불법 변조한 정황이 포착되어, 시스템이 즉각 권한을 격하하고 로그를 기록했습니다.`,
              payload: {
                user_id: session.user.id,
                email: session.user.email,
                local_plan: "pro",
                db_plan: "free",
                detected_at: new Date().toISOString()
              }
            });

            // 2. 강제 롤백 처리
            localStorage.setItem("barosit:subscription_plan", "free");
            setSubPlan("free");
            window.dispatchEvent(new Event("barosit:subscription-changed"));
          } else {
            localStorage.setItem("barosit:subscription_plan", actualPlan);
            setSubPlan(actualPlan);
          }
        } else {
          // 비로그인 Guest일 시 로컬스토리지를 강제로 'free'로 롤백
          localStorage.setItem("barosit:subscription_plan", "free");
          setSubPlan("free");
          setCardInfo(null);
          setGracePeriodUntil(null);
        }
      } catch (err) {
        console.error("Failed to load user subscription:", err);
        const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
        setSubPlan(localPlan || "free");
      }
    };
    fetchSub();

    const handleSubChanged = () => {
      fetchSub();
    };
    window.addEventListener("barosit:subscription-changed", handleSubChanged);
    window.addEventListener("storage", handleSubChanged); // 로컬스토리지 타탭 싱크용
    return () => {
      window.removeEventListener("barosit:subscription-changed", handleSubChanged);
      window.removeEventListener("storage", handleSubChanged);
    };
    // dep 를 session?.user?.id 로 좁힘 — 토큰 refresh 시 fetchSub 가 매시간
    // 재실행되어 user_subscriptions SELECT 가 누적되던 비용 제거.
  }, [session?.user?.id]);

  // 프로필 정보 동기화 및 자동 저장 — 입력 후 600ms debounce
  // dep 를 session?.user?.id 로 좁힘 — 토큰 refresh 시 불필요 push 방지.
  useEffect(() => {
    const t = setTimeout(() => {
      saveProfile(profile);
      setSavedAt(Date.now());
      if (session?.user) {
        syncProfileToServer();
      }
    }, 600);
    return () => clearTimeout(t);
  }, [profile, session?.user?.id]);

  // 환불 요청 (안전한 우회 방식)
  const handleRefund = async () => {
    if (!window.confirm(t("refundConfirm"))) return;
    
    try {
      if (!session?.user) return;

      // 서버에서 7일/미사용 재검증 + 실제 Toss 취소 + FREE 강등 + 원장 환불
      const { data, error } = await supabase.functions.invoke("payment-cancel", { body: {} });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "환불 처리 실패");
      }

      setSubPlan("free");
      setSubStatus("none");
      setCardInfo(null);
      window.dispatchEvent(new Event("barosit:subscription-changed"));
      alert(t("refundSuccess"));
    } catch (err: any) {
      console.error("Refund request failed:", err);
      alert(err?.message || t("refundError"));
    }
  };

  // 구독 취소 (해지 예약)
  const handleCancelSubscription = async () => {
    if (!window.confirm(t("cancelConfirm"))) return;

    try {
      if (!session?.user) return;

      // 해지 예약(status='canceled')은 트리거 때문에 서버(service_role)만 가능
      const { data, error } = await supabase.functions.invoke("subscription-manage", {
        body: { action: "cancel" },
      });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "해지 처리 실패");
      }

      setSubStatus("canceled");
      window.dispatchEvent(new Event("barosit:subscription-changed"));
      alert(t("cancelSuccess"));
    } catch (err) {
      console.error("Cancellation failed:", err);
      alert(t("cancelError"));
    }
  };

  // 구독 복구 (해지 취소)
  const handleResumeSubscription = async () => {
    try {
      if (!session?.user) return;

      const { data, error } = await supabase.functions.invoke("subscription-manage", {
        body: { action: "resume" },
      });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "복구 처리 실패");
      }

      setSubStatus("active");
      window.dispatchEvent(new Event("barosit:subscription-changed"));
      alert(t("restoreSuccess"));
    } catch (err) {
      console.error("Resume failed:", err);
      alert(t("restoreError"));
    }
  };

  // 결제수단 등록/변경은 웹의 Toss 호스티드 결제창에서만 진행 (PCI 범위 최소화).
  // 데스크톱/웹 모두 기본 브라우저로 결제 관리 페이지를 연다. raw 카드 데이터는
  // 우리 앱이 절대 수집하지 않는다.
  const handleOpenWebBilling = () => {
    platform.openBrowser("https://barosit.com/#/pricing");
    setCardFormOpen(false);
  };

  // 결제 정보 삭제
  const handleDeleteCardInfo = async () => {
    if (!window.confirm(t("cardDeleteConfirm"))) return;

    try {
      if (!session?.user) return;

      // 1. Supabase DB user_subscriptions 갱신 (billing_key, card_info를 null로 설정)
      const { error: subError } = await supabase
        .from("user_subscriptions")
        .update({
          billing_key: null,
          card_info: null,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", session.user.id);

      if (subError) throw subError;

      // 2. 관리자 알림 전송 (보안 및 감사용)
      await supabase.from("admin_notifications").insert({
        event_type: "cancellation",
        severity: "info",
        message: `결제 수단 삭제: 사용자 ${session.user.email} 님이 등록된 결제 카드 정보를 완전히 삭제했습니다.`,
        payload: {
          user_id: session.user.id,
          email: session.user.email,
          action: "delete_payment_method",
          deleted_at: new Date().toISOString()
        }
      });

      // 3. 상태 갱신
      setCardInfo(null);
      alert(t("cardDeleteSuccess"));
      
      // 상태 변경 알림
      window.dispatchEvent(new Event("barosit:subscription-changed"));
    } catch (err: any) {
      console.error("Failed to delete card info:", err);
      alert(t("cardDeleteError", { error: err.message || err }));
    }
  };

  const isRefundable = () => {
    if (!subUpdatedAt) return false;
    const diffTime = Math.abs(new Date().getTime() - new Date(subUpdatedAt).getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays <= 7;
  };

  const update = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) =>
    setProfile((p) => ({ ...p, [k]: v }));

  return (
    <div className="profile-view">
      <header className="profile-header" style={{ width: "100%", display: "flex", justifyContent: "center", padding: "16px 0" }}>
        <div style={{
          maxWidth: "720px",
          width: "100%",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <button
            type="button"
            className="b-btn b-btn-ghost"
            onClick={onGoHome}
            aria-label={t("back")}
          >
            <Icon name="chev-l" size={14} />
            {t("back")}
          </button>
          <h1 className="profile-title" style={{ margin: 0 }}>{!session ? t("titleLogin") : t("titleProfile")}</h1>
          <button
            type="button"
            className="b-icon-btn b-tip"
            data-tip={t("back")}
            onClick={onGoHome}
            aria-label={t("back")}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </header>

      <div className="profile-body">
        {/*
          loading 스피너("보안 세션 동기화 중...") 분기 제거 — Windows 저사양
          에서 useAuth 의 첫 getSession() 응답까지 5~10초 멈춰 보이던 문제.
          대신 *마지막으로 알려진 세션 상태* 를 즉시 표시하고, 응답이 도착하면
          자연 재렌더로 갱신. 깜빡임은 1프레임 미만이고 사용자가 기다리지
          않습니다.
        */}
        {!session ? (
          /* 🔐 비로그인 상태: 오직 로그인/인증에만 완벽히 집중할 수 있는 전면 UI */
          <section className="profile-card profile-login-focused" style={{
            background: "linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%)",
            borderColor: "rgba(255, 255, 255, 0.08)",
            boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
            backdropFilter: "blur(8px)",
            borderRadius: "24px",
            padding: "32px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px"
          }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #7eb09c, #5b8c7a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 20px rgba(126, 176, 156, 0.3)",
              marginBottom: "8px"
            }}>
              <Icon name="shield" size={28} style={{ color: "#fff" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--b-fg-1)", letterSpacing: "-0.5px" }}>
                {t("backupTitle")}
              </h2>
              <p style={{ fontSize: "13px", color: "var(--b-fg-3)", lineHeight: 1.6, maxWidth: "320px", margin: "0 auto" }}>
                {t("backupDesc")}
              </p>
            </div>

            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
              {/* 1. 소셜 로그인 버튼들 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <button
                  type="button"
                  className="b-btn"
                  onClick={async () => {
                    setLoginLoading(true);
                    try {
                      localStorage.setItem("barosit:auth_redirect", "#/app");
                      await signInWithGoogle();
                    } catch (err: any) {
                      alert(err.message || err);
                    } finally {
                      setLoginLoading(false);
                    }
                  }}
                  disabled={loginLoading}
                  style={{
                    justifyContent: "center",
                    background: "#fff",
                    color: "#111",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "13px",
                    height: "44px",
                    borderRadius: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                >
                  {t("googleLogin")}
                </button>
                <button
                  type="button"
                  className="b-btn"
                  onClick={async () => {
                    setLoginLoading(true);
                    try {
                      localStorage.setItem("barosit:auth_redirect", "#/app");
                      await signInWithKakao();
                    } catch (err: any) {
                      alert(err.message || err);
                    } finally {
                      setLoginLoading(false);
                    }
                  }}
                  disabled={loginLoading}
                  style={{
                    justifyContent: "center",
                    background: "#fee500",
                    color: "#191919",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "13px",
                    height: "44px",
                    borderRadius: "12px",
                    boxShadow: "0 4px 12px rgba(254,229,0,0.15)",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                >
                  {t("kakaoLogin")}
                </button>
              </div>

              {/* 비로그인 유저가 소개/커뮤니티 홈으로 바로 이탈/이동할 수 있도록 편의 버튼 배치 */}
              <div style={{ marginTop: "16px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "16px", width: "100%" }}>
                <a
                  href="#/landing"
                  onClick={onGoHome}
                  style={{
                    fontSize: "12px",
                    color: "var(--b-fg-3)",
                    textDecoration: "underline",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    cursor: "pointer",
                    padding: "6px 0"
                  }}
                >
                  {t("communityHome")}
                </a>
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* 요금제 구독 정보 카드 */}
            <section
              className="profile-card"
              style={
                subPlan === "pro"
                  ? {
                      background:
                        "linear-gradient(135deg, rgba(126, 176, 156, 0.12) 0%, rgba(21, 24, 26, 0.4) 100%)",
                      borderColor: "rgba(126, 176, 156, 0.4)",
                      boxShadow: "0 0 25px rgba(126, 176, 156, 0.08)",
                    }
                  : undefined
              }
            >
              <div className="profile-card-head">
                <Icon
                  name="sparkle"
                  size={16}
                  style={subPlan === "pro" ? { color: "#7eb09c" } : undefined}
                />
                <span>{t("mySubscription")}</span>
                <span
                  className="profile-pill"
                  style={
                    subPlan === "pro"
                      ? {
                          background: "linear-gradient(135deg, #7eb09c, #5b8c7a)",
                          color: "#fff",
                          fontWeight: 800,
                        }
                      : undefined
                  }
                >
                  {subPlan === "pro" ? "PRO MEMBER" : "FREE EXPERIENCE"}
                </span>
              </div>

              {/* 결제 실패 / 납부 유예 경고 배너 */}
              {subStatus === "grace_period" && gracePeriodUntil && (
                <div style={{
                  background: "rgba(224, 136, 102, 0.12)",
                  border: "1px solid rgba(224, 136, 102, 0.4)",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  marginTop: "12px",
                  fontSize: "12px",
                  color: "#e08866",
                  lineHeight: 1.5
                }}>
                  <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="shield" size={14} style={{ color: "#e08866" }} />
                    {t("graceTitle")}
                  </strong>
                  <div style={{ marginTop: 4 }}>
                    {t("graceBody1")}
                    <br />
                    {t("graceBody2", { date: new Date(gracePeriodUntil).toLocaleDateString(i18n.language) })}
                  </div>
                </div>
              )}

              {isBetaFree() ? (
                <p className="profile-card-sub" style={{ color: "var(--b-fg-2)" }}>
                  {t("betaPlanBody")}
                </p>
              ) : subPlan === "pro" ? (
                <>
                  <p className="profile-card-sub" style={{ color: "var(--b-fg-2)" }} dangerouslySetInnerHTML={{ __html: t("proDesc") }} />

                  {/* 등록된 카드 결제 수단 확인 정보 */}
                  {cardInfo && (
                    <div style={{
                      marginTop: "12px",
                      padding: "14px 16px",
                      borderRadius: "12px",
                      background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between"
                    }}>
                      <div>
                        <div style={{ fontSize: "11px", color: "var(--b-fg-4)", marginBottom: 4 }}>{t("defaultPayment")}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "13px", fontWeight: 700, color: "var(--b-fg-2)" }}>
                          <Icon name="sparkle" size={12} style={{ color: "#7eb09c" }} />
                          {cardInfo.brand} ({cardInfo.number})
                        </div>
                      </div>
                      <span style={{
                        fontSize: "10px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: "rgba(126, 176, 156, 0.15)",
                        color: "#7eb09c",
                        fontWeight: 600
                      }}>
                        {cardInfo.cardType} / {cardInfo.ownerType}
                      </span>
                    </div>
                  )}

                  {/* 결제 및 해지/환불 관리 영역 */}
                  <div className="profile-subscription-management" style={{
                    marginTop: "16px",
                    padding: "16px",
                    borderRadius: "14px",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    fontSize: "12px"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", color: "var(--b-fg-3)" }}>
                      <span>{t("subStatusLabel")}
                        <strong style={{
                          color: subStatus === "active" ? "#7eb09c" : subStatus === "grace_period" ? "#e08866" : "#e08866",
                          marginLeft: "6px"
                        }}>
                          {subStatus === "active" ? t("subStatusActive") : subStatus === "grace_period" ? t("subStatusGrace") : subStatus === "canceled" ? t("subStatusCanceled") : t("subStatusDefault")}
                        </strong>
                      </span>
                      {subPeriodEnd && (
                        <span>{t("expiryLabel")}{new Date(subPeriodEnd).toLocaleDateString(i18n.language)}</span>
                      )}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <button
                        type="button"
                        className="b-btn b-btn-ghost"
                        style={{
                          padding: "6px 12px",
                          fontSize: "11px",
                          height: "auto",
                          color: "var(--b-fg-2)",
                          border: "1px solid rgba(126, 176, 156, 0.3)",
                          background: "rgba(126, 176, 156, 0.04)"
                        }}
                        onClick={() => setCardFormOpen(!cardFormOpen)}
                      >
                        {cardFormOpen ? t("cardFormClose") : t("cardFormChange")}
                      </button>

                      {cardInfo && (
                        <button
                          type="button"
                          className="b-btn b-btn-ghost"
                          style={{
                            padding: "6px 12px",
                            fontSize: "11px",
                            height: "auto",
                            color: "#f87171",
                            border: "1px solid rgba(248, 113, 113, 0.3)",
                            background: "rgba(248, 113, 113, 0.04)"
                          }}
                          onClick={handleDeleteCardInfo}
                        >
                          {t("cardDelete")}
                        </button>
                      )}

                      {subStatus === "active" && (
                        <>
                          {isRefundable() ? (
                            <button
                              type="button"
                              className="b-btn"
                              style={{
                                padding: "6px 12px",
                                fontSize: "11px",
                                height: "auto",
                                background: "rgba(224, 136, 102, 0.1)",
                                color: "#e08866",
                                border: "1px solid rgba(224, 136, 102, 0.2)"
                              }}
                              onClick={handleRefund}
                            >
                              {t("refundBtn")}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="b-btn b-btn-ghost"
                            style={{
                              padding: "6px 12px",
                              fontSize: "11px",
                              height: "auto",
                              color: "var(--b-fg-3)",
                              border: "1px solid rgba(255, 255, 255, 0.1)"
                            }}
                            onClick={handleCancelSubscription}
                          >
                            {t("cancelSubBtn")}
                          </button>
                        </>
                      )}

                      {subStatus === "canceled" && (
                        <button
                          type="button"
                          className="b-btn"
                          style={{
                            padding: "6px 12px",
                            fontSize: "11px",
                            height: "auto",
                            background: "rgba(126, 176, 156, 0.15)",
                            color: "#7eb09c",
                            border: "1px solid rgba(126, 176, 156, 0.2)"
                          }}
                          onClick={handleResumeSubscription}
                        >
                          {t("restoreSubBtn")}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="profile-card-sub">
                    {t("freePlanDesc")}
                  </p>
                  
                  {/* 비로그인 혹은 비구독 상태에서 카드 등록 가능성 오픈 */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                    <button
                      type="button"
                      className="b-btn b-btn-primary"
                      onClick={onOpenPricing}
                      style={{
                        background: "linear-gradient(135deg, #e08866, #c2613f)",
                        color: "#fff",
                        boxShadow: "0 4px 15px rgba(224, 136, 102, 0.25)",
                        border: "none",
                        fontWeight: 700,
                        flex: 1
                      }}
                    >
                      {t("upgradeBtn")}
                    </button>
                    {session?.user && (
                      <button
                        type="button"
                        className="b-btn b-btn-ghost"
                        onClick={() => setCardFormOpen(!cardFormOpen)}
                        style={{ border: "1px solid rgba(255,255,255,0.15)", fontSize: "12px" }}
                      >
                        {cardFormOpen ? t("payFormClose") : t("payFormOpen")}
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* 결제수단은 웹의 Toss 호스티드 결제창에서만 등록/변경 (PCI 범위 최소화) */}
              {cardFormOpen && session?.user && (
                <div style={{
                  marginTop: "20px",
                  padding: "20px",
                  borderRadius: "16px",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}>
                  <h4 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 10px 0", color: "var(--b-fg-2)" }}>
                    {t("cardWebTitle")}
                  </h4>
                  <p style={{ fontSize: "12px", color: "var(--b-fg-4)", lineHeight: 1.6, margin: "0 0 16px 0" }}>
                    {t("cardWebBody")}
                  </p>
                  <button
                    type="button"
                    className="b-btn b-btn-primary"
                    onClick={handleOpenWebBilling}
                    style={{
                      background: "linear-gradient(135deg, #7eb09c, #5b8c7a)",
                      border: "none",
                      justifyContent: "center",
                      fontWeight: 700,
                    }}
                  >
                    {t("cardWebCta")}
                  </button>
                </div>
              )}
            </section>

            {/* 🔐 인증 패널 — Google/Kakao/Email Magic Link 실 연동 */}
            <section className="profile-card">
              <div className="profile-card-head">
                <Icon name="shield" size={16} />
                <span>{t("myCloudAccount")}</span>
                <span className={`profile-pill ${session ? "is-pro" : ""}`} style={session ? {
                  background: "rgba(126, 176, 156, 0.15)",
                  color: "#7eb09c"
                } : undefined}>
                  {session ? t("linked") : t("guestMode")}
                </span>
              </div>

              {session?.user && (
                <>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRadius: "12px",
                    padding: "16px",
                    border: "1px solid var(--b-line)",
                    marginBottom: "16px",
                    marginTop: "8px"
                  }}>
                    {/* 소셜 OAuth 이미지 우선 — 실패 시 이름 이니셜 fallback */}
                    {socialAvatarUrl && !avatarImageFailed ? (
                      <img
                        src={socialAvatarUrl}
                        alt={initial}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarImageFailed(true)}
                        style={{
                          width: "56px",
                          height: "56px",
                          borderRadius: "50%",
                          objectFit: "cover",
                          border: "2px solid var(--b-sig)",
                          boxShadow: "0 4px 12px rgba(126,176,156,0.3)",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, var(--b-sig, #5b8c7a), #3c5e52)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "22px",
                        fontWeight: 700,
                        color: "#fff",
                        border: "2px solid var(--b-sig)",
                        boxShadow: "0 4px 12px rgba(126,176,156,0.3)",
                        flexShrink: 0
                      }}>
                        {initial}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--b-fg-1)" }}>
                        {profile.name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || t("userFallback")}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--b-fg-3)" }}>
                        {session.user.email}
                      </span>
                    </div>
                  </div>
                  <p className="profile-card-sub" style={{ marginBottom: "16px" }}>
                    {t("cloudDesc")}
                  </p>
                  <div className="profile-card-actions">
                    {!logoutConfirmOpen ? (
                      <button
                        type="button"
                        className="b-btn b-btn-ghost"
                        onClick={() => setLogoutConfirmOpen(true)}
                        style={{ border: "1px solid rgba(255, 255, 255, 0.1)", color: "#f87171" }}
                      >
                        {t("logout")}
                      </button>
                    ) : (
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        padding: "12px",
                        borderRadius: "12px",
                        background: "rgba(248, 113, 113, 0.05)",
                        border: "1px solid rgba(248, 113, 113, 0.2)",
                        width: "100%",
                        animation: "fadeIn 0.2s ease-out"
                      }}>
                        <div style={{ fontSize: "12px", color: "var(--b-fg-2)", fontWeight: 600 }}>
                          {t("logoutConfirmTitle")}
                          <span style={{ display: "block", fontSize: "11px", color: "var(--b-fg-4)", fontWeight: 400, marginTop: 4 }}>
                            {t("logoutConfirmDesc")}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            className="b-btn"
                            style={{
                              background: "#f87171",
                              color: "#fff",
                              border: "none",
                              fontSize: "11px",
                              padding: "4px 12px",
                              height: "28px",
                              fontWeight: 700,
                              flex: 1,
                              cursor: "pointer"
                            }}
                            onClick={async () => {
                              // 옵티미스틱 UI — useAuth 의 signOut() 이 session/user
                              // state 를 동기적으로 비우고 supabase 글로벌 revoke 는
                              // 백그라운드로 진행. 따라서 클릭 즉시 비로그인 상태로
                              // 전환되고, Windows WebView2 의 reload 깜빡임(1-2s)도
                              // 제거. cross-window 구독 상태 동기화는 'barosit:
                              // subscription-changed' 이벤트 + supabase 의 onAuthState
                              // Change(SIGNED_OUT) 가 처리.
                              setLogoutConfirmOpen(false);
                              setSubPlan("free");
                              setCardInfo(null);
                              setGracePeriodUntil(null);
                              localStorage.setItem("barosit:subscription_plan", "free");
                              localStorage.removeItem("user_profile_v1"); // 이전 사용자 로컬 프로필 캐시 소거 (공용 PC 시나리오)

                              // overlay 가 닫힌 후 MonitorView 가 자연스럽게 비로그인
                              // 상태로 재렌더됩니다. hash 를 빈 값으로 강제하면
                              // hashchange 가 추가 발화하므로 overlay 닫기만 호출.
                              onGoHome();

                              // App.tsx / 다른 windows 의 subscription state 가 즉시
                              // free 로 정합되도록 명시 dispatch. (reload 로 일괄
                              // 청소하던 동작을 대체)
                              window.dispatchEvent(new Event("barosit:subscription-changed"));

                              try {
                                await signOut();
                              } catch (err) {
                                console.error("Logout failed:", err);
                              }
                            }}
                          >
                            {t("logoutYes")}
                          </button>
                          <button
                            type="button"
                            className="b-btn b-btn-ghost"
                            style={{
                              border: "1px solid var(--b-line)",
                              color: "var(--b-fg-2)",
                              fontSize: "11px",
                              padding: "4px 12px",
                              height: "28px",
                              flex: 1,
                              cursor: "pointer"
                            }}
                            onClick={() => setLogoutConfirmOpen(false)}
                          >
                            {t("common:cancel")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>


            {/* 어드민 시스템 제어 센터 */}
            {isAdmin && (
              <section className="profile-card" style={{ border: "1px dashed var(--b-sig, #5b8c7a)", background: "rgba(91, 140, 122, 0.04)" }}>
                <div className="profile-card-head" style={{ color: "var(--b-sig, #5b8c7a)" }}>
                  <Icon name="settings" size={16} />
                  <span>{t("adminControl")}</span>
                  <span className="profile-pill" style={{ background: "rgba(91, 140, 122, 0.2)", color: "#5b8c7a" }}>ADMIN</span>
                </div>
                <p className="profile-card-sub" style={{ marginBottom: 12 }}>
                  {t("adminDesc")}
                </p>
                <div className="profile-card-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {!(window as any).__TAURI_INTERNALS__ && !(window as any).__TAURI__ ? (
                    <button
                      type="button"
                      className="b-btn b-btn-primary"
                      style={{ background: "linear-gradient(135deg, #5b8c7a, #3c5e52)" }}
                      onClick={onOpenAdmin}
                    >
                      {t("adminDashboard")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="b-btn b-btn-primary"
                      style={{
                        background: "linear-gradient(135deg, #5b8c7a, #3c5e52)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      onClick={() => platform.openBrowser(getWebAdminUrl())}
                    >
                      {t("adminDashboardWeb")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="b-btn b-btn-ghost"
                    style={{
                      background: "var(--b-surface)",
                      border: "1px solid var(--b-line-2)",
                      color: "var(--b-fg-1)",
                    }}
                    onClick={() => setAdminModelCalibrateOpen(true)}
                  >
                    {t("adminCalib")}
                  </button>
                </div>
              </section>
            )}


            {/* 이름 */}
            <section className="profile-card">
              <label htmlFor="profile-name" className="profile-card-head">
                <span>{t("displayName")}</span>
              </label>
              <input
                id="profile-name"
                className="profile-input"
                placeholder={t("displayNamePlaceholder")}
                value={profile.name}
                maxLength={24}
                onChange={(e) => update("name", e.target.value)}
              />
              <p className="profile-card-sub">
                {t("displayNameHint")}
              </p>
            </section>

            {/* 작업 환경 */}
            <section className="profile-card">
              <div className="profile-card-head">
                <span>{t("workEnvTitle")}</span>
              </div>
              <div className="profile-radio-row">
                {(["laptop", "external_monitor", "mixed"] as WorkEnv[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`profile-radio ${profile.workEnv === k ? "is-selected" : ""}`}
                    onClick={() => update("workEnv", k)}
                  >
                    {t(`workEnv.${k}`)}
                  </button>
                ))}
              </div>
              <p className="profile-card-sub">
                {t("workEnvHint")}
              </p>
            </section>

            <div className="profile-saved-hint">
              {savedAt ? t("autoSaved") : t("autoSaveHint")}
            </div>

            <div style={{ marginTop: "24px", marginBottom: "12px", display: "flex", justifyContent: "center" }}>
              <button
                type="button"
                className="b-btn b-btn-ghost"
                onClick={onGoHome}
                style={{
                  padding: "10px 24px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "10px",
                  border: "1px solid var(--b-line-2)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(255, 255, 255, 0.02)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  transition: "all 0.2s"
                }}
              >
                <Icon name="chev-l" size={14} />
                {t("backPrev")}
              </button>
            </div>
          </>
        )}


        {adminModelCalibrateOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1050,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(10, 10, 10, 0.75)",
              backdropFilter: "blur(12px)",
              color: "#fff",
            }}
          >
            <div
              style={{
                width: "90%",
                maxWidth: 900,
                background: "var(--b-surface)",
                borderRadius: 24,
                padding: "24px 32px 32px",
                border: "1px solid var(--b-line)",
                boxShadow: "var(--b-shadow-modal)",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                color: "var(--b-fg-1)",
              }}
            >
              {/* 헤더 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "rgba(91, 140, 122, 0.15)",
                      color: "var(--b-sig)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="settings" size={16} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{t("adminModalTitle")}</h3>
                    <p style={{ fontSize: 12, opacity: 0.5, margin: "2px 0 0" }}>
                      {t("adminModalDesc")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAdminModelCalibrateOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--b-fg-2)",
                    cursor: "pointer",
                    opacity: 0.6,
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = "0.6"}
                >
                  <Icon name="x" size={20} />
                </button>
              </div>

              {/* 스크롤 가능한 도구 바디 */}
              <div style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: 6 }} className="b-scroll">
                <AdminTemplateView />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
