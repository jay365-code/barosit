import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { Icon } from "../components/Icon";
import { supabase } from "../auth/supabase";
import { resolveEffectivePlan, isBetaFree } from "../launchMode";
import { priceFor } from "../lib/pricing";

// 토스페이먼츠 SDK 동적 로더
function loadTossPayments(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error(i18n.t("pricing:errSdkNotBrowser")));
      return;
    }
    if ((window as any).TossPayments) {
      resolve((window as any).TossPayments);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v1";
    script.async = true;
    script.onload = () => {
      if ((window as any).TossPayments) {
        resolve((window as any).TossPayments);
      } else {
        reject(new Error(i18n.t("pricing:errSdkLoadFail")));
      }
    };
    script.onerror = () => reject(new Error(i18n.t("pricing:errSdkLoadError")));
    document.head.appendChild(script);
  });
}

export const trackPaymentEvent = (
  eventName:
    | "pricing_view_loaded"
    | "checkout_initiated"
    | "checkout_completed"
    | "checkout_failed"
    | "subscription_cancel_initiated"
    | "subscription_cancel_confirmed"
    | "subscription_resume_confirmed",
  params?: Record<string, any>
) => {
  const payload = {
    event: eventName,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    ...params,
  };
  console.log(`[Analytics]`, JSON.stringify(payload, null, 2));
};

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY || "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";

interface Props {
  onClose: () => void;
  onPlanUpdated?: (newPlan: "free" | "pro") => void;
}

