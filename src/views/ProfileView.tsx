// 사용자 프로필 페이지 — Phase 1: 클라우드 동기화 및 커스텀 인앱 결제 폼 탑재
// - 이름·아바타·작업환경 입력 및 Supabase 프로필 자동 연동
// - Google/Kakao/Email Magic Link 실 서비스 로그인 패널 탑재
// - 커스텀 인앱 카드 입력 폼 및 토스 비인증 빌링키 발급 시뮬레이션
// - "홈으로" 버튼 → 메인 모니터 화면 복귀

import { useEffect, useState, useRef } from "react";
import { Icon } from "../components/Icon";
import { supabase } from "../auth/supabase";
import { useAuth } from "../auth/useAuth";
import {
  syncProfileToServer,
  pullProfileFromServer,
  pullSettingsFromServer,
} from "../lib/syncService";
import {
  DEFAULT_AVATAR_OPTIONS,
  WORK_ENV_LABEL,
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

export function ProfileView({ onGoHome, onOpenAdmin, onOpenPricing }: Props) {
  const {
    session,
    signInWithGoogle,
    signInWithKakao,
    signOut,
  } = useAuth();

  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
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

  // 카드 등록 위저드 상태
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState(""); // MM/YY
  const [cardPwd, setCardPwd] = useState(""); // 2자리
  const [cardIdentity, setCardIdentity] = useState(""); // YYMMDD 또는 사업자번호
  const [cardFormError, setCardFormError] = useState("");
  const [cardRegistering, setCardRegistering] = useState(false);

  // 커스텀 외부 아바타 추가 관련 상태
  const [customAvatarFormOpen, setCustomAvatarFormOpen] = useState(false);
  const [customAvatarTab, setCustomAvatarTab] = useState<"upload" | "url">("upload");
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [customAvatarError, setCustomAvatarError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomAvatarError("");
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setCustomAvatarError("이미지 파일만 선택해 주세요.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 128;
        const MAX_HEIGHT = 128;
        let width = img.width;
        let height = img.height;

        const size = Math.min(width, height);
        canvas.width = MAX_WIDTH;
        canvas.height = MAX_HEIGHT;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          const sx = (width - size) / 2;
          const sy = (height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, MAX_WIDTH, MAX_HEIGHT);
          
          const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
          update("avatar", dataUrl);
          setSavedAt(Date.now());
        }
      };
      img.onerror = () => {
        setCustomAvatarError("이미지를 로드하는 중 오류가 발생했습니다.");
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.onerror = () => {
      setCustomAvatarError("파일을 읽는 중 오류가 발생했습니다.");
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarUrlSubmit = () => {
    setCustomAvatarError("");
    if (!customAvatarUrl) {
      setCustomAvatarError("URL을 입력해 주세요.");
      return;
    }
    const cleanUrl = customAvatarUrl.trim();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://") && !cleanUrl.startsWith("data:image/")) {
      setCustomAvatarError("올바른 이미지 주소(http/https/data:image)를 입력해 주세요.");
      return;
    }
    update("avatar", cleanUrl);
    setSavedAt(Date.now());
  };


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

  // 로그인 성공 시 프로필 & 설정 원격 다운로드 복원
  useEffect(() => {
    if (session?.user) {
      pullProfileFromServer();
      pullSettingsFromServer();
    }
  }, [session]);

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
            const isPro = data.plan_id === "pro" && (
              data.status === "active" ||
              data.status === "grace_period" ||
              (data.status === "canceled" && data.current_period_end && new Date(data.current_period_end) > new Date())
            );
            actualPlan = isPro ? "pro" : "free";
            setSubStatus(data.status);
            setSubUpdatedAt(data.updated_at);
            setSubPeriodEnd(data.current_period_end);
            setCardInfo(data.card_info);
            setGracePeriodUntil(data.grace_period_until);
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
  }, [session]);

  // 프로필 정보 동기화 및 자동 저장 — 입력 후 600ms debounce
  useEffect(() => {
    const t = setTimeout(() => {
      saveProfile(profile);
      setSavedAt(Date.now());
      if (session?.user) {
        syncProfileToServer();
      }
    }, 600);
    return () => clearTimeout(t);
  }, [profile, session]);

  // 환불 요청 (안전한 우회 방식)
  const handleRefund = async () => {
    if (!window.confirm("정말로 즉시 환불을 신청하시겠습니까?\n환불 요청 즉시 검토가 시작되며, 영업일 기준 3일 이내에 처리되어 요금제 등급이 FREE로 전환됩니다.")) return;
    
    try {
      if (!session?.user) return;

      // 일반 유저는 status를 직접 수정할 수 없으므로(Security Trigger), admin_notifications에 안전하게 접수만 요청
      const { error: notifyError } = await supabase.from("admin_notifications").insert({
        event_type: "refund_requested",
        severity: "warning",
        message: `환불 신청 접수: 사용자 ${session.user.email} 님이 7일 이내 즉시 환불(금액 반환) 승인을 정식 요청했습니다.`,
        payload: {
          user_id: session.user.id,
          email: session.user.email,
          action: "instant_refund_request",
          refund_requested_at: new Date().toISOString()
        }
      });

      if (notifyError) throw notifyError;

      alert("환불 요청이 안전하게 접수되었습니다. 관리자 승인 후 3일 이내에 환불 및 구독 회수가 완료됩니다.");
    } catch (err) {
      console.error("Refund request failed:", err);
      alert("환불 신청 도중 오류가 발생했습니다. 고객센터에 문의바랍니다.");
    }
  };

  // 구독 취소 (해지 예약)
  const handleCancelSubscription = async () => {
    if (!window.confirm("정말로 정기 구독을 취소하시겠습니까?\n구독을 해지하셔도 이번 달 남은 약정 만료일까지는 계속 이용이 가능합니다.")) return;

    try {
      if (!session?.user) return;

      // Toss 정기 결제 중지 - status를 'canceled'로 예약 업데이트
      // ( prevent_subscription_tampering 트리거에서 일반 유저의 canceled 예약 상태는 보안이 허용되도록 구성하거나 알림 처리 )
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
        message: `정기 해지 예약: 사용자 ${session.user.email} 님이 정기 구독 갱신 해지를 예약했습니다. (남은 기간 제공)`,
        payload: {
          user_id: session.user.id,
          email: session.user.email,
          action: "cancel_subscription",
          canceled_at: new Date().toISOString()
        }
      });

      setSubStatus("canceled");
      alert("정기 구독 갱신이 해지되었습니다. 남은 기간 만료일까지 혜택은 정상적으로 유지됩니다.");
    } catch (err) {
      console.error("Cancellation failed:", err);
      alert("해지 신청 도중 에러가 발생했습니다. 일반 권한 제한을 확인하세요.");
    }
  };

  // 구독 복구 (해지 취소)
  const handleResumeSubscription = async () => {
    try {
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
        message: `구독 복구: 사용자 ${session.user.email} 님이 취소 해지 예약했던 정기 구독을 다시 철회하고 복구했습니다.`,
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

  // 룬(Luhn) 알고리즘 카드번호 검증 헬퍼
  const validateCardNumber = (num: string): boolean => {
    const clean = num.replace(/\D/g, "");
    if (clean.length < 13 || clean.length > 19) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = clean.length - 1; i >= 0; i--) {
      let digit = parseInt(clean.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  };

  // 카드 번호 첫 자리 기반 카드사명 및 그라디언트 테마 획득
  const getCardBrandInfo = (num: string) => {
    const clean = num.replace(/\D/g, "");
    const first = clean.charAt(0);
    const firstTwo = clean.substring(0, 2);
    
    if (first === "4") {
      return { name: "Visa", color: "linear-gradient(135deg, #1a1f71 0%, #0077c2 100%)", logo: "💳 VISA" };
    }
    if (first === "5" || (Number(firstTwo) >= 51 && Number(firstTwo) <= 55)) {
      return { name: "Mastercard", color: "linear-gradient(135deg, #cc1c1c 0%, #eb7e13 100%)", logo: "💳 Mastercard" };
    }
    if (first === "9") {
      return { name: "국민카드", color: "linear-gradient(135deg, #444547 0%, #eab805 100%)", logo: "💳 KB국민" };
    }
    if (first === "3" && (firstTwo === "34" || firstTwo === "37")) {
      return { name: "Amex", color: "linear-gradient(135deg, #007bc4 0%, #68b8e7 100%)", logo: "💳 AMEX" };
    }
    return { name: "신한카드", color: "linear-gradient(135deg, #0b2265 0%, #1e5cb3 100%)", logo: "💳 SHINHAN" };
  };

  // 토스 비인증 빌링키 발급 API 모방 및 DB 등록 처리
  const handleRegisterCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setCardFormError("");
    
    const cleanNum = cardNumber.replace(/\D/g, "");
    const cleanExpiry = cardExpiry.replace(/\D/g, "");
    const cleanPwd = cardPwd.replace(/\D/g, "");
    const cleanId = cardIdentity.replace(/\D/g, "");

    if (!validateCardNumber(cleanNum)) {
      setCardFormError("유효하지 않은 카드번호입니다. 번호를 확인해주세요.");
      return;
    }
    if (cleanExpiry.length !== 4) {
      setCardFormError("올바른 카드 유효기간(MM/YY)을 입력하세요.");
      return;
    }
    if (cleanPwd.length !== 2) {
      setCardFormError("카드 비밀번호 앞 2자리를 입력하세요.");
      return;
    }
    if (cleanId.length !== 6 && cleanId.length !== 10) {
      setCardFormError("생년월일 6자리 혹은 사업자등록번호 10자리를 입력하세요.");
      return;
    }

    setCardRegistering(true);
    try {
      // 1. 토스 비인증 카드 등록 API 호출 시뮬레이션 (HTTPS API direct exchange 모방)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const brand = getCardBrandInfo(cleanNum);
      const masked = `${cleanNum.substring(0, 4)}-****-****-${cleanNum.substring(cleanNum.length - 4)}`;
      
      const newCardInfo = {
        brand: brand.name,
        number: masked,
        cardType: "신용",
        ownerType: cleanId.length === 6 ? "개인" : "법인"
      };

      const dummyBillingKey = `bln_tosspayments_${Math.random().toString(36).substring(7)}`;

      // 2. Supabase DB user_subscriptions 갱신 (보안 트리거 범위 외로 billing_key, card_info 교체 허용)
      const { error: subError } = await supabase
        .from("user_subscriptions")
        .update({
          billing_key: dummyBillingKey,
          card_info: newCardInfo,
          updated_at: new Date().toISOString(),
          status: subStatus === "grace_period" ? "active" : subStatus // 결제 유예 상태였을 경우 카드를 재등록하면 자동으로 active 복귀
        })
        .eq("user_id", session!.user.id);

      if (subError) throw subError;

      setCardInfo(newCardInfo);
      setCardFormOpen(false);
      setSubPlan("pro");
      if (subStatus === "grace_period") setSubStatus("active");
      
      // 상태 변경 알림
      window.dispatchEvent(new Event("barosit:subscription-changed"));

      alert("성공적으로 카드가 등록 및 결제 정보 갱신이 완료되었습니다!");
    } catch (err: any) {
      console.error("Card registration failed:", err);
      setCardFormError(`카드 등록에 실패했습니다: ${err.message || err}`);
    } finally {
      setCardRegistering(false);
    }
  };

  // 결제 정보 삭제
  const handleDeleteCardInfo = async () => {
    if (!window.confirm("등록된 결제 카드 정보를 삭제하시겠습니까?\n정기 구독 중인 경우 다음 결제일에 갱신 실패로 구독이 정지될 수 있습니다.")) return;

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
      alert("결제 카드 정보가 안전하게 삭제되었습니다.");
      
      // 상태 변경 알림
      window.dispatchEvent(new Event("barosit:subscription-changed"));
    } catch (err: any) {
      console.error("Failed to delete card info:", err);
      alert(`결제 정보 삭제 중 오류가 발생했습니다: ${err.message || err}`);
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

  const isCustomAvatar = 
    profile.avatar &&
    !DEFAULT_AVATAR_OPTIONS.includes(profile.avatar) &&
    (!session?.user?.user_metadata?.avatar_url || profile.avatar !== session.user.user_metadata.avatar_url);

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
            aria-label="돌아가기"
          >
            <Icon name="chev-l" size={14} />
            돌아가기
          </button>
          <h1 className="profile-title" style={{ margin: 0 }}>{!session ? "로그인" : "프로필"}</h1>
          <button
            type="button"
            className="b-icon-btn b-tip"
            data-tip="돌아가기"
            onClick={onGoHome}
            aria-label="돌아가기"
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
                클라우드 데이터 백업 시작하기
              </h2>
              <p style={{ fontSize: "13px", color: "var(--b-fg-3)", lineHeight: 1.6, maxWidth: "320px", margin: "0 auto" }}>
                소셜 로그인을 통해 단 3초 만에 나만의 자세 위반 로그와 민감도 설정을 영구적으로 안전하게 보관하세요.
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
                  Google 로그인
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
                  Kakao 로그인
                </button>
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
                    [결제 지연 경고] 정기 구독 갱신 실패
                  </strong>
                  <div style={{ marginTop: 4 }}>
                    등록된 카드의 한도 초과 혹은 만료로 인해 결제가 처리되지 않았습니다. 
                    <br />
                    <strong>{new Date(gracePeriodUntil).toLocaleDateString()}</strong>까지 결제 카드를 변경하지 않으시면 PRO 서비스 이용이 자동으로 무료(FREE) 버전으로 다운그레이드됩니다.
                  </div>
                </div>
              )}

              {subPlan === "pro" ? (
                <>
                  <p className="profile-card-sub" style={{ color: "var(--b-fg-2)" }}>
                    <strong>데스크톱 전용 네이티브 앱 설치 권한</strong>이 활성화되어 있으며, 백그라운드 무자각 관제와 AI 맞춤 피드백 코칭을 완벽히 지원받고 있습니다.
                  </p>

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
                        <div style={{ fontSize: "11px", color: "var(--b-fg-4)", marginBottom: 4 }}>기본 결제 수단</div>
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
                      <span>구독 상태: 
                        <strong style={{ 
                          color: subStatus === "active" ? "#7eb09c" : subStatus === "grace_period" ? "#e08866" : "#e08866", 
                          marginLeft: "6px" 
                        }}>
                          {subStatus === "active" ? "갱신 활성화 중" : subStatus === "grace_period" ? "납부 유예 유효" : subStatus === "canceled" ? "해지 예약됨" : "구독 중"}
                        </strong>
                      </span>
                      {subPeriodEnd && (
                        <span>만료 예정일: {new Date(subPeriodEnd).toLocaleDateString()}</span>
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
                        {cardFormOpen ? "카드 등록 닫기" : "결제 카드 정보 변경"}
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
                          결제 수단 삭제
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
                            background: "rgba(126, 176, 156, 0.15)",
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
                </>
              ) : (
                <>
                  <p className="profile-card-sub">
                    현재 웹 브라우저 전용 기본 무료 플랜을 이용하고 있습니다. 화면을 최소화하거나 가려도 카메라 센서가 멈춤 없이 작동하는 데스크톱 전용 앱을 경험해보세요!
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
                      PRO 업그레이드하고 데스크톱 앱 받기
                    </button>
                    {session?.user && (
                      <button
                        type="button"
                        className="b-btn b-btn-ghost"
                        onClick={() => setCardFormOpen(!cardFormOpen)}
                        style={{ border: "1px solid rgba(255,255,255,0.15)", fontSize: "12px" }}
                      >
                        {cardFormOpen ? "결제창 닫기" : "결제 수단 카드 등록"}
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* 💳 자체 커스텀 인앱 카드 위저드 입력 폼 */}
              {cardFormOpen && session?.user && (
                <form onSubmit={handleRegisterCard} style={{
                  marginTop: "20px",
                  padding: "20px",
                  borderRadius: "16px",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  position: "relative",
                  overflow: "hidden"
                }}>
                  <h4 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 16px 0", color: "var(--b-fg-2)" }}>
                    💳 정기 결제 카드 등록 / 변경
                  </h4>

                  {/* 가상 카드 플레이트 실시간 렌더링 */}
                  <div style={{
                    height: "140px",
                    borderRadius: "12px",
                    background: getCardBrandInfo(cardNumber).color,
                    boxShadow: "0 10px 25px rgba(0,0,0,0.4), inset 0 0 20px rgba(255,255,255,0.15)",
                    padding: "16px",
                    color: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    marginBottom: "20px",
                    position: "relative",
                    transition: "all 0.5s ease"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "1px", opacity: 0.8 }}>BAROSIT PREMIUM CARD</span>
                      <span style={{ fontSize: "13px", fontWeight: 900, textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}>
                        {getCardBrandInfo(cardNumber).logo}
                      </span>
                    </div>
                    
                    {/* 금속 칩 일러스트 */}
                    <div style={{
                      width: "32px",
                      height: "24px",
                      background: "linear-gradient(135deg, #fce0ad 0%, #dfa538 100%)",
                      borderRadius: "4px",
                      border: "1px solid rgba(255,255,255,0.3)",
                      boxShadow: "inset 0 1px 2px rgba(255,255,255,0.5)"
                    }} />

                    <div>
                      <div style={{
                        fontFamily: "monospace",
                        fontSize: "16px",
                        letterSpacing: "2px",
                        textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                        marginBottom: "6px"
                      }}>
                        {cardNumber ? cardNumber.replace(/(\d{4})/g, "$1 ").trim() : "•••• •••• •••• ••••"}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", opacity: 0.8 }}>
                        <span>{profile.name.toUpperCase() || "MEMBER"}</span>
                        <span>VALID THRU: {cardExpiry ? cardExpiry.replace(/(\d{2})/g, "$1/").replace(/\/$/, "") : "MM/YY"}</span>
                      </div>
                    </div>
                  </div>

                  {/* 입력 제어 폼 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label htmlFor="card-number-input" style={{ display: "block", fontSize: "11px", color: "var(--b-fg-4)", marginBottom: "4px" }}>카드번호</label>
                      <input
                        id="card-number-input"
                        className="profile-input"
                        type="text"
                        maxLength={19}
                        placeholder="4012 0000 0000 0000"
                        value={cardNumber}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, "");
                          setCardNumber(clean);
                        }}
                        style={{ fontFamily: "monospace" }}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <label htmlFor="card-expiry-input" style={{ display: "block", fontSize: "11px", color: "var(--b-fg-4)", marginBottom: "4px" }}>유효기간</label>
                        <input
                          id="card-expiry-input"
                          className="profile-input"
                          type="text"
                          maxLength={5}
                          placeholder="MM/YY"
                          value={cardExpiry}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/\D/g, "");
                            setCardExpiry(clean);
                          }}
                          style={{ fontFamily: "monospace" }}
                        />
                      </div>
                      <div>
                        <label htmlFor="card-pwd-input" style={{ display: "block", fontSize: "11px", color: "var(--b-fg-4)", marginBottom: "4px" }}>비밀번호 앞 2자리</label>
                        <input
                          id="card-pwd-input"
                          className="profile-input"
                          type="password"
                          maxLength={2}
                          placeholder="••"
                          value={cardPwd}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/\D/g, "");
                            setCardPwd(clean);
                          }}
                          style={{ fontFamily: "monospace" }}
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="card-identity-input" style={{ display: "block", fontSize: "11px", color: "var(--b-fg-4)", marginBottom: "4px" }}>생년월일 6자리 (또는 사업자번호 10자리)</label>
                      <input
                        id="card-identity-input"
                        className="profile-input"
                        type="text"
                        maxLength={10}
                        placeholder="YYMMDD"
                        value={cardIdentity}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/\D/g, "");
                          setCardIdentity(clean);
                        }}
                        style={{ fontFamily: "monospace" }}
                      />
                    </div>

                    {cardFormError && (
                      <div style={{ fontSize: "11px", color: "#f87171", marginTop: "4px" }}>
                        ⚠️ {cardFormError}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="b-btn b-btn-primary"
                      disabled={cardRegistering}
                      style={{
                        marginTop: "8px",
                        background: "linear-gradient(135deg, #7eb09c, #5b8c7a)",
                        border: "none",
                        justifyContent: "center",
                        fontWeight: 700
                      }}
                    >
                      {cardRegistering ? "카드 검증 및 빌링키 교환 중..." : "정기 결제용 카드 등록 완료"}
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* 🔐 인증 패널 — Google/Kakao/Email Magic Link 실 연동 */}
            <section className="profile-card">
              <div className="profile-card-head">
                <Icon name="shield" size={16} />
                <span>나의 클라우드 계정</span>
                <span className={`profile-pill ${session ? "is-pro" : ""}`} style={session ? {
                  background: "rgba(126, 176, 156, 0.15)",
                  color: "#7eb09c"
                } : undefined}>
                  {session ? "연동됨" : "게스트 모드"}
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
                    {session.user.user_metadata?.avatar_url ? (
                      <div style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        overflow: "hidden",
                        border: "2px solid var(--b-sig)",
                        boxShadow: "0 4px 12px rgba(126,176,156,0.3)",
                        flexShrink: 0
                      }}>
                        <img
                          src={session.user.user_metadata.avatar_url}
                          alt="Social Profile"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    ) : (
                      <div style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        background: "var(--b-surface-2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "24px",
                        border: "2px solid var(--b-line-2)",
                        flexShrink: 0
                      }}>
                        👤
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--b-fg-1)" }}>
                        {session.user.user_metadata?.full_name || session.user.user_metadata?.name || profile.name || "사용자"}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--b-fg-3)" }}>
                        {session.user.email}
                      </span>
                    </div>
                  </div>
                  <p className="profile-card-sub" style={{ marginBottom: "16px" }}>
                    현재 소셜 계정으로 연결되어 있습니다. 모든 디바이스 설정 및 바른자세 측정 로그가 클라우드 서버와 실시간으로 원격 백업 및 동기화됩니다.
                  </p>
                  <div className="profile-card-actions">
                    <button
                      type="button"
                      className="b-btn b-btn-ghost"
                      onClick={async () => {
                        if (window.confirm("로그아웃 하시겠습니까?\n로그아웃 시에는 자세 데이터 실시간 백업이 일시 정지됩니다.")) {
                          await signOut();
                          localStorage.setItem("barosit:subscription_plan", "free");
                          setSubPlan("free");
                          setCardInfo(null);
                          setGracePeriodUntil(null);
                          alert("정상적으로 로그아웃되었습니다.");
                        }
                      }}
                      style={{ border: "1px solid rgba(255, 255, 255, 0.1)", color: "#f87171" }}
                    >
                      간편 로그아웃
                    </button>
                  </div>
                </>
              )}
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
              <div className="profile-avatar-grid" style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                {session?.user?.user_metadata?.avatar_url && (
                  <button
                    type="button"
                    className={`profile-avatar-cell ${
                      profile.avatar === session.user.user_metadata.avatar_url ? "is-selected" : ""
                    }`}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      overflow: "hidden",
                      padding: 0,
                      border: profile.avatar === session.user.user_metadata.avatar_url 
                        ? "2px solid #5b8c7a" 
                        : "2px solid var(--b-border-translucent, rgba(255,255,255,0.1))",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "transform 0.2s, border-color 0.2s"
                    }}
                    onClick={() => update("avatar", session.user.user_metadata.avatar_url)}
                    aria-label="소셜 프로필 이미지"
                  >
                    <img
                      src={session.user.user_metadata.avatar_url}
                      alt="Social Avatar"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        borderRadius: "50%"
                      }}
                    />
                  </button>
                )}
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
                {isCustomAvatar && (
                  <button
                    type="button"
                    className="profile-avatar-cell is-selected"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      overflow: "hidden",
                      padding: 0,
                      border: "2px solid #5b8c7a",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      fontSize: "initial"
                    }}
                    onClick={() => update("avatar", profile.avatar)}
                    aria-label="커스텀 이미지 아바타"
                  >
                    <img
                      src={profile.avatar}
                      alt="Custom Avatar"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        borderRadius: "50%"
                      }}
                    />
                  </button>
                )}
                <button
                  type="button"
                  className={`profile-avatar-cell ${customAvatarFormOpen ? "is-selected" : ""}`}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "12px",
                    border: customAvatarFormOpen ? "2px solid #5b8c7a" : "1px dashed var(--b-line)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: "14px",
                    background: customAvatarFormOpen ? "var(--b-sig-bg)" : "transparent"
                  }}
                  onClick={() => setCustomAvatarFormOpen(prev => !prev)}
                  aria-label="외부 이미지 추가"
                  title="외부 이미지 추가"
                >
                  ➕
                </button>
              </div>

              {/* 외부 이미지 추가 폼 */}
              {customAvatarFormOpen && (
                <div style={{
                  marginTop: "16px",
                  padding: "16px",
                  borderRadius: "16px",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--b-line)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "var(--b-fg-2)" }}>
                      🖼️ 외부 이미지 아바타 설정
                    </h4>
                    <button
                      type="button"
                      onClick={() => setCustomAvatarFormOpen(false)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--b-fg-4)",
                        cursor: "pointer",
                        fontSize: "12px"
                      }}
                    >
                      닫기
                    </button>
                  </div>

                  {/* 탭 구조: 1. 파일 업로드, 2. 이미지 URL */}
                  <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--b-line)", paddingBottom: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setCustomAvatarTab("upload")}
                      style={{
                        background: "none",
                        border: "none",
                        color: customAvatarTab === "upload" ? "var(--b-sig)" : "var(--b-fg-3)",
                        fontSize: "12px",
                        fontWeight: customAvatarTab === "upload" ? 700 : 500,
                        cursor: "pointer",
                        padding: "4px 8px",
                        borderBottom: customAvatarTab === "upload" ? "2px solid var(--b-sig)" : "none",
                        marginBottom: "-9px"
                      }}
                    >
                      이미지 파일 업로드
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomAvatarTab("url")}
                      style={{
                        background: "none",
                        border: "none",
                        color: customAvatarTab === "url" ? "var(--b-sig)" : "var(--b-fg-3)",
                        fontSize: "12px",
                        fontWeight: customAvatarTab === "url" ? 700 : 500,
                        cursor: "pointer",
                        padding: "4px 8px",
                        borderBottom: customAvatarTab === "url" ? "2px solid var(--b-sig)" : "none",
                        marginBottom: "-9px"
                      }}
                    >
                      웹 이미지 주소(URL)
                    </button>
                  </div>

                  {customAvatarTab === "upload" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          border: "2px dashed var(--b-line-2)",
                          borderRadius: "12px",
                          padding: "20px",
                          textAlign: "center",
                          cursor: "pointer",
                          background: "rgba(255, 255, 255, 0.01)",
                          transition: "all 0.2s"
                        }}
                      >
                        <span style={{ fontSize: "24px", display: "block", marginBottom: "6px" }}>📤</span>
                        <span style={{ fontSize: "12px", color: "var(--b-fg-2)", fontWeight: 600 }}>
                          클릭하여 이미지 업로드
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--b-fg-4)", display: "block", marginTop: "4px" }}>
                          PNG, JPG, WEBP 지원 (자동 최적화 압축 적용)
                        </span>
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleAvatarFileChange}
                        accept="image/*"
                        style={{ display: "none" }}
                      />
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          type="url"
                          placeholder="https://example.com/avatar.png"
                          value={customAvatarUrl}
                          onChange={(e) => setCustomAvatarUrl(e.target.value)}
                          style={{
                            flex: 1,
                            height: "36px",
                            borderRadius: "8px",
                            border: "1px solid var(--b-line)",
                            background: "var(--b-bg)",
                            padding: "0 12px",
                            fontSize: "12px",
                            color: "var(--b-fg-1)"
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAvatarUrlSubmit}
                          className="b-btn b-btn-primary"
                          style={{
                            height: "36px",
                            fontSize: "12px",
                            padding: "0 14px",
                            background: "linear-gradient(135deg, #7eb09c, #5b8c7a)",
                            border: "none"
                          }}
                        >
                          적용
                        </button>
                      </div>
                      <span style={{ fontSize: "10px", color: "var(--b-fg-4)" }}>
                        웹에 업로드된 투명 PNG나 프로필 사진 주소를 붙여넣어주세요.
                      </span>
                    </div>
                  )}

                  {customAvatarError && (
                    <div style={{ fontSize: "11px", color: "#f87171" }}>
                      ⚠️ {customAvatarError}
                    </div>
                  )}
                </div>
              )}
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
                이전 화면으로 돌아가기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
