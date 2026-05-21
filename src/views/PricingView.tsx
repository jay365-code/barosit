import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { supabase } from "../auth/supabase";

interface Props {
  onClose: () => void;
  onPlanUpdated?: (newPlan: "free" | "pro") => void;
}

export function PricingView({ onClose, onPlanUpdated }: Props) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentPlan, setCurrentPlan] = useState<"free" | "pro">("free");
  
  // 결제 진행 상태: "idle" | "checkout" | "success"
  const [paymentState, setPaymentState] = useState<"idle" | "checkout" | "success">("idle");
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string; delay: number }[]>([]);

  useEffect(() => {
    const fetchUserAndPlan = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setCurrentUser(session.user);
          // 구독 조회
          const { data, error } = await supabase
            .from("user_subscriptions")
            .select("plan_id, status")
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (!error && data && data.status === "active") {
            const plan = data.plan_id === "pro" ? "pro" : "free";
            setCurrentPlan(plan);
          } else {
            // 로컬스토리지 백업 체크
            const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
            setCurrentPlan(localPlan || "free");
          }
        } else {
          // 비로그인 Guest용 로컬 계획 조회
          const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
          setCurrentPlan(localPlan || "free");
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

    setPaymentState("checkout");
    
    // 2초 가상 트랜잭션 대기
    setTimeout(async () => {
      try {
        if (currentUser) {
          // 로그인한 유저: Supabase에 업데이트
          const { error } = await supabase
            .from("user_subscriptions")
            .upsert({
              user_id: currentUser.id,
              plan_id: "pro",
              status: "active",
              updated_at: new Date().toISOString()
            }, { onConflict: "user_id" });

          if (error) throw error;
        }

        // 공통: 로컬스토리지 영구 기록 및 상태 동기화
        localStorage.setItem("barosit:subscription_plan", "pro");
        setCurrentPlan("pro");
        setPaymentState("success");
        triggerConfetti();
        if (onPlanUpdated) {
          onPlanUpdated("pro");
        }
      } catch (err: any) {
        alert("결제 처리 중 서버 에러가 발생했습니다: " + err.message);
        setPaymentState("idle");
      }
    }, 2000);
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
            aria-label="닫기"
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
                결제 승인 진행 중
              </div>
              <div style={{ fontSize: 12, color: "var(--b-fg-3)" }}>
                가상의 모의 결제 요청을 안전하게 승인하고 있습니다...
              </div>
            </div>
          </div>
        )}

        <div className="pricing-inner-scroll b-scroll">
          {paymentState !== "success" ? (
            <>
              {/* 타이틀 및 소개 */}
              <header className="pricing-headline">
                <h2>바른 자세의 시작, BaroSit 요금제</h2>
                <p>웹 브라우저를 통한 간편 체험부터 데스크톱 전용 앱까지 나에게 맞는 환경을 선택해보세요</p>
              </header>

              {/* 월간/연간 스위치 */}
              <div className="pricing-cycle-container">
                <div className="pricing-cycle-bar">
                  <button
                    type="button"
                    className={`pricing-cycle-btn ${billingCycle === "monthly" ? "active" : ""}`}
                    onClick={() => setBillingCycle("monthly")}
                  >
                    월간 결제
                  </button>
                  <button
                    type="button"
                    className={`pricing-cycle-btn ${billingCycle === "yearly" ? "active" : ""}`}
                    onClick={() => setBillingCycle("yearly")}
                  >
                    연간 결제
                    <span className="pricing-save-badge">연 38% 할인 🔥</span>
                  </button>
                </div>
              </div>

              {/* 요금제 카드 비교 그리드 */}
              <div className="pricing-cards-grid">
                {/* 1. FREE PLAN */}
                <article className="pricing-plan-card">
                  <h3 className="pricing-plan-name">FREE</h3>
                  <div className="pricing-plan-price">
                    <span className="amount">0원</span>
                    <span className="unit">/ 평생 무료</span>
                  </div>
                  <p className="pricing-plan-desc">
                    브라우저 실행 한 번으로 바로 체감할 수 있는 온보딩 웹 모니터링 엔진
                  </p>

                  <button
                    type="button"
                    className={`pricing-action-btn free-btn ${currentPlan === "free" ? "current" : ""}`}
                    disabled
                  >
                    {currentPlan === "free" ? "현재 이용 중인 플랜" : "웹 브라우저에서 상시 무료"}
                  </button>

                  <ul className="pricing-bullets">
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      4종 핵심 실시간 자세 감지 피드백
                    </li>
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      온디바이스 실루엣 프라이버시 필터
                    </li>
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      바른 자세 스트레칭 가이드 & 보상 리포트
                    </li>
                    <li className="pricing-bullet-item disabled">
                      <span className="bullet-icon x"><Icon name="x" size={14} /></span>
                      백그라운드 모니터링 (브라우저 숨김 시 연산 정지)
                    </li>
                    <li className="pricing-bullet-item disabled">
                      <span className="bullet-icon x"><Icon name="x" size={14} /></span>
                      미니 데스크톱 위젯 모드 (Tauri 앱 전용)
                    </li>
                  </ul>
                </article>

                {/* 2. PRO PLAN (Recommended) */}
                <article className="pricing-plan-card pro-card">
                  <div className="pro-badge">RECOMMENDED</div>
                  <h3 className="pricing-plan-name">PRO (데스크톱 앱 전용)</h3>
                  <div className="pricing-plan-price">
                    {billingCycle === "yearly" ? (
                      <>
                        <span className="amount" style={{ color: "#7eb09c" }}>연 36,000원</span>
                        <span className="unit" style={{ marginLeft: 4 }}>(월 3,000원 꼴)</span>
                      </>
                    ) : (
                      <>
                        <span className="amount">월 4,900원</span>
                        <span className="unit">/ 매월 정기 결제</span>
                      </>
                    )}
                  </div>
                  <p className="pricing-plan-desc">
                    백그라운드 무자각 관제와 AI 맞춤 코칭을 품은 최고의 데스크톱 동반자
                  </p>

                  <button
                    type="button"
                    className={`pricing-action-btn pro-btn ${currentPlan === "pro" ? "current" : ""}`}
                    onClick={handleUpgradeToPro}
                    disabled={currentPlan === "pro"}
                  >
                    {currentPlan === "pro" ? "이용 중인 프로페셔널 플랜" : "프로페셔널 시작하기"}
                  </button>

                  <ul className="pricing-bullets">
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      <strong>완벽한 백그라운드 모니터링 (Tauri 앱)</strong>
                    </li>
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      OS 네이티브 푸시 알림 & 시스템 트레이 이모지 상태 관제
                    </li>
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      화면 구석에 띄우는 미니 데스크톱 위젯 모드 지원
                    </li>
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      90일 자세 정밀 캘린더 분석 및 세부 시간대 차트
                    </li>
                    <li className="pricing-bullet-item">
                      <span className="bullet-icon check"><Icon name="check" size={14} /></span>
                      모든 PC/노트북 간 실시간 다중 기기 싱크
                    </li>
                  </ul>
                </article>
              </div>

              {/* 하단 약관 고지 */}
              <footer className="pricing-legal-footer">
                <span>* 모의 결제 데모이며 실물 대금이 청구되지 않습니다.</span>
                <span>
                  결제 즉시 7일 이내 환불 가능 • <a onClick={() => alert("약관은 docs/pricing-policy.md를 통해 확인하실 수 있습니다.")}>환불 규정 확인</a>
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
              <h2 className="success-headline">PRO 구독 결제가 완료되었습니다!</h2>
              <p className="success-desc">
                최고의 바른 자세 관제 파트너, BaroSit PRO 패밀리가 되신 것을 진심으로 환영합니다.
                아래에서 사용하시는 OS용 설치형 데스크톱 전용 앱을 다운로드하여 실행하세요.
              </p>

              {/* 다운로드 버튼 */}
              <div className="download-boxes">
                <a
                  className="download-box"
                  onClick={() => alert("Tauri macOS용 다운로드(.dmg)가 준비되는 중입니다.")}
                >
                  <Icon name="sparkle" size={28} style={{ color: "#7eb09c" }} />
                  <span className="download-os-name">macOS 전용</span>
                  <span className="download-btn-label">Tauri 2 App (.dmg)</span>
                </a>
                <a
                  className="download-box"
                  onClick={() => alert("Tauri Windows용 다운로드(.exe)가 준비되는 중입니다.")}
                >
                  <Icon name="cpu" size={28} style={{ color: "#7eb09c" }} />
                  <span className="download-os-name">Windows 전용</span>
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
                  대시보드로 돌아가기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