export function PricingView({ onClose, onPlanUpdated }: Props) {
  const { t } = useTranslation("pricing");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentPlan, setCurrentPlan] = useState<"free" | "pro">("free");
  
  // 결제 진행 상태: "idle" | "select_method" | "checkout" | "success"
  const [paymentState, setPaymentState] = useState<"idle" | "select_method" | "checkout" | "success" | "fail">("idle");
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string; delay: number }[]>([]);

  useEffect(() => {
    // 요금제 페이지 뷰 노출 분석 이벤트 트리거
    trackPaymentEvent("pricing_view_loaded", { billingCycle });
  }, [billingCycle]);

  useEffect(() => {
    const fetchUserAndPlan = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userObj = session?.user || null;
        let actualPlan: "free" | "pro" = "free";

        if (userObj) {
          setCurrentUser(userObj);
          // 구독 조회
          const { data, error } = await supabase
            .from("user_subscriptions")
            .select("plan_id, status, current_period_end")
            .eq("user_id", userObj.id)
            .maybeSingle();

          if (!error && data) {
            actualPlan = resolveEffectivePlan(data);
          } else {
            // RLS 에러 등으로 조회 불가능하거나 없는 경우 안전하게 로컬 캐시 기준 판단하되 free가 기본값 (베타 모드면 PRO)
            const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
            actualPlan = isBetaFree() ? "pro" : (localPlan || "free");
          }

          const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";

          // [보안강화] DB 분석 상태 기준 로컬스토리지를 강제 Overwrite 및 위변조 감지
          if (actualPlan === "free" && localPlan === "pro") {
            console.warn("Security Warning: Subscription plan tampering detected in PricingView!");
            
            // 1. admin_notifications 테이블에 critical 경보 적재
            await supabase.from("admin_notifications").insert({
              event_type: "tampering_detected",
              severity: "critical",
              message: `보안 침해 감지 (요금제): 사용자 ${userObj.email} 님이 요금제 화면 진입 시 로컬 요금제 캐시를 PRO로 불법 변조한 정황이 포착되어, 시스템이 권한을 격하하고 로그를 기록했습니다.`,
              payload: {
                user_id: userObj.id,
                email: userObj.email,
                local_plan: "pro",
                db_plan: "free",
                detected_at: new Date().toISOString()
              }
            });

            // 2. 강제 롤백
            localStorage.setItem("barosit:subscription_plan", "free");
            setCurrentPlan("free");
            window.dispatchEvent(new Event("barosit:subscription-changed"));
          } else {
            localStorage.setItem("barosit:subscription_plan", actualPlan);
            setCurrentPlan(actualPlan);
          }

          // 로그인 성공 복귀 후 대기 중이던 결제 복구 실행
          const pendingSub = localStorage.getItem("barosit:pending_subscription");
          if (pendingSub === "true" && actualPlan !== "pro") {
            localStorage.removeItem("barosit:pending_subscription");
            const pendingCycle = localStorage.getItem("barosit:pending_subscription_cycle") as "monthly" | "yearly";
            localStorage.removeItem("barosit:pending_subscription_cycle");
            if (pendingCycle) {
              setBillingCycle(pendingCycle);
            }
            setTimeout(() => {
              handleTossPayment("카드", userObj, pendingCycle);
            }, 150);
          }
        } else {
          // [보안강화] 비로그인 Guest일 시 로컬스토리지를 강제로 'free'로 격하하여 우회 공격 완전 차단
          localStorage.setItem("barosit:subscription_plan", "free");
          setCurrentPlan("free");
        }

        // Toss Payments 결제 복원 핸들링
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const paymentStatus = params.get("payment");
          const authKey = params.get("authKey");
          if (paymentStatus === "success") {
            setPaymentState("checkout");
            const cycleParam = params.get("cycle") as "monthly" | "yearly" || "monthly";
            const finalAmount = priceFor(cycleParam);

            setTimeout(async () => {
              const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
              try {
                if (!userObj) throw new Error("로그인이 필요합니다.");

                // Toss 가 successUrl 에 authKey + customerKey 를 붙여 리다이렉트함.
                const customerKey = params.get("customerKey");
                if (!authKey || !customerKey) {
                  throw new Error("결제 인증 정보를 받지 못했습니다.");
                }

                // 서버 신뢰 단일 경로 — 빌링키 발급 + 첫 청구 + PRO 활성화는 Edge Function 이 수행
                const { data: issueData, error: issueError } = await supabase.functions.invoke(
                  "billing-issue",
                  { body: { authKey, customerKey, billingCycle: cycleParam } }
                );
                if (issueError || !issueData?.success) {
                  throw new Error(issueData?.error || issueError?.message || "결제 처리에 실패했습니다.");
                }

                localStorage.setItem("barosit:subscription_plan", "pro");
                setCurrentPlan("pro");
                setPaymentState("success");
                triggerConfetti();
                if (onPlanUpdated) {
                  onPlanUpdated("pro");
                }

                trackPaymentEvent("checkout_completed", {
                  billingCycle: cycleParam,
                  amount: finalAmount,
                  user: userObj?.email
                });

                window.history.replaceState({}, document.title, cleanUrl);
              } catch (e: any) {
                console.error("billing-issue failed:", e);
                setPaymentState("fail");
                trackPaymentEvent("checkout_failed", {
                  reason: e?.message || String(e),
                  user: userObj?.email
                });
                window.history.replaceState({}, document.title, cleanUrl);
              }
            }, 1200);
          } else if (paymentStatus === "fail") {
            // 결제 실패 분석 이벤트 전송
            trackPaymentEvent("checkout_failed", {
              reason: "paymentStatus is fail from query param",
              user: userObj?.email
            });

            // admin_notifications 테이블에 warning 알림 적재
            await supabase.from("admin_notifications").insert({
              event_type: "payment_failed",
              severity: "warning",
              message: `결제 실패: 사용자 ${userObj?.email || "비회원"} 님의 토스페이 결제 승인이 거절되거나 실패했습니다. (쿼리 파라미터 오류 수신)`,
              payload: {
                user_id: userObj?.id || null,
                email: userObj?.email || null,
                reason: "paymentStatus is fail from redirect query",
                failed_at: new Date().toISOString()
              }
            });

            alert(t("errPaymentFailed"));
            const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
            window.history.replaceState({}, document.title, cleanUrl);
            setPaymentState("idle");
          }
        }
      } catch (err) {
        console.error("Failed to load user or subscription status:", err);
      }
    };
    fetchUserAndPlan();
  }, []);

  // 축하 파티클 생성
  const triggerConfetti = () => {
    const colors = ["#7eb09c", "#a3cdbb", "#ebdcb9", "#ebd2b9", "#ebd2c8", "#5b8c7a", "#ffeedb"];
    const newParticles = Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100 - 50, // center offset x
      y: Math.random() * 100 - 50, // center offset y
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.4,
    }));
    setParticles(newParticles);
  };

  // 모의 결제 시작
  const handleUpgradeToPro = async () => {
    if (currentPlan === "pro") return;

    if (!currentUser) {
      // 로그인되어 있지 않은 상태: 로그인 페이지로 리다이렉트 및 로그인 성공 시 복귀 설정
      localStorage.setItem("barosit:auth_redirect", "#/app");
      localStorage.setItem("barosit:open_pricing_on_load", "true");
      localStorage.setItem("barosit:pending_subscription", "true");
      localStorage.setItem("barosit:pending_subscription_cycle", billingCycle);
      window.location.hash = "#/login";
      onClose();
      return;
    }

    // 중간 선택 단계 없이 바로 토스 통합 결제창 요청 실행
    await handleTossPayment("카드");
  };

  // 실제 토스페이먼츠 카드 등록 및 빌링 요청 실행
  const handleTossPayment = async (
    _method: "카드" | "토스페이",
    userOverride?: any,
    cycleOverride?: "monthly" | "yearly"
  ) => {
    // 베타 무료 기간에는 결제 진입 차단 — 전 기능이 이미 개방돼 있음
    if (isBetaFree()) {
      onClose();
      return;
    }
    setPaymentState("checkout");
    const activeUser = userOverride || currentUser;
    const activeCycle = cycleOverride || billingCycle;
    const amount = priceFor(activeCycle);

    // 정기 결제 카드 등록 시도 로깅
    trackPaymentEvent("checkout_initiated", {
      billingCycle: activeCycle,
      amount,
      method: "카드(정기결제)",
      user: activeUser?.email
    });

    try {
      const TossPaymentsLib = await loadTossPayments();
      const toss = TossPaymentsLib(TOSS_CLIENT_KEY);
      
      // 정기결제 customerKey 는 user 당 안정적(결정적)이어야 한다(§11 M2) — 매번
      // 랜덤이면 카드 변경 시 Toss 측 고객-빌링키 연결이 분기돼 추적이 어렵다.
      const customerKey = activeUser
        ? `cust-${activeUser.id}`
        : `cust-guest-${Math.random().toString(36).substring(2, 10)}`;

      // 정기 구독 결제를 위한 카드 등록 창(requestBillingAuth) 실행
      await toss.requestBillingAuth("카드", {
        customerKey,
        successUrl: window.location.origin + window.location.pathname + `?redirect_route=app&payment=success&cycle=${activeCycle}`,
        failUrl: window.location.origin + window.location.pathname + `?redirect_route=app&payment=fail`,
      });
    } catch (err: any) {
      // 결제창 실행 오류 분석 이벤트 로깅
      trackPaymentEvent("checkout_failed", {
        reason: err.message,
        user: activeUser?.email
      });

      // admin_notifications 테이블에 warning 알림 적재
      await supabase.from("admin_notifications").insert({
        event_type: "payment_failed",
        severity: "warning",
        message: `결제 실패 (SDK): 사용자 ${activeUser?.email || "비회원"} 님의 결제창 호출 혹은 진행 중 오류가 발생했습니다: ${err.message}`,
        payload: {
          user_id: activeUser?.id || null,
          email: activeUser?.email || null,
          reason: err.message,
          failed_at: new Date().toISOString()
        }
      });

      alert(t("errPaymentWindow") + err.message);
      setPaymentState("idle");
    }
  };

  return (
    <div className="b-overlay" style={{ backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", padding: "16px" }}>
      <style>{`
        .pricing-modal {
          background: rgba(21, 24, 26, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 30px 100px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05);
          width: 100%;
          max-width: 780px;
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          color: var(--b-fg-1);
          animation: pricingScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes pricingScaleIn {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .pricing-inner-scroll {
          max-height: 85vh;
          overflow-y: auto;
          padding: 32px 32px 24px;
        }

        .pricing-close-btn {
          position: absolute;
          top: 20px;
          right: 20px;
          background: rgba(255, 255, 255, 0.05);
          border: none;
          color: var(--b-fg-2);
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
          z-index: 10;
        }
        .pricing-close-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: var(--b-fg-1);
        }

        .pricing-headline {
          text-align: center;
          margin-bottom: 24px;
        }
        .pricing-headline h2 {
          font-size: 22px;
          font-weight: 800;
          margin: 0 0 8px;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #fff 30%, rgba(255,255,255,0.7) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .pricing-headline p {
          font-size: 13px;
          color: var(--b-fg-3);
          margin: 0;
        }

        /* Cycle Switcher */
        .pricing-cycle-container {
          display: flex;
          justify-content: center;
          margin-bottom: 32px;
        }
        .pricing-cycle-bar {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 4px;
          border-radius: 999px;
          display: flex;
          position: relative;
          gap: 4px;
        }
        .pricing-cycle-btn {
          border: none;
          background: transparent;
          color: var(--b-fg-3);
          padding: 8px 16px;
          font-size: 12px;
          font-weight: 700;
          border-radius: 999px;
          cursor: pointer;
          transition: color 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .pricing-cycle-btn.active {
          background: rgba(126, 176, 156, 0.15);
          color: #7eb09c;
        }
        .pricing-save-badge {
          background: #e08866;
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          padding: 1px 6px;
          border-radius: 999px;
          animation: pulseGlow 2s infinite;
        }

        @keyframes pulseGlow {
          0% { box-shadow: 0 0 0 0 rgba(224, 136, 102, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(224, 136, 102, 0); }
          100% { box-shadow: 0 0 0 0 rgba(224, 136, 102, 0); }
        }

        /* 2-Column Cards */
        .pricing-cards-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 32px;
        }

        .pricing-plan-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          padding: 28px 24px;
          display: flex;
          flex-direction: column;
          position: relative;
          transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
        }
        .pricing-plan-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.08);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
        }

        .pricing-plan-card.pro-card {
          background: linear-gradient(180deg, rgba(126, 176, 156, 0.06) 0%, rgba(21, 24, 26, 0.4) 100%);
          border-color: rgba(126, 176, 156, 0.35);
          box-shadow: 0 0 30px rgba(126, 176, 156, 0.05);
        }
        .pricing-plan-card.pro-card:hover {
          border-color: rgba(126, 176, 156, 0.6);
          box-shadow: 0 0 40px rgba(126, 176, 156, 0.12), 0 8px 30px rgba(0, 0, 0, 0.4);
        }

        .pro-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #7eb09c, #5b8c7a);
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          padding: 4px 14px;
          border-radius: 999px;
          letter-spacing: 0.05em;
          box-shadow: 0 4px 10px rgba(91, 140, 122, 0.4);
        }

        .pricing-plan-name {
          font-size: 14px;
          font-weight: 700;
          color: var(--b-fg-2);
          margin: 0 0 8px;
        }
        .pro-card .pricing-plan-name {
          color: #7eb09c;
        }

        .pricing-plan-price {
          margin-bottom: 20px;
          display: flex;
          align-items: baseline;
          gap: 4px;
        }
        .pricing-plan-price .amount {
          font-size: 28px;
          font-weight: 800;
          color: var(--b-fg-1);
        }
        .pricing-plan-price .unit {
          font-size: 12px;
          color: var(--b-fg-3);
        }

        .pricing-plan-desc {
          font-size: 12px;
          color: var(--b-fg-3);
          line-height: 1.5;
          margin: 0 0 24px;
          height: 36px;
        }

        .pricing-action-btn {
          width: 100%;
          height: 42px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
          border: none;
          margin-bottom: 24px;
        }

        .free-btn {
          background: rgba(255, 255, 255, 0.05);
          color: var(--b-fg-2);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .free-btn:hover {
          background: rgba(255, 255, 255, 0.09);
          color: var(--b-fg-1);
        }
        .free-btn.current {
          background: rgba(255, 255, 255, 0.03);
          color: var(--b-fg-4);
          cursor: default;
          border-color: transparent;
        }

        .pro-btn {
          background: linear-gradient(135deg, #7eb09c, #5b8c7a);
          color: #fff;
          box-shadow: 0 4px 15px rgba(91, 140, 122, 0.25);
        }
        .pro-btn:hover {
          background: linear-gradient(135deg, #8dc0ad, #6b9c8a);
          box-shadow: 0 6px 20px rgba(91, 140, 122, 0.35);
        }
        .pro-btn.current {
          background: rgba(126, 176, 156, 0.1);
          color: #7eb09c;
          border: 1px solid rgba(126, 176, 156, 0.2);
          cursor: default;
          box-shadow: none;
        }

        /* Bullet List */
        .pricing-bullets {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .pricing-bullet-item {
          display: flex;
          font-size: 12px;
          gap: 8px;
          align-items: flex-start;
          line-height: 1.4;
          color: var(--b-fg-2);
        }
        .pricing-bullet-item.disabled {
          color: var(--b-fg-4);
        }
        .bullet-icon {
          flex-shrink: 0;
          margin-top: 1px;
        }
        .bullet-icon.check { color: #7eb09c; }
        .bullet-icon.x { color: var(--b-warn, #e08866); }

        /* Detail Table Link */
        .pricing-legal-footer {
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: var(--b-fg-4);
        }
        .pricing-legal-footer a {
          color: #7eb09c;
          text-decoration: underline;
          cursor: pointer;
        }

        /* Checkout Spinner Overlay */
        .checkout-loading-overlay {
          position: absolute;
          inset: 0;
          background: rgba(15, 18, 20, 0.95);
          z-index: 20;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 20px;
        }
        .spinner {
          width: 48px;
          height: 48px;
          border: 3px solid rgba(126, 176, 156, 0.1);
          border-top-color: #7eb09c;
          border-radius: 50%;
          animation: spin 1s infinite linear;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Celebration Screen & Download Modal */
        .checkout-success-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 24px 8px;
          position: relative;
        }
        .success-circle {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(126, 176, 156, 0.1);
          border: 2px solid #7eb09c;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #7eb09c;
          margin-bottom: 20px;
          font-size: 32px;
          animation: successPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }
        @keyframes successPop {
          0% { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }

        .success-headline {
          font-size: 20px;
          font-weight: 800;
          margin: 0 0 12px;
          color: #fff;
        }
        .success-desc {
          font-size: 13px;
          color: var(--b-fg-2);
          line-height: 1.6;
          max-width: 440px;
          margin: 0 0 32px;
        }

        /* Download Boxes */
        .download-boxes {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          width: 100%;
          max-width: 480px;
          margin-bottom: 24px;
        }
        .download-box {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s, transform 0.15s;
        }
        .download-box:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(126, 176, 156, 0.4);
          transform: translateY(-2px);
        }
        .download-box:active {
          transform: translateY(0);
        }
        .download-os-name {
          font-size: 13px;
          font-weight: 700;
          margin: 10px 0 4px;
          color: #fff;
        }
        .download-btn-label {
          font-size: 11px;
          color: #7eb09c;
          font-weight: 600;
        }

        /* CSS Confetti Sparkles */
        .confetti-sparkle {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 3px;
          top: 40%;
          left: 50%;
          opacity: 0;
          pointer-events: none;
          animation: floatSparkle 1.8s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
        }
        @keyframes floatSparkle {
          0% {
            transform: translate(0, 0) scale(1) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translate(var(--tx), var(--ty)) scale(0.2) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>

      <div className="pricing-modal">
        {paymentState !== "success" && (
          <button
            type="button"
            className="pricing-close-btn"
            onClick={onClose}
            aria-label={i18n.t("common:close")}
          >
            <Icon name="x" size={16} />
          </button>
        )}

        {/* 1. 가상 결제 승인 중 화면 */}
        {paymentState === "checkout" && (
          <div className="checkout-loading-overlay">
            <div className="spinner" />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: "#fff" }}>
                {t("approving")}
              </div>
              <div style={{ fontSize: 12, color: "var(--b-fg-3)" }}>
                {t("approvingDesc")}
              </div>
            </div>
          </div>
        )}



        <div className="pricing-inner-scroll b-scroll">
          {paymentState !== "success" ? (
            <>
              {/* 타이틀 및 소개 */}
              <header className="pricing-headline">
                <h2>{t("title")}</h2>
                <p>{t("subtitle")}</p>
              </header>

              {/* 월간/연간 스위치 */}
              <div className="pricing-cycle-container">
                <div className="pricing-cycle-bar">
                  <button
                    type="button"
                    className={`pricing-cycle-btn ${billingCycle === "monthly" ? "active" : ""}`}
                    onClick={() => setBillingCycle("monthly")}
                  >
                    {t("monthly")}
                  </button>
                  <button
                    type="button"
                    className={`pricing-cycle-btn ${billingCycle === "yearly" ? "active" : ""}`}
                    onClick={() => setBillingCycle("yearly")}
                  >
                    {t("yearly")}
                    <span className="pricing-save-badge">{t("saveBadge")}</span>
                  </button>
                </div>
              </div>

              {/* 요금제 카드 비교 그리드 */}
              <div className="pricing-cards-grid">
                {/* 1. FREE PLAN */}
                <article className="pricing-plan-card">
                  <h3 className="pricing-plan-name">FREE</h3>
                  <div className="pricing-plan-price">
                    <span className="amount">{t("free.amount")}</span>
                    <span className="unit">{t("free.unit")}</span>
                  </div>
                  <p className="pricing-plan-desc">
                    {t("free.tagline")}
                  </p>

                  <button
                    type="button"
                    className={`pricing-action-btn free-btn ${currentPlan === "free" ? "current" : ""}`}
                    disabled
                  >
                    {currentPlan === "free" ? t("free.ctaCurrent") : t("free.ctaUse")}
                  </button>

                  <ul className="pricing-bullets">
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      {t("free.feat1")}
                    </li>
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      {t("free.feat2")}
                    </li>
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      {t("free.feat3")}
                    </li>
                    <li className="pricing-bullet-item disabled">
                      <span className="bullet-icon x"><Icon name="x" size={14} /></span>
                      {t("free.feat4")}
                    </li>
                    <li className="pricing-bullet-item disabled">
                      <span className="bullet-icon x"><Icon name="x" size={14} /></span>
                      {t("free.feat5")}
                    </li>
                  </ul>
                </article>

                {/* 2. PRO PLAN (Recommended) */}
                <article className="pricing-plan-card pro-card">
                  <div className="pro-badge">RECOMMENDED</div>
                  <h3 className="pricing-plan-name">{t("pro.name")}</h3>
                  <div className="pricing-plan-price">
                    {billingCycle === "yearly" ? (
                      <>
                        <span className="amount" style={{ color: "#7eb09c" }}>{t("pro.yearAmount")}</span>
                        <span className="unit" style={{ marginLeft: 4 }}>{t("pro.yearUnit")}</span>
                      </>
                    ) : (
                      <>
                        <span className="amount">{t("pro.monthAmount")}</span>
                        <span className="unit">{t("pro.monthUnit")}</span>
                      </>
                    )}
                  </div>
                  <p className="pricing-plan-desc">
                    {t("pro.tagline")}
                  </p>

                  <button
                    type="button"
                    className={`pricing-action-btn pro-btn ${currentPlan === "pro" ? "current" : ""}`}
                    onClick={handleUpgradeToPro}
                    disabled={currentPlan === "pro"}
                  >
                    {currentPlan === "pro" ? t("pro.ctaCurrent") : t("pro.ctaStart")}
                  </button>

                  <ul className="pricing-bullets">
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      <strong>{t("pro.feat1")}</strong>
                    </li>
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      {t("pro.feat2")}
                    </li>
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      {t("pro.feat3")}
                    </li>
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      {t("pro.feat4")}
                    </li>
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      {t("pro.feat5")}
                    </li>
                  </ul>
                </article>
              </div>

              {/* 하단 약관 고지 */}
              <footer className="pricing-legal-footer">
                {t("krwNote") && <span>{t("krwNote")}</span>}
                <span>{t("demoNote")}</span>
                <span>
                  {t("refundNote")}<a onClick={() => alert(t("policyAlert"))}>{t("refundLink")}</a>
                </span>
              </footer>
            </>
          ) : (
            /* 2. 결제 완료 및 Tauri 데스크톱 앱 다운로드 화면 */
            <div className="checkout-success-view">
              {/* CSS Confetti Particles */}
              {particles.map((p) => (
                <div
                  key={p.id}
                  className="confetti-sparkle"
                  style={{
                    backgroundColor: p.color,
                    animationDelay: `${p.delay}s`,
                    "--tx": `${p.x * 4}px`,
                    "--ty": `${p.y * 4 - 80}px`,
                  } as any}
                />
              ))}

              <div className="success-circle">🎉</div>
              <h2 className="success-headline">{t("successHeadline")}</h2>
              <p className="success-desc">
                {t("successDesc1")}
                {" "}{t("successDesc2")}
              </p>

              {/* 다운로드 버튼 */}
              <div className="download-boxes">
                <a
                  className="download-box"
                  onClick={() => alert(t("macSoon"))}
                >
                  <Icon name="sparkle" size={28} style={{ color: "#7eb09c" }} />
                  <span className="download-os-name">{t("macOnly")}</span>
                  <span className="download-btn-label">Tauri 2 App (.dmg)</span>
                </a>
                <a
                  className="download-box"
                  onClick={() => alert(t("winSoon"))}
                >
                  <Icon name="cpu" size={28} style={{ color: "#7eb09c" }} />
                  <span className="download-os-name">{t("winOnly")}</span>
                  <span className="download-btn-label">Tauri 2 App (.exe)</span>
                </a>
              </div>

              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="b-btn b-btn-primary"
                  onClick={onClose}
                  style={{ padding: "10px 24px", borderRadius: "10px" }}
                >
                  {t("backDashboard")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
