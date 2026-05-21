// 사용자 프로필 페이지 — Phase 0: 로컬 stub.
// - 이름·아바타·작업환경 입력 (localStorage user_profile_v1)
// - "로그인 / 회원가입" 섹션은 비활성 안내 (Phase 1 예정)
// - "홈으로" 버튼 → 메인 모니터 화면 복귀

import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { supabase } from "../auth/supabase";
import {
  DEFAULT_AVATAR_OPTIONS,
  WORK_ENV_LABEL,
  loadProfile,
  saveProfile,
  type UserProfile,
  type WorkEnv,
} from "../userProfile";

interface Props {
  onGoHome: () => void;
  onOpenAdmin?: () => void;
  onOpenPricing?: () => void;
}

export function ProfileView({ onGoHome, onOpenAdmin, onOpenPricing }: Props) {
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [subPlan, setSubPlan] = useState<"free" | "pro">("free");
  const [subStatus, setSubStatus] = useState<string>("active");
  const [subUpdatedAt, setSubUpdatedAt] = useState<string | null>(null);
  const [subPeriodEnd, setSubPeriodEnd] = useState<string | null>(null);

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data, error } = await supabase
            .from("profiles")
            .select("is_admin")
            .eq("id", session.user.id)
            .single();
          
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

  useEffect(() => {
    const fetchSub = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let actualPlan: "free" | "pro" = "free";

        if (session?.user) {
          const { data, error } = await supabase
            .from("user_subscriptions")
            .select("plan_id, status, current_period_end, updated_at")
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (!error && data) {
            const isPro = data.plan_id === "pro" && (
              data.status === "active" ||
              (data.status === "canceled" && data.current_period_end && new Date(data.current_period_end) > new Date())
            );
            actualPlan = isPro ? "pro" : "free";
            setSubStatus(data.status);
            setSubUpdatedAt(data.updated_at);
            setSubPeriodEnd(data.current_period_end);
          } else {
            const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
            actualPlan = localPlan || "free";
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
        }
      } catch (err) {
        console.error("Failed to load user subscription:", err);
        const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
        setSubPlan(localPlan || "free");
      }
    };
    fetchSub();

    const handleSubChanged = () => {
      const p = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
      setSubPlan(p || "free");
    };
    window.addEventListener("barosit:subscription-changed", handleSubChanged);
    window.addEventListener("storage", handleSubChanged); // 로컬스토리지 타탭 싱크용
    return () => {
      window.removeEventListener("barosit:subscription-changed", handleSubChanged);
      window.removeEventListener("storage", handleSubChanged);
    };
  }, []);

  // 자동 저장 — 입력 후 600ms debounce
  useEffect(() => {
    const t = setTimeout(() => {
      saveProfile(profile);
      setSavedAt(Date.now());
    }, 600);
    return () => clearTimeout(t);
  }, [profile]);

  const handleRefund = async () => {
    if (!window.confirm("정말로 즉시 환불을 신청하시겠습니까?\n환불 완료 즉시 데스크톱 PRO 다운로드 권한이 회수되며 FREE 플랜으로 전환됩니다.")) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      // 1. user_subscriptions DB 업데이트
      const { error: subError } = await supabase
        .from("user_subscriptions")
        .update({
          plan_id: "free",
          status: "refunded",
          updated_at: new Date().toISOString()
        })
        .eq("user_id", session.user.id);

      if (subError) throw subError;

      // 2. admin_notifications에 warning 알림 즉석 적재
      await supabase.from("admin_notifications").insert({
        event_type: "refund_requested",
        severity: "warning",
        message: `환불 접수: 사용자 ${session.user.email} 님이 7일 이내 즉시 환불(금액 반환)을 정상 접수했습니다.`,
        payload: {
          user_id: session.user.id,
          email: session.user.email,
          action: "instant_refund",
          refunded_at: new Date().toISOString()
        }
      });

      // 3. 로컬 캐시 업데이트 및 상태 싱크
      localStorage.setItem("barosit:subscription_plan", "free");
      setSubPlan("free");
      setSubStatus("refunded");
      window.dispatchEvent(new Event("barosit:subscription-changed"));
      alert("성공적으로 환불 및 정기 구독 취소가 완료되었습니다. 무료 버전으로 전환됩니다.");
    } catch (err) {
      console.error("Refund failed:", err);
      alert("환불 처리 도중 오류가 발생했습니다. 고객센터에 문의바랍니다.");
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm("정말로 정기 구독을 취소하시겠습니까?\n구독을 해지하셔도 이번 달 남은 약정 만료일까지는 계속 이용이 가능합니다.")) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { error: subError } = await supabase
        .from("user_subscriptions")
        .update({
          status: "canceled",
          updated_at: new Date().toISOString()
        })
        .eq("user_id", session.user.id);

      if (subError) throw subError;

      await supabase.from("admin_notifications").insert({
        event_type: "cancellation",
        severity: "info",
        message: `정기 해지: 사용자 ${session.user.email} 님이 정기 구독 갱신 해지를 접수했습니다. (남은 기간 제공)`,
        payload: {
          user_id: session.user.id,
          email: session.user.email,
          action: "cancel_subscription",
          canceled_at: new Date().toISOString()
        }
      });

      setSubStatus("canceled");
      alert("정기 구독 갱신이 해지되었습니다. 남은 기간 만료일까지 혜택은 유지됩니다.");
    } catch (err) {
      console.error("Cancellation failed:", err);
      alert("해지 신청 도중 에러가 발생했습니다.");
    }
  };

  const handleResumeSubscription = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { error: subError } = await supabase
        .from("user_subscriptions")
        .update({
          status: "active",
          updated_at: new Date().toISOString()
        })
        .eq("user_id", session.user.id);

      if (subError) throw subError;

      await supabase.from("admin_notifications").insert({
        event_type: "signup",
        severity: "info",
        message: `구독 복구: 사용자 ${session.user.email} 님이 취소 해지 처리했던 정기 구독을 다시 철회하고 복구했습니다.`,
        payload: {
          user_id: session.user.id,
          email: session.user.email,
          action: "resume_subscription",
          resumed_at: new Date().toISOString()
        }
      });

      setSubStatus("active");
      alert("정기 구독 갱신이 성공적으로 복구되었습니다! 계속 PRO 혜택이 이어집니다.");
    } catch (err) {
      console.error("Resume failed:", err);
      alert("구독 복구 처리 도중 에러가 발생했습니다.");
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
      <header className="profile-header">
        <button
          type="button"
          className="b-btn b-btn-ghost"
          onClick={onGoHome}
          aria-label="홈으로"
        >
          <Icon name="chev-l" size={14} />
          홈으로
        </button>
        <h1 className="profile-title">프로필</h1>
        <div style={{ minWidth: 80 }} />
      </header>

      <div className="profile-body">
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
            <span>나의 구독 요금제</span>
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
          {subPlan === "pro" ? (
            <>
              <p className="profile-card-sub" style={{ color: "var(--b-fg-2)" }}>
                <strong>데스크톱 전용 네이티브 앱 설치 권한</strong>이 활성화되어 있으며, 백그라운드 무자각 관제와 AI 맞춤 피드백 코칭을 완벽히 지원받고 있습니다.
              </p>

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
                  <span>구독 상태: 
                    <strong style={{ 
                      color: subStatus === "active" ? "#7eb09c" : "#e08866", 
                      marginLeft: "6px" 
                    }}>
                      {subStatus === "active" ? "갱신 활성화 중" : subStatus === "canceled" ? "해지 예약됨" : "구독 중"}
                    </strong>
                  </span>
                  {subPeriodEnd && (
                    <span>만료 예정일: {new Date(subPeriodEnd).toLocaleDateString()}</span>
                  )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
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
                          7일 이내 즉시 환불 신청
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
                        구독 취소 (해지 예약)
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
                        background: "rgba(126, 176, 156, 0.1)",
                        color: "#7eb09c",
                        border: "1px solid rgba(126, 176, 156, 0.2)"
                      }}
                      onClick={handleResumeSubscription}
                    >
                      구독 복구 (해지 취소)
                    </button>
                  )}
                </div>
              </div>

              <div className="profile-card-actions" style={{ marginTop: "16px" }}>
                <button
                  type="button"
                  className="b-btn b-btn-primary"
                  onClick={onOpenPricing}
                  style={{ background: "linear-gradient(135deg, #7eb09c, #5b8c7a)" }}
                >
                  데스크톱 앱 다운로드 / 요금제 정보
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="profile-card-sub">
                현재 웹 브라우저 전용 기본 무료 플랜을 이용하고 있습니다. 화면을 최소화하거나 가려도 카메라 센서가 멈춤 없이 작동하는 데스크톱 전용 앱을 경험해보세요!
              </p>
              <div className="profile-card-actions">
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
                  }}
                >
                  PRO 업그레이드하고 데스크톱 앱 받기
                </button>
              </div>
            </>
          )}
        </section>

        {/* 인증 안내 — Phase 1 예정 */}
        <section className="profile-card profile-auth-soon">
          <div className="profile-card-head">
            <Icon name="shield" size={16} />
            <span>로그인 / 회원가입</span>
            <span className="profile-pill">준비 중</span>
          </div>
          <p className="profile-card-sub">
            여러 기기에서 자세 점수·이력을 동기화하려면 계정이 필요해요.
            다음 업데이트에 추가될 예정입니다.
          </p>
          <div className="profile-card-actions">
            <button type="button" className="b-btn b-btn-primary" disabled>
              로그인
            </button>
            <button type="button" className="b-btn b-btn-ghost" disabled>
              회원가입
            </button>
          </div>
        </section>

        {/* 어드민 시스템 제어 센터 */}
        {isAdmin && (
          <section className="profile-card" style={{ border: "1px dashed var(--b-sig, #5b8c7a)", background: "rgba(91, 140, 122, 0.04)" }}>
            <div className="profile-card-head" style={{ color: "var(--b-sig, #5b8c7a)" }}>
              <Icon name="settings" size={16} />
              <span>어드민 시스템 제어</span>
              <span className="profile-pill" style={{ background: "rgba(91, 140, 122, 0.2)", color: "#5b8c7a" }}>ADMIN</span>
            </div>
            <p className="profile-card-sub" style={{ marginBottom: 12 }}>
              관리자 권한 계정으로 감지되었습니다. 아래 버튼을 눌러 실시간 가입자 요금 플랜 변경, Q&A 관리, SVG 사용 통계 분석이 포함된 종합 어드민 대시보드를 엽니다.
            </p>
            <div className="profile-card-actions">
              <button
                type="button"
                className="b-btn b-btn-primary"
                style={{ background: "linear-gradient(135deg, #5b8c7a, #3c5e52)" }}
                onClick={onOpenAdmin}
              >
                어드민 대시보드 구동
              </button>
            </div>
          </section>
        )}

        {/* 아바타 선택 */}
        <section className="profile-card">
          <div className="profile-card-head">
            <span>아바타</span>
          </div>
          <div className="profile-avatar-grid">
            {DEFAULT_AVATAR_OPTIONS.map((a) => (
              <button
                key={a}
                type="button"
                className={`profile-avatar-cell ${profile.avatar === a ? "is-selected" : ""}`}
                onClick={() => update("avatar", a)}
                aria-label={`아바타 ${a}`}
              >
                {a}
              </button>
            ))}
          </div>
        </section>

        {/* 이름 */}
        <section className="profile-card">
          <label htmlFor="profile-name" className="profile-card-head">
            <span>표시 이름</span>
          </label>
          <input
            id="profile-name"
            className="profile-input"
            placeholder="예: 정홍"
            value={profile.name}
            maxLength={24}
            onChange={(e) => update("name", e.target.value)}
          />
          <p className="profile-card-sub">
            앱 내부에서만 사용해요. 인증 단계에서 계정명과 분리됩니다.
          </p>
        </section>

        {/* 작업 환경 */}
        <section className="profile-card">
          <div className="profile-card-head">
            <span>주 작업 환경</span>
          </div>
          <div className="profile-radio-row">
            {(Object.keys(WORK_ENV_LABEL) as WorkEnv[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`profile-radio ${profile.workEnv === k ? "is-selected" : ""}`}
                onClick={() => update("workEnv", k)}
              >
                {WORK_ENV_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="profile-card-sub">
            앞으로 작업 환경에 따라 자세 분석 보정 옵션이 추가될 수 있어요.
          </p>
        </section>

        <div className="profile-saved-hint">
          {savedAt ? "자동 저장됨" : "변경 사항이 자동 저장됩니다"}
        </div>
      </div>
    </div>
  );
}
