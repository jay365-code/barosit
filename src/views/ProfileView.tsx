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
        if (session?.user) {
          const { data, error } = await supabase
            .from("user_subscriptions")
            .select("plan_id, status")
            .eq("user_id", session.user.id)
            .maybeSingle();
          if (!error && data && data.status === "active") {
            setSubPlan(data.plan_id === "pro" ? "pro" : "free");
            return;
          }
        }
        const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
        setSubPlan(localPlan || "free");
      } catch (err) {
        console.error("Failed to load user subscription:", err);
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
              <div className="profile-card-actions">
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
