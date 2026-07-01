import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import privacyMd from "../../docs/privacy.md?raw";
import termsMd from "../../docs/terms.md?raw";
import { supabase } from "../auth/supabase";
import { useAuth } from "../auth/useAuth";
import { resolveEffectivePlan, isBetaFree, refreshLaunchMode, refreshTesterStatus, LAUNCH_MODE_CHANGED_EVENT } from "../launchMode";
import { priceFor } from "../lib/pricing";
import { interpolateLegalTemplate } from "../lib/legal";
import i18n from "../i18n";
import { LanguageSelect } from "../components/LanguageSelect";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import {
  pickSubSlogan,
} from "../slogans";

// const CONTACT_EMAIL = "support@barosit.com";

// ───────── Auth navigation helpers ─────────
//
// 로그인 전/후 redirect 흐름을 한 곳에서 관리. 진입 지점이 흩어져 있어
// 일부 경로에서만 직전 hash 가 저장되던 문제(로그인 후 무조건 #/app 으로
// 가버리던 현상)를 해소합니다.

// 콜백 후 복귀 시 허용할 safe hash 패턴 — 내부 라우트만 허용해 외부 URL /
// javascript: URI 주입을 방어 (XSS 가 없다는 전제의 심층 방어).
const SAFE_HASH_RE = /^#\/[a-zA-Z0-9/_?=&-]*$/;
export function isSafeRedirectHash(s: string | null | undefined): s is string {
  if (!s) return false;
  return SAFE_HASH_RE.test(s);
}

// 로그인 페이지로 이동하면서 *현재 hash* 를 자동 저장. 로그인 콜백 후 자연
// 복귀하도록 합니다. 단, 인증 페이지로의 재진입은 redirect 후보에서 제외.
export function navigateToLogin(e?: { preventDefault?: () => void }) {
  if (e?.preventDefault) e.preventDefault();
  const cur = typeof window !== "undefined" ? window.location.hash : "";
  const isAuthRoute =
    cur.startsWith("#/login") ||
    cur.startsWith("#/signup") ||
    cur.startsWith("#/auth/callback") ||
    cur.startsWith("#/forgot-password") ||
    cur.startsWith("#/reset-password");
  if (isSafeRedirectHash(cur) && !isAuthRoute) {
    try {
      localStorage.setItem("barosit:auth_redirect", cur);
    } catch {
      /* localStorage 비활성 환경 — redirect 미저장은 fallback 으로 충분 */
    }
  }
  window.location.hash = "#/login";
}

// 로그아웃 후 redirect 정책 — 인증 필수 영역에서만 #/landing 으로 보내고,
// 그 외 페이지(#/pricing, #/about, …)는 *현재 페이지 유지*. React 가 user=
// null 로 자연 재렌더합니다.
const PROTECTED_HASH_PREFIXES = ["#/profile", "#/account", "#/app", "#/admin"];
export function shouldRedirectAfterSignOut(currentHash: string): boolean {
  return PROTECTED_HASH_PREFIXES.some((p) => currentHash.startsWith(p));
}


export const trackPaymentEvent = (
  eventName:
    | "pricing_view_loaded"
    | "checkout_initiated"
    | "checkout_completed"
    | "checkout_failed"
    | "subscription_cancel_initiated"
    | "subscription_cancel_confirmed"
    | "subscription_resume_confirmed"
    | "card_update_initiated"
    | "card_update_failed",
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

// ───────── Shared ─────────

function TopNav({ active }: { active?: string }) {
  const { user } = useAuth();
  const { t } = useTranslation("marketing");
  const [isAdmin, setIsAdmin] = useState(false);
  const [betaFree, setBetaFree] = useState(isBetaFree());

  useEffect(() => {
    const handleLaunchModeChange = () => {
      setBetaFree(isBetaFree());
    };
    window.addEventListener(LAUNCH_MODE_CHANGED_EVENT, handleLaunchModeChange);
    return () => {
      window.removeEventListener(LAUNCH_MODE_CHANGED_EVENT, handleLaunchModeChange);
    };
  }, []);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .maybeSingle();
        if (!error && data?.is_admin) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } catch (e) {
        setIsAdmin(false);
      }
    };
    checkAdminStatus();
  }, [user]);

  const items = [
    { key: "features", label: t("nav.features"), hash: "#/landing" },
    ...(betaFree ? [] : [{ key: "pricing", label: t("nav.pricing"), hash: "#/pricing" }]),
    { key: "download", label: t("nav.download"), hash: "#/download" },
    { key: "community", label: t("nav.community"), hash: "#/community" },
  ];
  if (isAdmin) {
    items.push({ key: "admin", label: "관리자", hash: "#/admin" });
  }
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  let customName = "";
  if (typeof window !== "undefined") {
    try {
      const localProfileRaw = localStorage.getItem("user_profile_v1");
      if (localProfileRaw) {
        customName = JSON.parse(localProfileRaw).name || "";
      }
    } catch (e) {}
  }
  const fullName =
    customName ||
    ((meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      "");
  const avatarUrl = (meta.avatar_url as string | undefined) ?? null;
  const initial = (fullName || user?.email || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "20px 56px",
        borderBottom: "1px solid var(--b-line)",
        background: "var(--b-bg)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <a
        href="#/landing"
        style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}
      >
        <Logo size={28} stroke="var(--b-sig)" />
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.04em" }}>
          barosit
        </span>
      </a>
      <div style={{ display: "flex", gap: 4, marginLeft: 32 }}>
        {items.map((i) => (
          <a
            key={i.key}
            href={i.hash}
            style={{
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 500,
              color: i.key === active ? "var(--b-fg-1)" : "var(--b-fg-3)",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            {i.label}
          </a>
        ))}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
        <LanguageSelect />
        {user ? (
          <a
            href="#/profile"
            title={user.email ?? ""}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px 4px 4px",
              borderRadius: 999,
              border: "1px solid var(--b-line)",
              background: "var(--b-surface)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <Avatar size={26} initial={initial} imageUrl={avatarUrl} />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                maxWidth: 120,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {fullName || user.email}
            </span>
          </a>
        ) : (
          <a
            href="#/login"
            onClick={navigateToLogin}
            className="b-btn b-btn-quiet"
            style={{ textDecoration: "none" }}
          >
            {t("login")}
          </a>
        )}
        <a
          href="#/download"
          className="b-btn b-btn-primary"
          style={{ textDecoration: "none" }}
        >
          <Icon name="arrow-r" size={13} />
          {t("download")}
        </a>
      </div>
    </div>
  );
}

function Footer() {
  const { t } = useTranslation("marketing");
  return (
    <div
      style={{
        padding: "60px 56px 40px",
        borderTop: "1px solid var(--b-line)",
        maxWidth: 1180,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 32,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 24,
        }}
      >
        {/* 회사 정보 및 사업자 등록 정보 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={24} stroke="var(--b-sig)" />
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.03em" }}>
              barosit
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--b-fg-3)",
              lineHeight: 1.6,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div>{t("footer.company")}</div>
            <div>{t("footer.address")}</div>
            <div>{t("footer.registration")}</div>
          </div>
        </div>

        {/* 법적 고지 및 링크 */}
        <div style={{ display: "flex", gap: 24, fontSize: 13, fontWeight: 500, alignItems: "center" }}>
          <a href="#/changelog" style={{ color: "var(--b-fg-2)", textDecoration: "none" }}>
            {t("footer.changelog")}
          </a>
          <a href="#/science" style={{ color: "var(--b-fg-2)", textDecoration: "none" }}>
            {t("footer.science")}
          </a>
          <a href="#/privacy" style={{ color: "var(--b-fg-2)", textDecoration: "none" }}>
            {t("footer.privacy")}
          </a>
          <a href="#/terms" style={{ color: "var(--b-fg-2)", textDecoration: "none" }}>
            {t("footer.terms")}
          </a>
          <a href="#/community" style={{ color: "var(--b-fg-2)", textDecoration: "none" }}>
            {t("footer.community")}
          </a>
          <LanguageSelect variant="inline" />
        </div>
      </div>

      {/* 하단 저작권 표시 */}
      <div
        style={{
          borderTop: "1px solid var(--b-line)",
          paddingTop: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          color: "var(--b-fg-4)",
        }}
      >
        <span>© 2026 Barosit. All rights reserved.</span>
      </div>
    </div>
  );
}

function MiniCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 14,
        background: "var(--b-surface)",
        border: "1px solid var(--b-line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "var(--b-sig-soft)",
            color: "var(--b-sig-deep)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={14} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function Avatar({
  size = 80,
  initial,
  imageUrl,
}: {
  size?: number;
  initial?: string;
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        referrerPolicy="no-referrer"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #7eb09c 0%, #3f6e5e 100%)",
        color: "#fff",
        fontSize: size * 0.4,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        letterSpacing: "-0.02em",
        flexShrink: 0,
      }}
    >
      {initial ?? "?"}
    </div>
  );
}

// 커뮤니티 운영자 Aria 전용 일러스트 아바타 (오프라인/사내망에서도 렌더되도록 인라인 SVG).
// 커뮤니티 운영자 Aria 아바타. 실제 디자인 이미지를 쓰려면 ARIA_AVATAR_SRC 에 경로를
// 넣으면 됨(예: "/aria.png" — public 에 두면 오프라인/사내망에서도 동작). 비어 있으면
// 인라인 일러스트(밝은 톤·은은한 미소)로 폴백한다.
const ARIA_AVATAR_SRC = "/aria.jpeg";
function AriaAvatar({ size = 28, onClick }: { size?: number; onClick?: () => void }) {
  const clickStyle = onClick ? { cursor: "zoom-in" as const } : {};
  if (ARIA_AVATAR_SRC) {
    return (
      <img src={ARIA_AVATAR_SRC} alt="Aria" width={size} height={size} onClick={onClick}
        title={onClick ? "프로필 사진 크게 보기" : undefined}
        style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0, ...clickStyle }} />
    );
  }
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" onClick={onClick} style={{ borderRadius: "50%", flexShrink: 0, ...clickStyle }}>
      <circle cx="20" cy="20" r="20" fill="#EDEBFB" />
      <path d="M11 14 Q11 5 20 5 Q29 5 29 14 L29 21 Q29 30 20 30 Q11 30 11 21 Z" fill="#2B2150" />
      <circle cx="20" cy="20" r="7.5" fill="#F4D7C4" />
      <path d="M12.5 18 Q12.5 9.5 20 9.5 Q27.5 9.5 27.5 18 Q27.5 14 20 14 Q12.5 14 12.5 18 Z" fill="#2B2150" />
      <path d="M16 40 Q16 31 20 31 Q24 31 24 40 Z" fill="#6E63C6" />
      <path d="M17.6 21.4 Q20 23.2 22.4 21.4" stroke="#B07B5C" strokeWidth="1" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// 운영자(Aria) 댓글 전용 안전 서식 변환: HTML 이스케이프 후 **굵게** 와 줄바꿈만 변환.
// 사용자 입력이 아니라 운영자 검수를 거친 모델 출력이지만, 이스케이프를 먼저 해 XSS 를 원천 차단한다.
function formatAgentContent(raw: string): string {
  const esc = (raw || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return esc
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

// ───────── Landing ─────────

function Landing() {
  const { t } = useTranslation("marketing");
  // 히어로 서브 슬로건: ko는 시간대 로테이션 말장난 유지, en/ja는 정적 카피.
  const subSlogan =
    i18n.language === "ko" ? pickSubSlogan() : t("landing.hero.sub");
  return (
    <div style={{ background: "var(--b-bg)" }}>
      <TopNav />

      <div style={{ padding: "80px 56px 60px", maxWidth: 1180, margin: "0 auto" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 999,
            background: "var(--b-sig-bg)",
            border: "1px solid var(--b-sig-soft)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--b-sig-deep)",
            marginBottom: 28,
          }}
        >
          <Icon name="shield" size={12} />
          {t("landing.badge")}
        </div>
        <h1
          style={{
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.038em",
            margin: 0,
            marginBottom: 16,
            maxWidth: 900,
          }}
        >
          {t("landing.hero.title1")}
          <br />
          <span style={{ color: "var(--b-sig-deep)" }}>{t("landing.hero.title2")}</span>
        </h1>
        <p
          style={{
            fontSize: 22,
            color: "var(--b-fg-1)",
            fontWeight: 600,
            lineHeight: 1.4,
            maxWidth: 620,
            margin: 0,
            marginBottom: 14,
            letterSpacing: "-0.01em",
          }}
        >
          {subSlogan}
        </p>
        <p
          style={{
            fontSize: 17,
            color: "var(--b-fg-2)",
            lineHeight: 1.55,
            maxWidth: 560,
            margin: 0,
            marginBottom: 36,
          }}
        >
          {t("landing.hero.desc")}
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <a
            href="#/app"
            className="b-btn b-btn-primary"
            style={{ height: 48, padding: "0 22px", fontSize: 14, textDecoration: "none" }}
          >
            <Icon name="arrow-r" size={14} /> {t("landing.cta.webStart")}
          </a>
          <a
            href="#/download"
            className="b-btn b-btn-ghost"
            style={{ height: 48, padding: "0 22px", fontSize: 14, textDecoration: "none" }}
          >
            {t("landing.cta.downloadApp")}
          </a>
        </div>
        <div className="b-num" style={{ fontSize: 12, color: "var(--b-fg-4)" }}>
          {t("landing.cta.note")}
        </div>
      </div>

      {/* 왜 BaroSit은 다른가 — 근거 기반 "완벽한 자세는 없다" 내러티브 */}
      <div
        style={{
          padding: "72px 56px",
          background: "var(--b-sig-bg)",
          borderTop: "1px solid var(--b-line)",
          borderBottom: "1px solid var(--b-line)",
        }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--b-sig)",
              letterSpacing: "0.1em",
              marginBottom: 12,
            }}
          >
            {t("landing.why.eyebrow")}
          </div>
          <h2
            style={{
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: "-0.028em",
              marginBottom: 20,
              maxWidth: 760,
            }}
          >
            {t("landing.why.title")}
          </h2>
          <p
            style={{
              fontSize: 17,
              color: "var(--b-fg-2)",
              lineHeight: 1.7,
              maxWidth: 720,
              marginBottom: 24,
            }}
          >
            {t("landing.why.body")}
          </p>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "var(--b-sig-deep)",
              letterSpacing: "-0.02em",
              marginBottom: 44,
            }}
          >
            {t("landing.why.quote")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
            {(["noPerfect", "moveOften", "noGuilt"] as const).map((id) => (
              <div
                key={id}
                style={{
                  padding: 24,
                  borderRadius: 16,
                  background: "var(--b-surface)",
                  border: "1px solid var(--b-line)",
                }}
              >
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    marginBottom: 8,
                    letterSpacing: "-0.015em",
                  }}
                >
                  {t(`landing.why.points.${id}.t`)}
                </div>
                <div style={{ fontSize: 14, color: "var(--b-fg-3)", lineHeight: 1.6 }}>
                  {t(`landing.why.points.${id}.d`)}
                </div>
              </div>
            ))}
          </div>
          <a
            href="#/science"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 28,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--b-sig-deep)",
              textDecoration: "none",
            }}
          >
            {t("landing.why.cta")} <Icon name="arrow-r" size={14} />
          </a>
        </div>
      </div>

      <div style={{ padding: "80px 56px", maxWidth: 1180, margin: "0 auto" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--b-sig)",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          {t("landing.how.eyebrow")}
        </div>
        <h2
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.028em",
            marginBottom: 48,
            maxWidth: 700,
          }}
        >
          {t("landing.how.title1")}
          <br />
          {t("landing.how.title2")}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          {(
            [
              { icon: "camera", id: "watch" },
              { icon: "target", id: "detect" },
              { icon: "sparkle", id: "adjust" },
            ] as Array<{ icon: IconName; id: string }>
          ).map((s, i) => (
            <div
              key={i}
              style={{
                padding: 28,
                borderRadius: 16,
                background: "var(--b-surface)",
                border: "1px solid var(--b-line)",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "var(--b-sig-soft)",
                  color: "var(--b-sig-deep)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                }}
              >
                <Icon name={s.icon} size={20} />
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--b-fg-3)",
                  marginBottom: 6,
                }}
                className="b-num"
              >
                0{i + 1}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  marginBottom: 8,
                  letterSpacing: "-0.018em",
                }}
              >
                {t(`landing.how.steps.${s.id}.t`)}
              </div>
              <div style={{ fontSize: 14, color: "var(--b-fg-3)", lineHeight: 1.6 }}>
                {t(`landing.how.steps.${s.id}.d`)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "60px 56px",
          background: "var(--b-sig-bg)",
          borderTop: "1px solid var(--b-line)",
          borderBottom: "1px solid var(--b-line)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 60,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "var(--b-sig)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 24,
              }}
            >
              <Icon name="shield" size={24} />
            </div>
            <h2
              style={{
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: "-0.028em",
                marginBottom: 18,
                lineHeight: 1.15,
              }}
            >
              {t("landing.privacy.title")}
            </h2>
            <p
              style={{
                fontSize: 16,
                color: "var(--b-fg-2)",
                lineHeight: 1.6,
                marginBottom: 24,
              }}
            >
              {t("landing.privacy.body")}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(["noSave", "localOnly", "neverLeaves"] as const).map((pid, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 14,
                    color: "var(--b-fg-1)",
                  }}
                >
                  <Icon name="check" size={16} style={{ color: "var(--b-sig)" }} />
                  {t(`landing.privacy.points.${pid}`)}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { k: t("landing.privacy.stats.ondeviceLabel"), v: t("landing.privacy.stats.ondeviceValue") },
              { k: t("landing.privacy.stats.cloudLabel"), v: t("landing.privacy.stats.cloudValue") },
              { k: t("landing.privacy.stats.offlineLabel"), v: t("landing.privacy.stats.offlineValue") },
              { k: t("landing.privacy.stats.analysisLabel"), v: t("landing.privacy.stats.analysisValue") },
            ].map((c, i) => (
              <div
                key={i}
                style={{
                  padding: 24,
                  borderRadius: 14,
                  background: "var(--b-surface)",
                  border: "1px solid var(--b-line)",
                }}
              >
                <div
                  className="b-num"
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: "var(--b-sig-deep)",
                    letterSpacing: "-0.025em",
                    marginBottom: 4,
                  }}
                >
                  {c.v}
                </div>
                <div style={{ fontSize: 13, color: "var(--b-fg-3)", fontWeight: 600 }}>
                  {c.k}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "80px 56px", maxWidth: 1180, margin: "0 auto" }}>
        <h2
          style={{
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.026em",
            marginBottom: 36,
          }}
        >
          {t("landing.features.title")}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {(
            [
              { i: "target", id: "detect7" },
              { i: "stretch", id: "breaks" },
              { i: "bell", id: "variability" },
              { i: "sparkle", id: "score" },
              { i: "minimize", id: "widget" },
              { i: "moon", id: "dark" },
            ] as Array<{ i: IconName; id: string }>
          ).map((f, i) => (
            <div
              key={i}
              style={{
                padding: 24,
                borderRadius: 14,
                background: "var(--b-surface)",
                border: "1px solid var(--b-line)",
                display: "flex",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "var(--b-sig-soft)",
                  color: "var(--b-sig-deep)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={f.i} size={18} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{t(`landing.features.items.${f.id}.t`)}</div>
                <div style={{ fontSize: 13, color: "var(--b-fg-3)", lineHeight: 1.55 }}>
                  {t(`landing.features.items.${f.id}.d`)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "80px 56px", maxWidth: 820, margin: "0 auto" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--b-sig)",
            letterSpacing: "0.1em",
            marginBottom: 12,
          }}
        >
          {t("landing.faq.eyebrow")}
        </div>
        <h2
          style={{
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.026em",
            marginBottom: 32,
          }}
        >
          {t("landing.faq.title")}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {["goodposture", "privacy", "detect", "devices", "webapp", "background", "widget", "offline", "price", "data"].map((id) => (
            <details
              key={id}
              style={{
                padding: "18px 22px",
                borderRadius: 14,
                background: "var(--b-surface)",
                border: "1px solid var(--b-line)",
              }}
            >
              <summary
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  listStyle: "none",
                  color: "var(--b-fg-1)",
                }}
              >
                {t(`landing.faq.items.${id}.q`)}
              </summary>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--b-fg-2)",
                  lineHeight: 1.6,
                  margin: "12px 0 0",
                }}
              >
                {t(`landing.faq.items.${id}.a`)}
              </p>
            </details>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "80px 56px 100px",
          textAlign: "center",
          maxWidth: 700,
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.028em",
            marginBottom: 14,
            lineHeight: 1.15,
          }}
        >
          {t("landing.final.title")}
        </h2>
        <p style={{ fontSize: 16, color: "var(--b-fg-2)", marginBottom: 28 }}>
          {isBetaFree() ? t("landing.final.sub_beta") : t("landing.final.sub")}
        </p>
        <div style={{ display: "inline-flex", gap: 10 }}>
          <a
            href="#/download"
            className="b-btn b-btn-primary"
            style={{
              height: 48,
              padding: "0 24px",
              fontSize: 14,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="arrow-r" size={14} style={{ marginRight: 6 }} />
            {t("landing.final.downloadApp")}
          </a>
        </div>
      </div>

      <Footer />
    </div>
  );
}

// ───────── Auth Callback ─────────

function findAuthParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  const u = new URL(window.location.href);
  const fromSearch = u.searchParams.get(key);
  if (fromSearch) return fromSearch;
  const hash = window.location.hash;
  const q = hash.indexOf("?");
  if (q !== -1) {
    const hashParams = new URLSearchParams(hash.slice(q + 1));
    return hashParams.get(key);
  }
  return null;
}

function AuthCallback() {
  const { t } = useTranslation("marketing");
  const { configured } = useAuth();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!configured) {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(t("auth.errSupabase"));
        }
        return;
      }
      try {
        const errorDesc =
          findAuthParam("error_description") ?? findAuthParam("error");
        if (errorDesc) throw new Error(decodeURIComponent(errorDesc));

        // SDK 의 detectSessionInUrl 이 클라이언트 init 시 자동으로 code 를
        // exchange 합니다. 먼저 그 결과를 확인하고, 못 잡았을 때만 수동 exchange.
        let { data } = await supabase.auth.getSession();

        if (!data.session) {
          const code = findAuthParam("code");
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
            const result = await supabase.auth.getSession();
            data = result.data;
          }
        }

        if (cancelled) return;
        if (!data.session) throw new Error(t("auth.errNoSession"));

        const redirectTo = localStorage.getItem("barosit:auth_redirect");
        // 저장된 값이 *내부 hash 패턴* 일 때만 적용 — javascript: URI / 외부
        // URL 주입 방어. 비정상/부재 시 마케팅 홈(#/landing) 으로 fallback.
        localStorage.removeItem("barosit:auth_redirect");
        if (isSafeRedirectHash(redirectTo)) {
          window.location.replace(redirectTo);
        } else {
          // 웹 OAuth 콜백도 저장된 복귀 hash 가 없으면 마케팅 홈(랜딩)으로.
          window.location.replace("#/landing");
        }
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(
          e instanceof Error ? e.message : t("auth.errCantComplete"),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  return (
    <div
      style={{
        background: "var(--b-bg)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          padding: 32,
          borderRadius: 16,
          background: "var(--b-surface)",
          border: "1px solid var(--b-line)",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <Logo size={36} stroke="var(--b-sig)" />
        </div>
        {status === "loading" ? (
          <>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "-0.018em",
                marginBottom: 6,
              }}
            >
              {t("auth.finishing")}
            </h2>
            <p style={{ fontSize: 13, color: "var(--b-fg-3)", margin: 0 }}>
              {t("auth.finishingDesc")}
            </p>
          </>
        ) : (
          <>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "-0.018em",
                marginBottom: 6,
              }}
            >
              {t("auth.failed")}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--b-fg-3)",
                margin: 0,
                marginBottom: 18,
              }}
            >
              {errorMsg}
            </p>
            <a
              href="#/login"
              onClick={navigateToLogin}
              className="b-btn b-btn-primary"
              style={{ textDecoration: "none" }}
            >
              {t("auth.backToLogin")}
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// ───────── Forgot Password (비밀번호 찾기) ─────────

function ForgotPassword() {
  const { t } = useTranslation("marketing");
  const { resetPasswordForEmail, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!configured) {
      setError(t("auth.errSupabase"));
      return;
    }
    setLoading(true);
    try {
      await resetPasswordForEmail(email);
      // 이메일 enumeration 방어 — 가입 여부와 무관하게 동일 "보냈어요" 안내.
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginPage.emailGenericErr"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--b-bg)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          padding: 32,
          borderRadius: 16,
          background: "var(--b-surface)",
          border: "1px solid var(--b-line)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <Logo size={36} stroke="var(--b-sig)" />
        </div>
        {sent ? (
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.018em", marginBottom: 8 }}>
              {t("forgotPw.sentTitle")}
            </h2>
            <p style={{ fontSize: 13, color: "var(--b-fg-3)", lineHeight: 1.6, marginBottom: 18 }}>
              {t("forgotPw.sentDesc", { email })}
            </p>
            <a href="#/login" onClick={navigateToLogin} className="b-btn b-btn-primary" style={{ textDecoration: "none" }}>
              {t("auth.backToLogin")}
            </a>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 6, textAlign: "center" }}>
              {t("forgotPw.title")}
            </h2>
            <p style={{ fontSize: 13, color: "var(--b-fg-3)", lineHeight: 1.55, marginBottom: 22, textAlign: "center" }}>
              {t("forgotPw.desc")}
            </p>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                type="email"
                autoComplete="email"
                placeholder={t("loginPage.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  height: 44,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid var(--b-line)",
                  background: "var(--b-bg)",
                  color: "var(--b-fg-1)",
                  fontSize: 14,
                }}
              />
              {error && (
                <div role="alert" style={{ color: "#dc2626", fontSize: 12, lineHeight: 1.5 }}>
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="b-btn b-btn-primary"
                style={{
                  height: 46,
                  borderRadius: 24,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading ? "wait" : "pointer",
                }}
              >
                {loading ? t("forgotPw.sending") : t("forgotPw.submit")}
              </button>
              <a
                href="#/login"
                onClick={navigateToLogin}
                style={{ fontSize: 12, color: "var(--b-fg-3)", textAlign: "center", textDecoration: "none", marginTop: 4 }}
              >
                {t("auth.backToLogin")}
              </a>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ───────── Reset Password (비밀번호 재설정 — 복구 링크 도착 페이지) ─────────

function ResetPassword() {
  const { t } = useTranslation("marketing");
  const { updatePassword, configured } = useAuth();
  // ready: 복구 세션 확립 후 새 비번 입력 가능 / invalid: 링크 만료·무효
  const [phase, setPhase] = useState<"verifying" | "ready" | "invalid" | "done">("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 복구 링크는 PKCE code(또는 detectSessionInUrl 자동 교환)로 세션을 만든다.
  // AuthCallback 과 동일하게 getSession → 없으면 code 수동 교환으로 회복.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!configured) {
        if (!cancelled) setPhase("invalid");
        return;
      }
      try {
        const errorDesc = findAuthParam("error_description") ?? findAuthParam("error");
        if (errorDesc) throw new Error(decodeURIComponent(errorDesc));
        let { data } = await supabase.auth.getSession();
        if (!data.session) {
          const code = findAuthParam("code");
          if (code) {
            const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
            if (exErr) throw exErr;
            data = (await supabase.auth.getSession()).data;
          }
        }
        if (cancelled) return;
        setPhase(data.session ? "ready" : "invalid");
      } catch {
        if (!cancelled) setPhase("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("loginPage.emailPwTooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("resetPw.mismatch"));
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginPage.emailGenericErr"));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    height: 44,
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid var(--b-line)",
    background: "var(--b-bg)",
    color: "var(--b-fg-1)",
    fontSize: 14,
  };

  return (
    <div
      style={{
        background: "var(--b-bg)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          padding: 32,
          borderRadius: 16,
          background: "var(--b-surface)",
          border: "1px solid var(--b-line)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <Logo size={36} stroke="var(--b-sig)" />
        </div>

        {phase === "verifying" && (
          <p style={{ fontSize: 13, color: "var(--b-fg-3)", textAlign: "center", margin: 0 }}>
            {t("resetPw.verifying")}
          </p>
        )}

        {phase === "invalid" && (
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{t("resetPw.invalidTitle")}</h2>
            <p style={{ fontSize: 13, color: "var(--b-fg-3)", lineHeight: 1.6, marginBottom: 18 }}>
              {t("resetPw.invalidDesc")}
            </p>
            <a href="#/forgot-password" className="b-btn b-btn-primary" style={{ textDecoration: "none" }}>
              {t("resetPw.requestAgain")}
            </a>
          </div>
        )}

        {phase === "done" && (
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{t("resetPw.doneTitle")}</h2>
            <p style={{ fontSize: 13, color: "var(--b-fg-3)", lineHeight: 1.6, marginBottom: 18 }}>
              {t("resetPw.doneDesc")}
            </p>
            <a href="#/login" onClick={navigateToLogin} className="b-btn b-btn-primary" style={{ textDecoration: "none" }}>
              {t("resetPw.goLogin")}
            </a>
          </div>
        )}

        {phase === "ready" && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 6, textAlign: "center" }}>
              {t("resetPw.title")}
            </h2>
            <p style={{ fontSize: 13, color: "var(--b-fg-3)", lineHeight: 1.55, marginBottom: 22, textAlign: "center" }}>
              {t("resetPw.desc")}
            </p>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                type="password"
                autoComplete="new-password"
                placeholder={t("resetPw.newPw")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                style={inputStyle}
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder={t("resetPw.confirmPw")}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                style={inputStyle}
              />
              {error && (
                <div role="alert" style={{ color: "#dc2626", fontSize: 12, lineHeight: 1.5 }}>
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="b-btn b-btn-primary"
                style={{ height: 46, borderRadius: 24, fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer" }}
              >
                {loading ? t("resetPw.saving") : t("resetPw.submit")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ───────── Legal (Privacy / Terms) ─────────

const LEGAL_SOURCE: Record<"privacy" | "terms", string> = {
  privacy: privacyMd,
  terms: termsMd,
};

// 법적 문서 제목은 footer.privacy / footer.terms 키 재사용
const LEGAL_TITLE_KEY: Record<"privacy" | "terms", string> = {
  privacy: "footer.privacy",
  terms: "footer.terms",
};

function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { t, i18n } = useTranslation("marketing");
  const md = useMemo(() => interpolateLegalTemplate(LEGAL_SOURCE[kind]), [kind]);
  const otherKind = kind === "privacy" ? "terms" : "privacy";
  // 법적 본문은 한국어 정본만 유지 — ko 외 언어에서는 상단 안내 배너 표시
  const showLangNotice = i18n.language !== "ko";
  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav />
      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: "60px 56px 80px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--b-sig)",
            letterSpacing: "0.1em",
            marginBottom: 10,
          }}
        >
          LEGAL
        </div>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: "-0.028em",
            margin: 0,
            marginBottom: 8,
            lineHeight: 1.15,
          }}
        >
          {t(LEGAL_TITLE_KEY[kind])}
        </h1>

        {showLangNotice && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "12px 16px",
              marginBottom: 20,
              borderRadius: 10,
              background: "var(--b-sig-bg)",
              border: "1px solid var(--b-sig-soft)",
              fontSize: 13,
              color: "var(--b-fg-2)",
              lineHeight: 1.5,
            }}
          >
            <Icon name="info" size={15} style={{ color: "var(--b-sig)", marginTop: 1, flexShrink: 0 }} />
            <span>{t("legal:langNotice")}</span>
          </div>
        )}

        <div
          className="b-legal-body"
          style={{
            border: "1px solid var(--b-line)",
            borderRadius: 14,
            background: "var(--b-surface)",
            padding: "28px 32px",
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children, ...props }) => {
                if (!href) return <>{children}</>;
                if (href.includes("pricing-policy.md")) {
                  return (
                    <a
                      href="#"
                      style={{ cursor: "pointer", textDecoration: "underline" }}
                      onClick={(e) => {
                        e.preventDefault();
                        alert(t("legal.refundAlert"));
                      }}
                    >
                      {children}
                    </a>
                  );
                }
                if (href.includes("changelog.md")) {
                  return (
                    <a href="#/changelog" style={{ textDecoration: "underline" }}>
                      {children}
                    </a>
                  );
                }
                if (href.includes("settings.md")) {
                  return (
                    <a href="#/landing" style={{ textDecoration: "underline" }}>
                      {children}
                    </a>
                  );
                }
                if (href.includes("privacy.md")) {
                  return (
                    <a href="#/privacy" style={{ textDecoration: "underline" }}>
                      {children}
                    </a>
                  );
                }
                if (href.includes("terms.md")) {
                  return (
                    <a href="#/terms" style={{ textDecoration: "underline" }}>
                      {children}
                    </a>
                  );
                }
                const isExternal = href.startsWith("http") || href.startsWith("//");
                return (
                  <a
                    href={href}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    style={{ textDecoration: "underline" }}
                    {...props}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {md}
          </ReactMarkdown>
        </div>
        <div
          style={{
            marginTop: 28,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <a
            href={`#/${otherKind}`}
            className="b-btn b-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            <Icon name="arrow-r" size={12} />{" "}
            {t("legal.viewOther", { title: t(LEGAL_TITLE_KEY[otherKind]) })}
          </a>
          <a
            href="#/community"
            className="b-btn b-btn-quiet"
            style={{ textDecoration: "none" }}
          >
            {t("legal.communityLink")}
          </a>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function ChangelogPage() {
  const { t, i18n } = useTranslation("marketing");
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReleases = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("releases")
          .select("*")
          .order("released_at", { ascending: false });
        
        if (error) {
          throw error;
        }
        setReleases(data || []);
      } catch (err: any) {
        console.error("Failed to fetch releases:", err);
        setError(t("changelog.error"));
      } finally {
        setLoading(false);
      }
    };
    fetchReleases();
  }, []);

  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav />
      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: "60px 56px 80px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--b-sig)",
            letterSpacing: "0.1em",
            marginBottom: 10,
          }}
        >
          RELEASE NOTES
        </div>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: "-0.028em",
            margin: 0,
            marginBottom: 8,
            lineHeight: 1.15,
          }}
        >
          {t("changelog.title")}
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--b-fg-3)",
            margin: 0,
            marginBottom: 32,
          }}
        >
          {t("changelog.subtitle")}
        </p>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0", color: "var(--b-fg-3)", fontSize: 14 }}>
            {t("changelog.loading")}
          </div>
        ) : error ? (
          <div style={{ padding: "40px", border: "1px solid #ff4d4f", borderRadius: 14, background: "rgba(255, 77, 79, 0.05)", color: "#ff4d4f", fontSize: 14, textAlign: "center" }}>
            {error}
          </div>
        ) : releases.length === 0 ? (
          <div style={{ padding: "80px 40px", border: "1px solid var(--b-line)", borderRadius: 14, background: "var(--b-surface)", color: "var(--b-fg-3)", fontSize: 14, textAlign: "center" }}>
            {t("changelog.empty")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {releases.map((release) => (
              <div
                key={release.id}
                style={{
                  border: "1px solid var(--b-line)",
                  borderRadius: 14,
                  background: "var(--b-surface)",
                  padding: "36px 40px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                {/* 헤더: 버전 + 날짜 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--b-line)", paddingBottom: 16, flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{
                        background: "var(--b-sig)",
                        color: "#fff",
                        padding: "4px 12px",
                        borderRadius: 20,
                        fontSize: 14,
                        fontWeight: 700,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {release.version}
                    </span>
                  </div>
                  <span style={{ fontSize: 13, color: "var(--b-fg-3)", fontWeight: 500 }}>
                    {new Date(release.released_at).toLocaleString(i18n.language, {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* 본문 마크다운 */}
                <div className="b-legal-body" style={{ fontSize: 14, lineHeight: 1.7, color: "var(--b-fg-2)" }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children, ...props }) => {
                        if (!href) return <>{children}</>;
                        const isExternal = href.startsWith("http") || href.startsWith("//");
                        return (
                          <a
                            href={href}
                            target={isExternal ? "_blank" : undefined}
                            rel={isExternal ? "noopener noreferrer" : undefined}
                            style={{ textDecoration: "underline" }}
                            {...props}
                          >
                            {children}
                          </a>
                        );
                      },
                    }}
                  >
                    {release.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 40,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <a
            href="#/landing"
            className="b-btn b-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            {t("changelog.home")}
          </a>
          <a
            href="#/privacy"
            className="b-btn b-btn-quiet"
            style={{ textDecoration: "none" }}
          >
            {t("changelog.viewPrivacy")}
          </a>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ───────── Contact ─────────

// 카테고리는 DB의 category 컬럼에 저장되는 정규값(한국어+이모지)이므로 값은 유지하고
// 표시 라벨만 번역한다. 새 글 작성 시에도 정규값으로 저장돼 기존 데이터와 정합성 유지.
// 운영자(관리자) 전용 카테고리 — 글쓰기는 관리자만, 읽기/댓글은 전체 허용.
const COMMUNITY_NOTICE_CATEGORY = "📣 공지";
const COMMUNITY_CATEGORIES = [
  { value: "💡 기능 제안", key: "community.cat.feature" },
  { value: "🔥 자세인증 챌린지", key: "community.cat.challenge" },
  { value: "📢 자유 토론", key: "community.cat.free" },
  { value: "❓ 질문/답변", key: "community.cat.qna" },
  { value: COMMUNITY_NOTICE_CATEGORY, key: "community.cat.notice" },
];
const COMMUNITY_ALL_CATEGORY = "전체";

function Contact({ initialPostId }: { initialPostId?: string | null }) {
  const { user } = useAuth();
  const { t } = useTranslation("marketing");

  // 저장된 카테고리 정규값 → 표시 라벨
  const categoryLabel = (value: string | null | undefined): string => {
    if (!value) return t("community.cat.fallback");
    const found = COMMUNITY_CATEGORIES.find((c) => c.value === value);
    return found ? t(found.key) : value;
  };

  // --- States ---
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "write" | "detail">("list");
  const [activePost, setActivePost] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Filter & Sort & Category
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "likes">("recent");
  const [activeCategory, setActiveCategory] = useState<string>(COMMUNITY_ALL_CATEGORY);
  // 글 목록 페이지네이션("더 보기")
  const POSTS_PAGE = 20;
  const [postsLimit, setPostsLimit] = useState(POSTS_PAGE);
  const [hasMorePosts, setHasMorePosts] = useState(false);

  // Post Form States
  const [writeTitle, setWriteTitle] = useState("");
  const [writeContent, setWriteContent] = useState("");
  const [writeAuthor, setWriteAuthor] = useState("");
  const [writePassword, setWritePassword] = useState("");
  const [writeCategory, setWriteCategory] = useState(COMMUNITY_CATEGORIES[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Comment Form States
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [commentPassword, setCommentPassword] = useState("");
  // 답글 대상(1단계 스레드). parentId = 답글이 매달릴 최상위 댓글 id.
  const [replyTo, setReplyTo] = useState<{ id: string; author: string; parentId: string } | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  // 댓글 정렬: 작성순(recent) / 인기순(top, 추천 많은 순)
  const [commentSort, setCommentSort] = useState<"recent" | "top">("recent");
  // 본인(회원) 댓글 인라인 수정
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  // 펼쳐진 답글 스레드(최상위 댓글 id 집합). 기본은 접힘 — 유튜브식 "답글 N개" 토글.
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const toggleThread = (topId: string) =>
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      next.has(topId) ? next.delete(topId) : next.add(topId);
      return next;
    });
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  // 답글 클릭 → 대상 지정 + 인라인 입력창으로 스크롤·포커스(유튜브식: 그 댓글 바로 아래에서 입력)
  const startReply = (comment: any) => {
    const parentId = comment.parent_comment_id || comment.id;
    setReplyTo({ id: comment.id, author: comment.author_name, parentId });
    setExpandedThreads((prev) => new Set(prev).add(parentId)); // 답글 작성 중엔 스레드 펼침 유지
    requestAnimationFrame(() => {
      commentInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      commentInputRef.current?.focus({ preventScroll: true });
    });
  };

  // Password Verification Modal
  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean;
    type: "post_delete" | "comment_delete";
    targetId: string;
    error: string | null;
  }>({
    isOpen: false,
    type: "post_delete",
    targetId: "",
    error: null,
  });
  const [passwordInput, setPasswordInput] = useState("");

  // Input Focus States
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // 아바타(프로필) 확대 보기 라이트박스
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // 작성자 활동 모달: 회원 이름 클릭 → 그 회원의 글/댓글 모아보기 → 클릭 시 해당 스레드 이동
  const [authorModal, setAuthorModal] = useState<{ userId: string; name: string } | null>(null);
  const [authorPosts, setAuthorPosts] = useState<any[]>([]);
  const [authorComments, setAuthorComments] = useState<any[]>([]);
  const [authorLoading, setAuthorLoading] = useState(false);

  // 특정 댓글로 점프(스크롤+하이라이트) — 모달의 댓글 클릭 시 사용
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const pendingHighlightRef = useRef<string | null>(null);

  // 경량 토스트(alert 대체) — 하단 중앙, 3초 후 자동 사라짐.
  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = (msg: string, type: "error" | "success" = "error") => {
    setToast({ msg, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  };

  // 로그인 유저가 추천한 글/댓글 id 집합(DB 조인 테이블에서 로드). 게스트는 localStorage 사용.
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const isPostLiked = (post: any) =>
    user ? likedPostIds.has(post.id) : !!localStorage.getItem(`barosit_liked_${post.id}`);
  const isCommentLiked = (comment: any) =>
    user ? likedCommentIds.has(comment.id) : !!localStorage.getItem(`barosit_liked_comment_${comment.id}`);

  // 운영자(관리자) 여부 — 📣 공지 카테고리 글쓰기 권한 제어용
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setIsAdmin(false); return; }
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .maybeSingle();
        if (!cancelled) setIsAdmin(!error && !!data?.is_admin);
      } catch { if (!cancelled) setIsAdmin(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // 실시간 댓글: 활성 글의 comments 변경(INSERT/UPDATE/DELETE) 구독 → 갱신. 글 변경/언마운트 시 정리.
  useEffect(() => {
    if (!activePost?.id) return;
    const postId = activePost.id;
    const channel = supabase
      .channel(`comments-${postId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` },
        () => { fetchComments(postId); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePost?.id]);

  // 모달/라이트박스 ESC 닫기(접근성)
  useEffect(() => {
    if (!authorModal && !zoomedImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setAuthorModal(null); setZoomedImage(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authorModal, zoomedImage]);

  // 댓글 로드 후 점프 대상이 있으면 스크롤+하이라이트(2초). 답글이면 부모 스레드는 이미 펼쳐둔 상태.
  useEffect(() => {
    const id = pendingHighlightRef.current;
    if (!id || comments.length === 0) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(`comment-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightCommentId(id);
      pendingHighlightRef.current = null;
      window.setTimeout(() => setHighlightCommentId(null), 2000);
    });
  }, [comments]);

  // --- Auto-set profile display name for logged-in users ---
  useEffect(() => {
    if (user) {
      const localProfileRaw = localStorage.getItem("user_profile_v1");
      let displayName = "";
      if (localProfileRaw) {
        try {
          const profile = JSON.parse(localProfileRaw);
          displayName = profile.name;
        } catch (e) {}
      }
      if (!displayName) {
        displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "";
      }
      setWriteAuthor(displayName);
      setCommentAuthor(displayName);
    } else {
      setWriteAuthor("");
      setCommentAuthor("");
    }
  }, [user, view]);

  // --- Password Hashing (SHA-256) ---
  const hashPassword = async (password: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  // --- DB Fetching ---
  const fetchPosts = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let query = supabase.from("posts").select("*, comments(count)");

      if (searchQuery.trim()) {
        query = query.or(
          `title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%,author_name.ilike.%${searchQuery}%`
        );
      }

      if (activeCategory !== COMMUNITY_ALL_CATEGORY) {
        query = query.eq("category", activeCategory);
      }

      if (sortBy === "likes") {
        query = query.order("likes", { ascending: false }).order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      query = query.limit(postsLimit);

      const { data, error } = await query;
      if (error) throw error;
      // Supabase embeds the aggregate as comments: [{ count }] — flatten to a plain number.
      const rows = (data || []).map((p: any) => ({
        ...p,
        comment_count: Array.isArray(p.comments) ? (p.comments[0]?.count ?? 0) : 0,
      }));
      setPosts(rows);
      setHasMorePosts(rows.length === postsLimit); // 정확히 limit만큼이면 더 있을 수 있음

      // 로그인 유저: 이 목록 중 내가 추천한 글 id 로드(다기기 동기화·정확한 토글 상태)
      if (user && rows.length) {
        const { data: likes } = await supabase
          .from("post_likes")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", rows.map((p: any) => p.id));
        setLikedPostIds(new Set((likes || []).map((r: any) => r.post_id)));
      } else if (!user) {
        setLikedPostIds(new Set());
      }
    } catch (err: any) {
      console.error("Error fetching posts:", err);
      setErrorMsg(t("community.errFetch"));
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async (postId: string) => {
    setCommentsLoading(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data || [];
      setComments(rows);
      // 로그인 유저: 이 글의 댓글 중 내가 추천한 것 로드
      if (user && rows.length) {
        const { data: likes } = await supabase
          .from("comment_likes")
          .select("comment_id")
          .eq("user_id", user.id)
          .in("comment_id", rows.map((c: any) => c.id));
        setLikedCommentIds(new Set((likes || []).map((r: any) => r.comment_id)));
      } else {
        setLikedCommentIds(new Set());
      }
    } catch (err) {
      console.error("Error fetching comments:", err);
    } finally {
      setCommentsLoading(false);
    }
  };

  // --- Effects ---
  useEffect(() => {
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, activeCategory, postsLimit]);

  // 필터(정렬·카테고리·검색)가 바뀌면 첫 페이지로 리셋
  useEffect(() => {
    setPostsLimit(POSTS_PAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, activeCategory]);

  // 인증(user)이 데이터 로드보다 늦게 복원되는 경우(새로고침 등) liked 집합을 다시 채운다.
  // deps는 [user]만 — 추천 토글로 posts/comments가 바뀔 때 재실행되지 않게(낙관적 업데이트 보존).
  useEffect(() => {
    if (!user) { setLikedPostIds(new Set()); setLikedCommentIds(new Set()); return; }
    let cancelled = false;
    (async () => {
      if (posts.length) {
        const { data } = await supabase
          .from("post_likes").select("post_id").eq("user_id", user.id)
          .in("post_id", posts.map((p) => p.id));
        if (!cancelled) setLikedPostIds(new Set((data || []).map((r: any) => r.post_id)));
      }
      if (comments.length) {
        const { data } = await supabase
          .from("comment_likes").select("comment_id").eq("user_id", user.id)
          .in("comment_id", comments.map((c) => c.id));
        if (!cancelled) setLikedCommentIds(new Set((data || []).map((r: any) => r.comment_id)));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      fetchPosts();
    }
  };

  // --- Actions ---
  const handleSelectPost = async (post: any) => {
    setActivePost(post);
    setView("detail");
    fetchComments(post.id);
    // permalink 진입/공유 시 클라 title 도 SSR 과 일치시킨다(#18 SEO).
    if (typeof document !== "undefined" && post?.title) {
      document.title = `${post.title} — BaroSit 커뮤니티`;
    }

    // Increment Views with sessionStorage check (1 view per session)
    const viewKey = `barosit_viewed_${post.id}`;
    if (!sessionStorage.getItem(viewKey)) {
      sessionStorage.setItem(viewKey, "true");
      try {
        // SECURITY DEFINER RPC — posts UPDATE RLS(소유자 전용) 우회하여 타인 글 조회수도 증가
        const { error } = await supabase.rpc("increment_post_views", { p_id: post.id });
        if (error) throw error;
        // Update local state views count
        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, views: p.views + 1 } : p))
        );
      } catch (err) {
        console.error("Error updating views:", err);
      }
    }
  };

  // permalink(/community/p/<id>) deep-link / back-forward 로 특정 글을 직접 조회해 연다.
  // 리스트 페이지네이션에 없어도 열리도록 id 로 단건 조회.
  const openPostById = async (postId: string) => {
    try {
      const { data } = await supabase
        .from("posts")
        .select("*, comments(count)")
        .eq("id", postId)
        .maybeSingle();
      if (data) {
        handleSelectPost({ ...data, comment_count: data.comments?.[0]?.count ?? 0 });
      }
    } catch (err) {
      console.error("Error opening post by id:", err);
    }
  };

  // 글 permalink(#18 SEO). 리스트/제목 클릭 시 pathname 을 permalink 로 pushState 해
  // 공유·크롤 가능한 URL 로 만든 뒤 상세를 연다(리로드 없음).
  const communityPostHref = (id: string) => `/community/p/${id}`;
  const openPost = (post: any) => {
    window.history.pushState({}, "", communityPostHref(post.id));
    handleSelectPost(post);
  };
  // 상세 닫기 → 리스트. permalink pathname 을 canonical 리스트 URL(/#/community)로 되돌린다
  // (리로드해도 해시 라우팅이 community 로 복원).
  const closeDetail = () => {
    if (window.location.pathname.startsWith("/community/p/")) {
      window.history.pushState({}, "", "/#/community");
    }
    if (typeof document !== "undefined") document.title = "BaroSit 커뮤니티";
    setView("list");
    setActivePost(null);
  };

  // 최초 진입이 permalink(/community/p/<id>) 면 해당 글 자동 오픈(#18 SEO).
  useEffect(() => {
    if (initialPostId) openPostById(initialPostId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPostId]);

  // 브라우저 back/forward → pathname 재해석. permalink 면 글 열기, 아니면 리스트로.
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/^\/community\/p\/([^/]+)\/?$/);
      if (m) openPostById(decodeURIComponent(m[1]));
      else { setView("list"); setActivePost(null); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 회원 이름 클릭 → 그 회원의 글/댓글 로드해 모달 표시. 게스트(user_id 없음)는 호출 안 됨.
  const openAuthorProfile = async (userId: string, name: string) => {
    setAuthorModal({ userId, name });
    setAuthorPosts([]);
    setAuthorComments([]);
    setAuthorLoading(true);
    try {
      const [postsRes, commentsRes] = await Promise.all([
        supabase.from("posts").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        // 댓글이 달린 원글(posts)을 함께 가져와 클릭 시 해당 스레드로 이동
        supabase.from("comments").select("*, posts(*)").eq("user_id", userId).order("created_at", { ascending: false }),
      ]);
      if (postsRes.error) throw postsRes.error;
      if (commentsRes.error) throw commentsRes.error;
      setAuthorPosts(postsRes.data || []);
      setAuthorComments(commentsRes.data || []);
    } catch (err) {
      console.error("Error loading author profile:", err);
    } finally {
      setAuthorLoading(false);
    }
  };

  // 모달의 글 클릭 → 모달 닫고 해당 스레드(글 상세)로 이동
  const goToThreadFromModal = (post: any) => {
    if (!post) return;
    setAuthorModal(null);
    handleSelectPost(post);
  };

  // 모달의 댓글 클릭 → 원글로 이동 + 그 댓글로 스크롤·하이라이트. 답글이면 부모 스레드를 미리 펼친다.
  const goToCommentFromModal = (comment: any) => {
    const post = comment.posts;
    if (!post) return;
    setAuthorModal(null);
    if (comment.parent_comment_id) {
      setExpandedThreads((prev) => new Set(prev).add(comment.parent_comment_id));
    }
    pendingHighlightRef.current = comment.id;
    handleSelectPost(post);
  };

  // 회원 이름을 클릭 가능한 버튼으로(폰트·색은 주변 상속). 게스트/운영자(Aria)는 일반 텍스트.
  const renderAuthorName = (name: string, userId: string | null | undefined, isAgent?: boolean) => {
    if (!userId || isAgent) return <>{name}</>;
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); openAuthorProfile(userId, name); }}
        style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
        onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        title={t("community.viewAuthorPosts", { name })}
      >
        {name}
      </button>
    );
  };

  const handleLikePost = async (e: React.MouseEvent, post: any) => {
    e.stopPropagation();
    const wasLiked = isPostLiked(post);
    const delta = wasLiked ? -1 : 1; // 토글: 이미 눌렀으면 취소(-1), 아니면 추천(+1)

    // 카운트 낙관적 업데이트(목록·상세 동기)
    const setCount = (likes: number) => {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, likes } : p)));
      if (activePost && activePost.id === post.id) {
        setActivePost((prev: any) => ({ ...prev, likes }));
      }
    };
    const optimistic = Math.max((post.likes || 0) + delta, 0);
    setCount(optimistic);

    if (user) {
      // 로그인: DB 조인 테이블 토글(다기기 동기화·1인1추천). 서버가 정확한 수치·상태 반환.
      setLikedPostIds((prev) => { const n = new Set(prev); wasLiked ? n.delete(post.id) : n.add(post.id); return n; });
      try {
        const { data, error } = await supabase.rpc("toggle_post_like", { p_id: post.id });
        if (error) throw error;
        if (data) {
          setCount(data.likes);
          setLikedPostIds((prev) => { const n = new Set(prev); data.liked ? n.add(post.id) : n.delete(post.id); return n; });
        }
      } catch (err) {
        console.error("Error toggling post like:", err);
        setCount(post.likes || 0); // 롤백
        setLikedPostIds((prev) => { const n = new Set(prev); wasLiked ? n.add(post.id) : n.delete(post.id); return n; });
      }
      return;
    }

    // 게스트: localStorage + 단순 증감 RPC(유저별 추적 불가, MVP)
    const likeKey = `barosit_liked_${post.id}`;
    if (wasLiked) localStorage.removeItem(likeKey);
    else localStorage.setItem(likeKey, "true");
    try {
      const { error } = await supabase.rpc(wasLiked ? "decrement_post_likes" : "increment_post_likes", { p_id: post.id });
      if (error) throw error;
    } catch (err) {
      console.error("Error toggling post like:", err);
      if (wasLiked) localStorage.setItem(likeKey, "true");
      else localStorage.removeItem(likeKey);
      setCount(post.likes || 0);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const needsPassword = !user;

    // 📣 공지는 운영자 전용 — 비관리자가 (UI 우회로라도) 공지로 작성 시도하면 차단
    if (writeCategory === COMMUNITY_NOTICE_CATEGORY && !isAdmin) {
      setErrorMsg(t("community.errNoticeAdminOnly"));
      return;
    }

    if (!writeTitle.trim() || !writeContent.trim() || !writeAuthor.trim() || (needsPassword && !writePassword.trim())) {
      setErrorMsg(t("community.errFillAll"));
      return;
    }
    if (needsPassword && writePassword.length < 4) {
      setErrorMsg(t("community.errPwMin"));
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const hashedPassword = needsPassword ? await hashPassword(writePassword) : "";
      const { error } = await supabase.from("posts").insert([
        {
          title: writeTitle.trim(),
          content: writeContent.trim(),
          author_name: writeAuthor.trim(),
          password_hash: hashedPassword,
          user_id: user ? user.id : null,
          category: writeCategory,
        },
      ]);

      if (error) throw error;

      // Reset
      setWriteTitle("");
      setWriteContent("");
      setWritePassword("");
      if (!user) setWriteAuthor("");
      setView("list");
      fetchPosts();
    } catch (err: any) {
      console.error("Error creating post:", err);
      setErrorMsg(err.message || t("community.errCreatePost"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLikeComment = async (comment: any) => {
    const wasLiked = isCommentLiked(comment);
    const delta = wasLiked ? -1 : 1; // 토글: 이미 추천했으면 취소(-1)

    const setCount = (likes: number) =>
      setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, likes } : c)));
    setCount(Math.max((comment.likes || 0) + delta, 0)); // 낙관적

    if (user) {
      // 로그인: DB 조인 테이블 토글
      setLikedCommentIds((prev) => { const n = new Set(prev); wasLiked ? n.delete(comment.id) : n.add(comment.id); return n; });
      try {
        const { data, error } = await supabase.rpc("toggle_comment_like", { p_id: comment.id });
        if (error) throw error;
        if (data) {
          setCount(data.likes);
          setLikedCommentIds((prev) => { const n = new Set(prev); data.liked ? n.add(comment.id) : n.delete(comment.id); return n; });
        }
      } catch (err) {
        console.error("Error toggling comment like:", err);
        setCount(comment.likes || 0);
        setLikedCommentIds((prev) => { const n = new Set(prev); wasLiked ? n.add(comment.id) : n.delete(comment.id); return n; });
      }
      return;
    }

    // 게스트: localStorage + 단순 증감 RPC
    const likeKey = `barosit_liked_comment_${comment.id}`;
    if (wasLiked) localStorage.removeItem(likeKey);
    else localStorage.setItem(likeKey, "true");
    try {
      const { error } = await supabase.rpc(wasLiked ? "decrement_comment_likes" : "increment_comment_likes", { p_id: comment.id });
      if (error) throw error;
    } catch (err) {
      console.error("Error toggling comment like:", err);
      if (wasLiked) localStorage.setItem(likeKey, "true");
      else localStorage.removeItem(likeKey);
      setCount(comment.likes || 0);
    }
  };

  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePost) return;

    const needsPassword = !user;
    if (!commentAuthor.trim() || !commentContent.trim() || (needsPassword && !commentPassword.trim())) {
      showToast(t("community.alertFillAll"));
      return;
    }
    if (needsPassword && commentPassword.length < 4) {
      showToast(t("community.alertCommentPwMin"));
      return;
    }

    setCommentSubmitting(true);
    try {
      const hashedPassword = needsPassword ? await hashPassword(commentPassword) : "";
      const { error } = await supabase.from("comments").insert([
        {
          post_id: activePost.id,
          content: commentContent.trim(),
          author_name: commentAuthor.trim(),
          password_hash: hashedPassword,
          user_id: user ? user.id : null,
          parent_comment_id: replyTo?.parentId ?? null,
        },
      ]);

      if (error) throw error;

      setCommentContent("");
      setCommentPassword("");
      if (!user) setCommentAuthor("");
      setReplyTo(null);
      // 목록 카드의 댓글 수 즉시 반영
      setPosts((prev) => prev.map((p) => (p.id === activePost.id ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p)));
      fetchComments(activePost.id);
    } catch (err) {
      console.error("Error creating comment:", err);
      showToast(t("community.errCreateComment"));
    } finally {
      setCommentSubmitting(false);
    }
  };

  // --- 본인(회원) 댓글 인라인 수정 ---
  const startEditComment = (comment: any) => {
    setEditingCommentId(comment.id);
    setEditingContent(comment.content);
  };
  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditingContent("");
  };
  const saveEditComment = async (comment: any) => {
    const next = editingContent.trim();
    if (!next) { showToast(t("community.alertFillAll")); return; }
    if (next === comment.content) { cancelEditComment(); return; }
    setEditSubmitting(true);
    try {
      // RLS: 본인(user_id=auth.uid()) 댓글만 UPDATE 허용
      const { data, error } = await supabase
        .from("comments").update({ content: next }).eq("id", comment.id).eq("user_id", user!.id).select();
      if (error) throw error;
      if (!data || data.length === 0) { showToast(t("community.errNoPermComment")); return; }
      setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, content: next } : c)));
      cancelEditComment();
    } catch (err) {
      console.error("Error editing comment:", err);
      showToast(t("community.errServerDelete"));
    } finally {
      setEditSubmitting(false);
    }
  };

  // --- Deletion Handler with Direct Member Option ---
  const handlePostDeleteClick = () => {
    if (activePost.user_id && user && activePost.user_id === user.id) {
      if (confirm(t("community.confirmDeletePost"))) {
        executeDirectDelete("post_delete", activePost.id);
      }
    } else {
      openDeleteModal("post_delete", activePost.id);
    }
  };

  const handleCommentDeleteClick = (comment: any) => {
    if (comment.user_id && user && comment.user_id === user.id) {
      if (confirm(t("community.confirmDeleteComment"))) {
        executeDirectDelete("comment_delete", comment.id);
      }
    } else {
      openDeleteModal("comment_delete", comment.id);
    }
  };

  const executeDirectDelete = async (type: "post_delete" | "comment_delete", targetId: string) => {
    if (!user) return;
    try {
      if (type === "post_delete") {
        const { data, error } = await supabase
          .from("posts")
          .delete()
          .eq("id", targetId)
          .eq("user_id", user.id)
          .select();

        if (error) throw error;

        if (!data || data.length === 0) {
          showToast(t("community.errNoPermPost"));
          return;
        }

        setView("list");
        setActivePost(null);
        fetchPosts();
      } else {
        const { data, error } = await supabase
          .from("comments")
          .delete()
          .eq("id", targetId)
          .eq("user_id", user.id)
          .select();

        if (error) throw error;

        if (!data || data.length === 0) {
          showToast(t("community.errNoPermComment"));
          return;
        }

        if (activePost) {
          setPosts((prev) => prev.map((p) => (p.id === activePost.id ? { ...p, comment_count: Math.max((p.comment_count || 0) - 1, 0) } : p)));
          fetchComments(activePost.id);
        }
      }
    } catch (err) {
      console.error("Error executing direct delete:", err);
      showToast(t("community.errServerDelete"));
    }
  };

  const openDeleteModal = (type: "post_delete" | "comment_delete", targetId: string) => {
    setPasswordInput("");
    setPasswordModal({
      isOpen: true,
      type,
      targetId,
      error: null,
    });
  };

  const closeDeleteModal = () => {
    setPasswordModal({ isOpen: false, type: "post_delete", targetId: "", error: null });
    setPasswordInput("");
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;

    setPasswordModal((prev) => ({ ...prev, error: null }));
    try {
      const hashed = await hashPassword(passwordInput);

      if (passwordModal.type === "post_delete") {
        // Delete post matching id and password_hash
        const { data, error } = await supabase
          .from("posts")
          .delete()
          .eq("id", passwordModal.targetId)
          .eq("password_hash", hashed)
          .select();

        if (error) throw error;

        if (!data || data.length === 0) {
          setPasswordModal((prev) => ({
            ...prev,
            error: t("community.errPwWrongPost"),
          }));
          return;
        }

        // Success
        closeDeleteModal();
        setView("list");
        setActivePost(null);
        fetchPosts();
      } else {
        // Delete comment matching id and password_hash
        const { data, error } = await supabase
          .from("comments")
          .delete()
          .eq("id", passwordModal.targetId)
          .eq("password_hash", hashed)
          .select();

        if (error) throw error;

        if (!data || data.length === 0) {
          setPasswordModal((prev) => ({
            ...prev,
            error: t("community.errPwWrongComment"),
          }));
          return;
        }

        // Success
        closeDeleteModal();
        if (activePost) {
          setPosts((prev) => prev.map((p) => (p.id === activePost.id ? { ...p, comment_count: Math.max((p.comment_count || 0) - 1, 0) } : p)));
          fetchComments(activePost.id);
        }
      }
    } catch (err) {
      console.error("Error deleting:", err);
      setPasswordModal((prev) => ({
        ...prev,
        error: t("community.errServerDelete"),
      }));
    }
  };

  // Helper date formatter
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${y}.${m}.${d} ${h}:${min}`;
  };

  // 유튜브식 상대 시간: 방금 전 / N분·시간·일 전, 7일 넘으면 절대 날짜.
  const formatRelativeTime = (isoString: string) => {
    if (!isoString) return "";
    const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diffSec < 60) return t("community.timeJustNow");
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return t("community.timeMinAgo", { count: diffMin });
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return t("community.timeHourAgo", { count: diffHour });
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return t("community.timeDayAgo", { count: diffDay });
    return formatDate(isoString);
  };

  // 댓글/답글 단일 박스 (최상위·답글 공용). 들여쓰기는 바깥 컨테이너가 담당한다.
  const renderCommentNode = (comment: any) => (
    <div
      key={comment.id}
      id={`comment-${comment.id}`}
      style={{
        padding: "16px 20px",
        borderRadius: 14,
        background: comment.is_agent ? "var(--b-sig-soft)" : "rgba(255, 255, 255, 0.5)",
        border: comment.is_agent ? "1px solid var(--b-sig)" : "1px solid var(--b-line)",
        borderLeft: comment.is_agent ? "3px solid var(--b-sig)" : "1px solid var(--b-line)",
        // 점프 하이라이트: 시그니처 링 + 살짝 강조, 2초 후 해제
        boxShadow: highlightCommentId === comment.id ? "0 0 0 2px var(--b-sig)" : "none",
        transition: "box-shadow 0.4s ease",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
      }}
    >
      {/* Comment Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-2)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          {comment.is_agent && <AriaAvatar size={24} onClick={ARIA_AVATAR_SRC ? () => setZoomedImage(ARIA_AVATAR_SRC) : undefined} />}
          {renderAuthorName(comment.author_name, comment.user_id, comment.is_agent)}
          {comment.is_agent ? (
            <span style={{
              fontSize: 9,
              padding: "1px 6px",
              borderRadius: 4,
              background: "var(--b-sig)",
              color: "#fff",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}>{t(comment.agent_role === "manager" ? "community.roleManager" : "community.roleCoach")}</span>
          ) : comment.user_id ? (
            <span style={{
              fontSize: 9,
              padding: "1px 4px",
              borderRadius: 3,
              background: "rgba(16, 185, 129, 0.1)",
              color: "#10b981",
              fontWeight: 700,
            }}>{t("community.member")}</span>
          ) : (
            <span style={{
              fontSize: 9,
              padding: "1px 4px",
              borderRadius: 3,
              background: "rgba(107, 114, 128, 0.1)",
              color: "#6b7280",
              fontWeight: 600,
            }}>{t("community.anon")}</span>
          )}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--b-fg-3)" }} title={formatDate(comment.created_at)}>
            {formatRelativeTime(comment.created_at)}
          </span>
          {/* 본인(회원) 댓글만 수정 가능. 게스트·운영자(Aria) 제외. */}
          {user && comment.user_id === user.id && !comment.is_agent && editingCommentId !== comment.id && (
            <button
              onClick={() => startEditComment(comment)}
              style={{ border: "none", background: "none", color: "var(--b-fg-3)", cursor: "pointer", padding: 2, display: "flex" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--b-sig)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--b-fg-3)")}
              title={t("community.commentEditTitle")}
            >
              <Icon name="edit" size={13} />
            </button>
          )}
          {/* 운영자(Aria) 공식 답변은 일반 사용자가 삭제할 수 없다(어드민 대시보드에서만 관리). */}
          {!comment.is_agent && (
            <button
              onClick={() => handleCommentDeleteClick(comment)}
              style={{
                border: "none",
                background: "none",
                color: "var(--b-fg-3)",
                cursor: "pointer",
                padding: 2,
                display: "flex",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--b-fg-3)")}
              title={t("community.commentDeleteTitle")}
            >
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      </div>
      {/* Comment Content (수정 모드면 인라인 편집) */}
      {editingCommentId === comment.id ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            value={editingContent}
            onChange={(e) => setEditingContent(e.target.value)}
            disabled={editSubmitting}
            rows={2}
            autoFocus
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--b-sig)", background: "rgba(255,255,255,0.9)", fontSize: 14, outline: "none", resize: "none", lineHeight: 1.5, fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={editSubmitting} onClick={() => saveEditComment(comment)} className="b-btn b-btn-primary" style={{ padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {editSubmitting ? t("community.commentSubmitting") : t("community.commentEditSave")}
            </button>
            <button type="button" onClick={cancelEditComment} style={{ padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid var(--b-line)", background: "none", color: "var(--b-fg-2)" }}>
              {t("community.cancelReply")}
            </button>
          </div>
        </div>
      ) : comment.is_agent ? (
        <p
          style={{ fontSize: 14, color: "var(--b-fg-1)", margin: 0, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: formatAgentContent(comment.content) }}
        />
      ) : (
        <p style={{ fontSize: 14, color: "var(--b-fg-1)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {comment.content}
        </p>
      )}
      {/* 유튜브식 액션바: 추천 + 답글 (수정 중엔 숨김) */}
      {editingCommentId !== comment.id && (
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
        {(() => {
          const cLiked = isCommentLiked(comment);
          return (
            <button
              type="button"
              onClick={() => handleLikeComment(comment)}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999, border: "none", background: cLiked ? "var(--b-sig-soft)" : "none", color: cLiked ? "var(--b-sig)" : "var(--b-fg-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = cLiked ? "var(--b-sig-soft)" : "var(--b-line)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = cLiked ? "var(--b-sig-soft)" : "none")}
              title={cLiked ? t("community.likeToggleOff") : t("community.likeToggleOn")}
            >
              <Icon name="thumb-up" size={15} stroke={2} style={{ animation: cLiked ? "b-like-pop 0.3s ease" : undefined }} />
              <span>{comment.likes || 0}</span>
            </button>
          );
        })()}
        {/* 답글은 1단계만 — 답글(parent_comment_id 있음)엔 답글 버튼을 숨겨 같은 계위에 달리는 혼동을 막는다 */}
        {!comment.parent_comment_id && (
          <button
            type="button"
            onClick={() => startReply(comment)}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999, border: "none", background: "none", color: "var(--b-fg-2)", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--b-line)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            title={t("community.reply")}
          >
            <Icon name="message" size={14} />
          </button>
        )}
      </div>
      )}
    </div>
  );

  // 댓글/답글 입력 폼 (하단 새 댓글 + 인라인 답글 공용). inline=true면 답글 모드 스타일.
  const renderCommentForm = (inline = false) => (
    <form
      onSubmit={handleCreateComment}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderTop: inline ? "none" : "1px solid var(--b-line)",
        paddingTop: inline ? 0 : 20,
        marginTop: inline ? 0 : 8,
      }}
    >
      {/* 답글 대상 배너 */}
      {replyTo && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderRadius: 10, background: "var(--b-sig-soft)", border: "1px solid var(--b-sig)", fontSize: 12, color: "var(--b-fg-2)" }}>
          <span>↳ {t("community.replyingTo", { name: replyTo.author })}</span>
          <button type="button" onClick={() => setReplyTo(null)} style={{ border: "none", background: "none", color: "var(--b-sig)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}>
            {t("community.cancelReply")}
          </button>
        </div>
      )}
      {/* Input Fields Row */}
      <div style={{ display: "grid", gridTemplateColumns: user ? "1fr" : "1fr 1fr", gap: 12 }}>
        <input
          type="text"
          required
          placeholder={t("community.nickname")}
          value={commentAuthor}
          onChange={(e) => setCommentAuthor(e.target.value)}
          disabled={commentSubmitting}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid var(--b-line)",
            background: "rgba(255, 255, 255, 0.8)",
            fontSize: 13,
            outline: "none",
          }}
        />
        {!user && (
          <input
            type="password"
            required
            placeholder={t("community.commentPasswordPlaceholder")}
            value={commentPassword}
            onChange={(e) => setCommentPassword(e.target.value)}
            disabled={commentSubmitting}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--b-line)",
              background: "rgba(255, 255, 255, 0.8)",
              fontSize: 13,
              outline: "none",
            }}
          />
        )}
      </div>

      {/* Content and Submit Row */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <textarea
          ref={commentInputRef}
          required
          rows={2}
          placeholder={replyTo ? t("community.replyPlaceholder", { name: replyTo.author }) : user ? t("community.commentPlaceholderMember") : t("community.commentPlaceholderGuest")}
          value={commentContent}
          onChange={(e) => setCommentContent(e.target.value)}
          disabled={commentSubmitting}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid var(--b-line)",
            background: "rgba(255, 255, 255, 0.8)",
            fontSize: 13,
            outline: "none",
            resize: "none",
            lineHeight: 1.4,
          }}
        />
        <button
          type="submit"
          disabled={commentSubmitting}
          className="b-btn b-btn-primary"
          style={{
            height: 42,
            padding: "0 20px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: commentSubmitting ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {commentSubmitting ? t("community.commentSubmitting") : inline ? t("community.reply") : t("community.commentSubmit")}
        </button>
      </div>
    </form>
  );

  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav active="community" />

      {/* 프로필 사진 확대 라이트박스 (클릭 시 닫힘) */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0, 0, 0, 0.82)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out", padding: 24,
          }}
        >
          <img
            src={zoomedImage}
            alt="프로필 확대"
            style={{ maxWidth: "min(90vw, 480px)", maxHeight: "85vh", borderRadius: 16, objectFit: "contain", boxShadow: "0 12px 48px rgba(0,0,0,0.5)" }}
          />
        </div>
      )}

      {/* 경량 토스트 — alert 대체 */}
      {toast && (
        <div
          onClick={() => setToast(null)}
          style={{
            position: "fixed", left: "50%", bottom: 32, transform: "translateX(-50%)",
            zIndex: 10000, maxWidth: "90vw",
            padding: "12px 20px", borderRadius: 12,
            background: toast.type === "success" ? "var(--b-sig)" : "#dc2626",
            color: "#fff", fontSize: 13, fontWeight: 600,
            boxShadow: "0 8px 28px rgba(0,0,0,0.22)", cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 8,
            animation: "b-fade-in 0.2s ease",
          }}
        >
          <Icon name={toast.type === "success" ? "check" : "info"} size={16} />
          {toast.msg}
        </div>
      )}

      {/* 작성자 활동 모달 — 회원 이름 클릭 시 그 회원의 글/댓글 모아보기 */}
      {authorModal && (
        <div
          onClick={() => setAuthorModal(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0, 0, 0, 0.35)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 520, maxHeight: "82vh",
              background: "#ffffff", borderRadius: 18,
              border: "1px solid var(--b-line)", boxShadow: "0 10px 40px rgba(0,0,0,0.14)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--b-line)" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--b-fg-1)" }}>
                {t("community.authorActivityTitle", { name: authorModal.name })}
              </span>
              <button
                type="button"
                autoFocus
                aria-label={t("community.cancelReply")}
                onClick={() => setAuthorModal(null)}
                style={{ border: "none", background: "none", color: "var(--b-fg-3)", cursor: "pointer", padding: 4, display: "flex" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--b-fg-1)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--b-fg-3)")}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "16px 22px 22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
              {authorLoading ? (
                <div style={{ fontSize: 13, color: "var(--b-fg-3)", padding: "20px 0", textAlign: "center" }}>
                  {t("community.authorLoading")}
                </div>
              ) : authorPosts.length === 0 && authorComments.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--b-fg-3)", padding: "20px 0", textAlign: "center" }}>
                  {t("community.authorEmpty")}
                </div>
              ) : (
                <>
                  {/* 작성 글 */}
                  {authorPosts.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--b-fg-3)", letterSpacing: "0.04em" }}>
                        {t("community.authorPostsHeading", { count: authorPosts.length })}
                      </div>
                      {authorPosts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => goToThreadFromModal(p)}
                          style={{ textAlign: "left", border: "1px solid var(--b-line)", background: "rgba(255,255,255,0.6)", borderRadius: 12, padding: "10px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4, transition: "all 0.15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--b-sig)"; e.currentTarget.style.background = "var(--b-sig-soft)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--b-line)"; e.currentTarget.style.background = "rgba(255,255,255,0.6)"; }}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 5, background: "var(--b-line)", color: "var(--b-fg-2)" }}>{categoryLabel(p.category)}</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--b-fg-1)" }}>{p.title}</span>
                          </span>
                          <span style={{ fontSize: 11, color: "var(--b-fg-3)" }} title={formatDate(p.created_at)}>{formatRelativeTime(p.created_at)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 작성 댓글 */}
                  {authorComments.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--b-fg-3)", letterSpacing: "0.04em" }}>
                        {t("community.authorCommentsHeading", { count: authorComments.length })}
                      </div>
                      {authorComments.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={!c.posts}
                          onClick={() => goToCommentFromModal(c)}
                          style={{ textAlign: "left", border: "1px solid var(--b-line)", background: "rgba(255,255,255,0.6)", borderRadius: 12, padding: "10px 14px", cursor: c.posts ? "pointer" : "default", display: "flex", flexDirection: "column", gap: 4, transition: "all 0.15s", opacity: c.posts ? 1 : 0.6 }}
                          onMouseEnter={(e) => { if (c.posts) { e.currentTarget.style.borderColor = "var(--b-sig)"; e.currentTarget.style.background = "var(--b-sig-soft)"; } }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--b-line)"; e.currentTarget.style.background = "rgba(255,255,255,0.6)"; }}
                        >
                          <span style={{ fontSize: 13, color: "var(--b-fg-1)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.content}</span>
                          <span style={{ fontSize: 11, color: "var(--b-fg-3)" }}>
                            {c.posts ? t("community.onPost", { title: c.posts.title }) : ""} · {formatRelativeTime(c.created_at)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "70px 24px 80px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--b-sig)",
            letterSpacing: "0.1em",
            marginBottom: 10,
            textAlign: "center",
          }}
        >
          COMMUNITY BOARD
        </div>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "-0.028em",
            margin: 0,
            marginBottom: 12,
            lineHeight: 1.15,
            textAlign: "center",
          }}
        >
          {view === "list" && t("community.listTitle")}
          {view === "write" && t("community.writeTitle")}
          {view === "detail" && activePost?.title}
        </h1>
        <p
          style={{
            fontSize: 15,
            color: "var(--b-fg-2)",
            lineHeight: 1.6,
            marginBottom: 36,
            textAlign: "center",
            maxWidth: 520,
            marginInline: "auto",
          }}
        >
          {view === "list" && t("community.listSubtitle")}
          {view === "write" && t("community.writeSubtitle")}
          {view === "detail" &&
            t("community.detailMeta", {
              author: activePost?.author_name,
              date: formatDate(activePost?.created_at || ""),
            })}
        </p>

        {/* ───────── VIEW 1: BOARD LIST ───────── */}
        {view === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            
            {/* Category Pills (Disquiet Style) */}
            <div
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 4,
                msOverflowStyle: "none",
                scrollbarWidth: "none",
              }}
            >
              {[
                { value: COMMUNITY_ALL_CATEGORY, key: "community.cat.all" },
                ...COMMUNITY_CATEGORIES,
              ].map(({ value: cat, key }) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    border: "1px solid",
                    borderColor: activeCategory === cat ? "var(--b-sig)" : "var(--b-line)",
                    background: activeCategory === cat ? "var(--b-sig)" : "rgba(255, 255, 255, 0.5)",
                    color: activeCategory === cat ? "#ffffff" : "var(--b-fg-2)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s ease",
                    boxShadow: activeCategory === cat ? "0 4px 12px var(--b-sig-soft)" : "none",
                  }}
                >
                  {t(key)}
                </button>
              ))}
            </div>

            {/* Filter & Action Panel */}
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderRadius: 16,
                background: "rgba(255, 255, 255, 0.45)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                boxShadow: "0 4px 20px 0 rgba(0, 0, 0, 0.02)",
              }}
            >
              {/* Search & Sort */}
              <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 260 }}>
                {/* Search */}
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder={t("community.searchPlaceholder")}
                    style={{
                      width: "100%",
                      padding: "9px 16px 9px 36px",
                      borderRadius: 10,
                      border: "1px solid var(--b-line)",
                      background: "rgba(255, 255, 255, 0.8)",
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s ease",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--b-fg-3)",
                      display: "flex",
                    }}
                  >
                    <Icon name="eye" size={14} />
                  </div>
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setTimeout(() => fetchPosts(), 0);
                      }}
                      style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        border: "none",
                        background: "none",
                        color: "var(--b-fg-3)",
                        cursor: "pointer",
                        display: "flex",
                      }}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>

                {/* Sort dropdown */}
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  style={{
                    padding: "0 14px",
                    height: 38,
                    borderRadius: 10,
                    border: "1px solid var(--b-line)",
                    background: "rgba(255, 255, 255, 0.8)",
                    fontSize: 13,
                    fontWeight: 600,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="recent">{t("community.sortRecent")}</option>
                  <option value="likes">{t("community.sortLikes")}</option>
                </select>
              </div>

              {/* Write Trigger */}
              <button
                onClick={() => setView("write")}
                className="b-btn b-btn-primary"
                style={{
                  height: 38,
                  fontSize: 13,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 16px",
                  borderRadius: 10,
                  boxShadow: "0 4px 12px var(--b-sig-soft)",
                }}
              >
                <Icon name="plus" size={14} />
                <span>{t("community.writeCta")}</span>
              </button>
            </div>

            {/* Posts Cards Grid */}
            {loading ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 0",
                  color: "var(--b-fg-3)",
                  fontSize: 15,
                }}
              >
                {t("community.loading")}
              </div>
            ) : posts.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "80px 24px",
                  background: "rgba(255, 255, 255, 0.25)",
                  borderRadius: 20,
                  border: "1px solid var(--b-line)",
                  color: "var(--b-fg-3)",
                }}
              >
                <div style={{ marginBottom: 12 }}>
                  <Icon name="info" size={32} style={{ opacity: 0.6 }} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--b-fg-1)" }}>
                  {t("community.emptyTitle")}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {t("community.emptyDesc")}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {posts.map((post) => {
                  const isLiked = isPostLiked(post);
                  return (
                    <div
                      key={post.id}
                      onClick={() => openPost(post)}
                      style={{
                        padding: "20px 24px",
                        borderRadius: 18,
                        background: "rgba(255, 255, 255, 0.45)",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        border: "1px solid rgba(255, 255, 255, 0.3)",
                        boxShadow: "0 4px 24px 0 rgba(0, 0, 0, 0.03)",
                        cursor: "pointer",
                        display: "flex",
                        gap: 20,
                        alignItems: "center",
                        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                        position: "relative",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.borderColor = "var(--b-sig-soft)";
                        e.currentTarget.style.boxShadow = "0 8px 30px 0 rgba(0,0,0,0.06)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                        e.currentTarget.style.boxShadow = "0 4px 24px 0 rgba(0, 0, 0, 0.03)";
                      }}
                    >
                      {/* Content Area */}
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* Header & Meta */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 6,
                                background: "var(--b-line)",
                                color: "var(--b-fg-2)",
                              }}
                            >
                              {categoryLabel(post.category)}
                            </span>
                            <a
                              href={communityPostHref(post.id)}
                              onClick={(e) => {
                                // cmd/ctrl/미들클릭은 새 탭 — 기본동작 보존.
                                if (e.metaKey || e.ctrlKey || e.button === 1) return;
                                e.preventDefault();
                                e.stopPropagation();
                                openPost(post);
                              }}
                              style={{ textDecoration: "none", color: "inherit" }}
                            >
                              <h3
                                style={{
                                  fontSize: 17,
                                  fontWeight: 700,
                                  color: "var(--b-fg-1)",
                                  margin: 0,
                                  lineHeight: 1.4,
                                }}
                              >
                                {post.title}
                              </h3>
                            </a>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              fontSize: 12,
                              color: "var(--b-fg-3)",
                              flexShrink: 0,
                            }}
                          >
                            <span
                              onClick={(e) => handleLikePost(e, post)}
                              title={isLiked ? t("community.likeToggleOff") : t("community.likeToggleOn")}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "3px 8px",
                                borderRadius: 999,
                                cursor: "pointer",
                                fontWeight: isLiked ? 700 : 400,
                                background: isLiked ? "var(--b-sig-soft)" : "transparent",
                                color: isLiked ? "var(--b-sig)" : "var(--b-fg-3)",
                                transition: "all 0.15s",
                              }}
                              onMouseEnter={(e) => {
                                if (!isLiked) e.currentTarget.style.background = "var(--b-line)";
                              }}
                              onMouseLeave={(e) => {
                                if (!isLiked) e.currentTarget.style.background = "transparent";
                              }}
                            >
                              <Icon name="thumb-up" size={13} stroke={2} style={{ animation: isLiked ? "b-like-pop 0.3s ease" : undefined }} /> {post.likes || 0}
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Icon name="message" size={13} /> {post.comment_count || 0}
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Icon name="eye" size={13} /> {post.views}
                            </span>
                          </div>
                        </div>

                        {/* Excerpt Body */}
                        <p
                          style={{
                            fontSize: 14,
                            color: "var(--b-fg-2)",
                            margin: 0,
                            lineHeight: 1.5,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {post.content}
                        </p>

                        {/* Metadata Footer */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: 12,
                            color: "var(--b-fg-3)",
                            borderTop: "1px solid var(--b-line)",
                            paddingTop: 10,
                            marginTop: 2,
                          }}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {t("community.authorLabel")} <strong style={{ color: "var(--b-fg-2)" }}>{renderAuthorName(post.author_name, post.user_id)}</strong>
                            {post.user_id ? (
                              <span style={{
                                fontSize: 10,
                                padding: "1px 5px",
                                borderRadius: 4,
                                background: "rgba(16, 185, 129, 0.1)",
                                color: "#10b981",
                                fontWeight: 700,
                              }}>👑 {t("community.member")}</span>
                            ) : (
                              <span style={{
                                fontSize: 10,
                                padding: "1px 5px",
                                borderRadius: 4,
                                background: "rgba(107, 114, 128, 0.1)",
                                color: "#6b7280",
                                fontWeight: 600,
                              }}>🌱 {t("community.anon")}</span>
                            )}
                          </span>
                          <span title={formatDate(post.created_at)}>{formatRelativeTime(post.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {/* 더 보기 — 정확히 한 페이지만큼 왔으면 더 있을 수 있음 */}
                {hasMorePosts && (
                  <button
                    type="button"
                    onClick={() => setPostsLimit((l) => l + POSTS_PAGE)}
                    disabled={loading}
                    style={{
                      alignSelf: "center", marginTop: 4, padding: "10px 24px", borderRadius: 999,
                      border: "1px solid var(--b-line)", background: "rgba(255,255,255,0.7)",
                      color: "var(--b-fg-2)", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--b-sig)"; e.currentTarget.style.color = "var(--b-sig)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--b-line)"; e.currentTarget.style.color = "var(--b-fg-2)"; }}
                  >
                    {t("community.loadMore")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ───────── VIEW 2: WRITE FORM ───────── */}
        {view === "write" && (
          <form
            onSubmit={handleCreatePost}
            style={{
              padding: "36px 32px",
              borderRadius: 20,
              background: "rgba(255, 255, 255, 0.45)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.04)",
              display: "flex",
              flexDirection: "column",
              gap: 22,
              animation: "fadeIn 0.3s ease",
            }}
          >
            {errorMsg && (
              <div
                style={{
                  padding: "14px 18px",
                  borderRadius: 10,
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  color: "#b91c1c",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon name="info" size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Category Selector Pill */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--b-fg-2)" }}>
                {t("community.formCategory")} <span style={{ color: "var(--b-sig)" }}>*</span>
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {COMMUNITY_CATEGORIES
                  .filter(({ value }) => isAdmin || value !== COMMUNITY_NOTICE_CATEGORY)
                  .map(({ value: cat, key }) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setWriteCategory(cat)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 12,
                      border: "1px solid",
                      borderColor: writeCategory === cat ? "var(--b-sig)" : "var(--b-line)",
                      background: writeCategory === cat ? "var(--b-sig-soft)" : "rgba(255, 255, 255, 0.8)",
                      color: writeCategory === cat ? "var(--b-sig)" : "var(--b-fg-2)",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>

            {/* Author & Password Fields */}
            <div style={{ display: "grid", gridTemplateColumns: user ? "1fr" : "1fr 1fr", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--b-fg-2)" }}>
                  {t("community.nickname")} <span style={{ color: "var(--b-sig)" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={writeAuthor}
                  onChange={(e) => setWriteAuthor(e.target.value)}
                  placeholder={t("community.nicknamePlaceholder")}
                  disabled={submitting}
                  onFocus={() => setFocusedField("author")}
                  onBlur={() => setFocusedField(null)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: focusedField === "author" ? "1px solid var(--b-sig)" : "1px solid var(--b-line)",
                    boxShadow: focusedField === "author" ? "0 0 0 3px var(--b-sig-soft)" : "none",
                    background: "rgba(255, 255, 255, 0.8)",
                    fontSize: 14,
                    outline: "none",
                    transition: "all 0.2s ease",
                  }}
                />
              </div>

              {!user && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--b-fg-2)" }}>
                    {t("community.formPassword")} <span style={{ color: "var(--b-sig)" }}>*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={writePassword}
                    onChange={(e) => setWritePassword(e.target.value)}
                    placeholder={t("community.formPasswordPlaceholder")}
                    disabled={submitting}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    style={{
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: focusedField === "password" ? "1px solid var(--b-sig)" : "1px solid var(--b-line)",
                      boxShadow: focusedField === "password" ? "0 0 0 3px var(--b-sig-soft)" : "none",
                      background: "rgba(255, 255, 255, 0.8)",
                      fontSize: 14,
                      outline: "none",
                      transition: "all 0.2s ease",
                    }}
                  />
                </div>
              )}
            </div>

            {user && (
              <div style={{ fontSize: 12, color: "var(--b-sig)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="check" size={14} />
                <span>{t("community.memberNotice")}</span>
              </div>
            )}

            {/* Title */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--b-fg-2)" }}>
                {t("community.formTitle")} <span style={{ color: "var(--b-sig)" }}>*</span>
              </label>
              <input
                type="text"
                required
                value={writeTitle}
                onChange={(e) => setWriteTitle(e.target.value)}
                placeholder={t("community.formTitlePlaceholder")}
                disabled={submitting}
                onFocus={() => setFocusedField("title")}
                onBlur={() => setFocusedField(null)}
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: focusedField === "title" ? "1px solid var(--b-sig)" : "1px solid var(--b-line)",
                  boxShadow: focusedField === "title" ? "0 0 0 3px var(--b-sig-soft)" : "none",
                  background: "rgba(255, 255, 255, 0.8)",
                  fontSize: 15,
                  outline: "none",
                  transition: "all 0.2s ease",
                }}
              />
            </div>

            {/* Content */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--b-fg-2)" }}>
                {t("community.formContent")} <span style={{ color: "var(--b-sig)" }}>*</span>
              </label>
              <textarea
                required
                rows={8}
                value={writeContent}
                onChange={(e) => setWriteContent(e.target.value)}
                placeholder={t("community.formContentPlaceholder")}
                disabled={submitting}
                onFocus={() => setFocusedField("content")}
                onBlur={() => setFocusedField(null)}
                style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: focusedField === "content" ? "1px solid var(--b-sig)" : "1px solid var(--b-line)",
                  boxShadow: focusedField === "content" ? "0 0 0 3px var(--b-sig-soft)" : "none",
                  background: "rgba(255, 255, 255, 0.8)",
                  fontSize: 14,
                  outline: "none",
                  resize: "vertical",
                  lineHeight: 1.5,
                  minHeight: 180,
                  transition: "all 0.2s ease",
                }}
              />
            </div>

            {/* Form actions */}
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setView("list");
                  setErrorMsg(null);
                }}
                disabled={submitting}
                className="b-btn b-btn-ghost"
                style={{
                  flex: 1,
                  height: 46,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {t("community.formCancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="b-btn b-btn-primary"
                style={{
                  flex: 1.5,
                  height: 46,
                  fontSize: 14,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.85 : 1,
                }}
              >
                {submitting ? t("community.formSubmitting") : t("community.formSubmit")}
                {!submitting && <Icon name="arrow-r" size={14} />}
              </button>
            </div>
          </form>
        )}

        {/* ───────── VIEW 3: DETAIL VIEW & COMMENTS ───────── */}
        {view === "detail" && activePost && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 0.3s ease" }}>
            {/* Back Button */}
            <button
              onClick={closeDetail}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                color: "var(--b-fg-2)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                padding: "8px 0",
                width: "fit-content",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--b-sig)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--b-fg-2)")}
            >
              <Icon name="chev-l" size={16} />
              <span>{t("community.detailBack")}</span>
            </button>

            {/* Post Main Body Card */}
            <div
              style={{
                padding: "36px 32px",
                borderRadius: 20,
                background: "rgba(255, 255, 255, 0.45)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.04)",
              }}
            >
              {/* Category tag display */}
              <div style={{ marginBottom: 16 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 8,
                    background: "var(--b-sig-soft)",
                    color: "var(--b-sig)",
                  }}
                >
                  {categoryLabel(activePost.category)}
                </span>
              </div>

              {/* Content text */}
              <p
                style={{
                  fontSize: 16,
                  color: "var(--b-fg-1)",
                  lineHeight: 1.7,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  marginBottom: 36,
                }}
              >
                {activePost.content}
              </p>

              {/* Engagement Stats & Deletion Panel */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--b-line)",
                  paddingTop: 20,
                }}
              >
                <div style={{ display: "flex", gap: 10 }}>
                  {/* Like Button */}
                  {(() => {
                    const pLiked = isPostLiked(activePost);
                    return (
                      <button
                        onClick={(e) => handleLikePost(e, activePost)}
                        title={pLiked ? t("community.likeToggleOff") : t("community.likeToggleOn")}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 16px",
                          borderRadius: 12,
                          border: pLiked ? "1px solid var(--b-sig)" : "1px solid var(--b-line)",
                          background: pLiked ? "var(--b-sig-soft)" : "rgba(255, 255, 255, 0.7)",
                          color: pLiked ? "var(--b-sig)" : "var(--b-fg-2)",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "var(--b-sig)";
                          e.currentTarget.style.color = "var(--b-sig)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = pLiked ? "var(--b-sig)" : "var(--b-line)";
                          e.currentTarget.style.color = pLiked ? "var(--b-sig)" : "var(--b-fg-2)";
                        }}
                      >
                        <Icon name="thumb-up" size={14} stroke={2} style={{ animation: pLiked ? "b-like-pop 0.3s ease" : undefined }} />
                        <span>{activePost.likes || 0}</span>
                      </button>
                    );
                  })()}
                </div>

                {/* Delete Trigger */}
                <button
                  onClick={handlePostDeleteClick}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    background: "rgba(239, 68, 68, 0.02)",
                    color: "#dc2626",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)";
                    e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.02)";
                    e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.2)";
                  }}
                >
                  <Icon name="trash" size={13} />
                  <span>{t("community.deletePost")}</span>
                </button>
              </div>
            </div>

            {/* --- Comments Section (Reddit Style Threading) --- */}
            <div
              style={{
                padding: "32px 32px 36px",
                borderRadius: 20,
                background: "rgba(255, 255, 255, 0.25)",
                border: "1px solid var(--b-line)",
                display: "flex",
                flexDirection: "column",
                gap: 24,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--b-fg-1)", margin: 0 }}>
                  {t("community.commentsHeading", { count: comments.length })}
                </h3>
                {/* 정렬 토글: 작성순 / 인기순 */}
                {comments.some((c) => !c.parent_comment_id) && (
                  <div style={{ display: "inline-flex", gap: 2, padding: 2, borderRadius: 999, background: "var(--b-line)" }}>
                    {(["recent", "top"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setCommentSort(s)}
                        style={{
                          border: "none", borderRadius: 999, padding: "5px 12px", cursor: "pointer",
                          fontSize: 12, fontWeight: 700,
                          background: commentSort === s ? "#fff" : "transparent",
                          color: commentSort === s ? "var(--b-sig)" : "var(--b-fg-3)",
                          boxShadow: commentSort === s ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                          transition: "all 0.15s",
                        }}
                      >
                        {t(s === "recent" ? "community.sortRecent" : "community.sortTop")}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Comments List */}
              {commentsLoading ? (
                <div style={{ fontSize: 13, color: "var(--b-fg-3)" }}>{t("community.commentsLoading")}</div>
              ) : comments.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--b-fg-3)", padding: "8px 0" }}>
                  {t("community.commentsEmpty")}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {comments
                    .filter((c) => !c.parent_comment_id)
                    .sort((a, b) =>
                      commentSort === "top"
                        ? (b.likes || 0) - (a.likes || 0) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                        : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    )
                    .map((top) => {
                    const replies = comments
                      .filter((c) => c.parent_comment_id === top.id)
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                    const replyingHere = replyTo?.parentId === top.id;
                    // 기본은 접힘. 토글로 펼치거나, 이 스레드에 답글 작성 중이면 펼친다.
                    const expanded = expandedThreads.has(top.id) || replyingHere;
                    return (
                      <div key={top.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {renderCommentNode(top)}
                        {/* 유튜브식 "답글 N개" 토글 — 답글이 있을 때만 */}
                        {replies.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleThread(top.id)}
                            style={{
                              alignSelf: "flex-start",
                              marginLeft: 18,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 10px",
                              borderRadius: 999,
                              border: "none",
                              background: "none",
                              color: "var(--b-sig)",
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: "pointer",
                              transition: "background 0.15s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--b-sig-soft)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                          >
                            <Icon name={expanded ? "chev-u" : "chev-d"} size={15} stroke={2.4} />
                            {expanded ? t("community.hideReplies") : t("community.viewReplies", { count: replies.length })}
                          </button>
                        )}
                        {/* 답글 그룹: 연속된 쓰레드 연결선 + 들여쓰기 (펼쳤을 때만) */}
                        {expanded && (replies.length > 0 || replyingHere) && (
                          <div
                            style={{
                              marginLeft: 18,
                              paddingLeft: 20,
                              borderLeft: "2px solid var(--b-line)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 12,
                            }}
                          >
                            {replies.map((r) => renderCommentNode(r))}
                            {/* 답글 입력창은 해당 스레드 바로 아래(들여쓰기 안)에 인라인으로 */}
                            {replyingHere && renderCommentForm(true)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 새 댓글 작성: 답글 모드가 아닐 때만 하단 폼(답글은 해당 스레드 아래 인라인) */}
              {!replyTo && renderCommentForm(false)}
            </div>
          </div>
        )}

        {/* ───────── VERIFICATION MODAL ───────── */}
        {passwordModal.isOpen && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.35)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              animation: "fadeIn 0.2s ease",
            }}
          >
            <form
              onSubmit={handleDeleteSubmit}
              style={{
                width: "100%",
                maxWidth: 360,
                padding: "28px 24px",
                borderRadius: 18,
                background: "#ffffff",
                boxShadow: "0 10px 40px rgba(0, 0, 0, 0.12)",
                border: "1px solid var(--b-line)",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h4 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--b-fg-1)" }}>
                  {t("community.verifyTitle")}
                </h4>
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "var(--b-fg-3)", display: "flex" }}
                >
                  <Icon name="x" size={16} />
                </button>
              </div>

              <p style={{ fontSize: 13, color: "var(--b-fg-3)", margin: 0, lineHeight: 1.5 }}>
                {passwordModal.type === "post_delete"
                  ? t("community.verifyDescPost")
                  : t("community.verifyDescComment")}
              </p>

              <input
                type="password"
                required
                autoFocus
                placeholder={t("community.verifyPlaceholder")}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--b-line)",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

              {passwordModal.error && (
                <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
                  {passwordModal.error}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 8,
                    border: "1px solid var(--b-line)",
                    background: "none",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("community.modalCancel")}
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1.2,
                    height: 38,
                    borderRadius: 8,
                    border: "none",
                    background: "#dc2626",
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("community.verifySubmit")}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ───────── SUB-CARDS (EMAIL COPY & INFO) ───────── */}
        {view === "list" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 40, marginBottom: 20 }}>
            <div
              style={{
                padding: 22,
                borderRadius: 14,
                background: "rgba(255, 255, 255, 0.35)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid var(--b-line)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  {t("community.mailTitle")}
                </div>
                <p style={{ fontSize: 12, color: "var(--b-fg-3)", margin: 0, marginBottom: 14, lineHeight: 1.5 }}>
                  {t("community.mailDesc")}
                </p>
              </div>
              <button
                type="button"
                onClick={handleContactClick}
                className="b-btn b-btn-ghost"
                style={{ fontSize: 12, height: 36, padding: "0 14px", display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 6 }}
              >
                <span>{t("community.mailCopy")}</span> <Icon name="sparkle" size={10} />
              </button>
            </div>

            <div
              style={{
                padding: 22,
                borderRadius: 14,
                background: "rgba(255, 255, 255, 0.35)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                border: "1px solid var(--b-line)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  {t("community.guideTitle")}
                </div>
                <p style={{ fontSize: 12, color: "var(--b-fg-3)", margin: 0, marginBottom: 14, lineHeight: 1.5 }}>
                  {t("community.guideDesc")}
                </p>
              </div>
              <div
                style={{ fontSize: 12, fontWeight: 600, color: "var(--b-sig-deep)", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Icon name="info" size={12} /> <span>{t("community.monitoring")}</span>
              </div>
            </div>
          </div>
        )}

        {/* Operating Corporate Info */}
        <div
          style={{
            padding: 24,
            borderRadius: 14,
            background: "rgba(0, 0, 0, 0.015)",
            border: "1px solid var(--b-line)",
            marginTop: 20,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--b-fg-3)",
              letterSpacing: "0.08em",
              marginBottom: 12,
            }}
          >
            {t("community.corp.name")}
          </div>
          <div style={{ fontSize: 12, color: "var(--b-fg-2)", lineHeight: 1.8 }}>
            <div>{t("community.corp.line1")}</div>
            <div>{t("community.corp.line2")}</div>
            <div>{t("community.corp.line3")}</div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ───────── Login / Signup ─────────

function Login({ mode = "signin" }: { mode?: "signin" | "signup" }) {
  const { t } = useTranslation("marketing");
  const subSlogan =
    i18n.language === "ko" ? pickSubSlogan() : t("landing.hero.sub");
  const {
    signInWithGoogle,
    signInWithApple,
    signInWithKakao,
    signInWithPassword,
    signUpWithPassword,
    configured,
    user,
    loading
  } = useAuth();
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // 이메일/비밀번호 폼 상태
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  // 회원가입 후 확인 메일 발송 안내 패널 표시
  const [signupSent, setSignupSent] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const redirectTo = localStorage.getItem("barosit:auth_redirect");
      localStorage.removeItem("barosit:auth_redirect");
      // 저장된 값이 *내부 hash 패턴* 일 때만 적용 (XSS 심층 방어).
      if (isSafeRedirectHash(redirectTo)) {
        window.location.replace(redirectTo);
      } else {
        // 웹에서 로그인하면 마케팅 홈(랜딩)으로 복귀. 빈 해시(barosit.com 맨
        // 주소)에서 로그인 시 직전 hash 가 저장되지 않아 예전엔 #/app(실루엣
        // 감지 페이지)로 튕기던 문제 해결.
        window.location.replace("#/landing");
      }
    }
  }, [loading, user]);

  const handleOAuth = async (provider: "google" | "apple" | "kakao", signInFn: () => Promise<void>) => {
    setOauthError(null);
    if (!configured) {
      setOauthError(t("loginPage.errNotConnected"));
      return;
    }
    setOauthBusy(provider);
    try {
      await signInFn();
    } catch (e) {
      setOauthBusy(null);
      const provName = {
        google: "Google",
        apple: "Apple",
        kakao: t("loginPage.providerKakao"),
      }[provider];
      setOauthError(e instanceof Error ? e.message : t("loginPage.errProviderFail", { provider: provName }));
    }
  };

  // 이메일 폼 제출 — signup 모드면 회원가입(확인 메일), signin 모드면 로그인.
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    if (mode === "signup" && password.length < 8) {
      setEmailError(t("loginPage.emailPwTooShort"));
      return;
    }
    setEmailLoading(true);
    try {
      if (mode === "signup") {
        const res = await signUpWithPassword(email, password);
        if (res.alreadyRegistered) {
          setEmailError(t("loginPage.emailAlready"));
          setEmailLoading(false);
          return;
        }
        if (res.needsEmailConfirmation) {
          setSignupSent(true);
          setEmailLoading(false);
          return;
        }
        // 확인 토글 OFF → 즉시 세션 생성, 위 user effect 가 redirect 처리.
      } else {
        await signInWithPassword(email, password);
      }
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : t("loginPage.emailGenericErr"));
      setEmailLoading(false);
    }
  };

  const handleGoogle = () => handleOAuth("google", signInWithGoogle);
  const handleApple = () => handleOAuth("apple", signInWithApple);
  const handleKakao = () => handleOAuth("kakao", signInWithKakao);

  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh", display: "flex" }}>
      <div
        style={{
          flex: 1,
          padding: "60px 56px",
          background: "var(--b-sig-bg)",
          borderRight: "1px solid var(--b-line)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <a
          href="#/landing"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <Logo size={32} stroke="var(--b-sig)" />
          <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.04em" }}>
            barosit
          </span>
        </a>
        <div>
          <h1
            style={{
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: "-0.032em",
              lineHeight: 1.15,
              marginBottom: 12,
            }}
          >
            {t("landing.hero.title1")}
            <br />
            <span style={{ color: "var(--b-sig-deep)" }}>{t("landing.hero.title2")}</span>
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "var(--b-fg-1)",
              fontWeight: 600,
              lineHeight: 1.45,
              maxWidth: 380,
              marginBottom: 10,
              letterSpacing: "-0.01em",
            }}
          >
            {subSlogan}
          </p>
          <p
            style={{
              fontSize: 14,
              color: "var(--b-fg-2)",
              lineHeight: 1.55,
              maxWidth: 380,
            }}
          >
            {t("loginPage.heroSub1")}
            <br />
            {t("loginPage.heroSub2")}
          </p>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--b-fg-4)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="shield" size={12} /> {t("loginPage.privacyNote")}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          padding: "60px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div style={{ maxWidth: 380, width: "100%", margin: "0 auto" }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.022em",
              marginBottom: 6,
            }}
          >
            {mode === "signin" ? t("loginPage.welcomeBack") : t("loginPage.welcomeNew")}
          </h2>
          <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 28 }}>
            {mode === "signin" ? t("loginPage.subSignin") : t("loginPage.subSignup")}
          </p>

          {/* 메인 소셜 로그인 세트 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {/* Google */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={oauthBusy !== null}
              className="b-btn"
              style={{
                height: 46,
                borderRadius: 24,
                border: "1px solid var(--b-line)",
                background: "#ffffff",
                color: "var(--b-fg-1)",
                fontWeight: 600,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: oauthBusy ? "wait" : "pointer",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                transform: oauthBusy === "google" ? "scale(0.98)" : "none",
                opacity: oauthBusy && oauthBusy !== "google" ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.06)";
                }
              }}
              onMouseLeave={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.02)";
                }
              }}
            >
              <svg
                aria-hidden
                width="16"
                height="16"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0 }}
              >
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.72.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {oauthBusy === "google" ? t("loginPage.googleGoing") : t("loginPage.googleContinue")}
            </button>

            {/* Apple */}
            <button
              type="button"
              onClick={handleApple}
              disabled={oauthBusy !== null}
              className="b-btn"
              style={{
                height: 46,
                borderRadius: 24,
                border: "none",
                background: "#000000",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: oauthBusy ? "wait" : "pointer",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                transform: oauthBusy === "apple" ? "scale(0.98)" : "none",
                opacity: oauthBusy && oauthBusy !== "apple" ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.25)";
                }
              }}
              onMouseLeave={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)";
                }
              }}
            >
              <svg
                aria-hidden
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="#ffffff"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0 }}
              >
                <path d="M17.05 12.04c-.03-2.85 2.33-4.21 2.43-4.28-1.32-1.94-3.38-2.2-4.11-2.23-1.75-.18-3.41 1.03-4.3 1.03-.88 0-2.25-1.01-3.7-.98-1.9.03-3.66 1.1-4.64 2.8-1.98 3.43-.51 8.51 1.42 11.3.94 1.36 2.06 2.89 3.53 2.83 1.42-.06 1.95-.91 3.66-.91 1.71 0 2.19.91 3.69.88 1.52-.03 2.49-1.39 3.42-2.76 1.08-1.58 1.53-3.11 1.55-3.19-.03-.01-2.98-1.14-3.01-4.53zM14.28 4.16c.78-.95 1.31-2.27 1.16-3.58-1.13.05-2.49.75-3.3 1.7-.72.83-1.36 2.17-1.19 3.45 1.26.1 2.55-.64 3.33-1.57z" />
              </svg>
              {oauthBusy === "apple" ? t("loginPage.appleGoing") : t("loginPage.appleContinue")}
            </button>

            {/* Kakao */}
            <button
              type="button"
              onClick={handleKakao}
              disabled={oauthBusy !== null}
              className="b-btn"
              style={{
                height: 46,
                borderRadius: 24,
                border: "none",
                background: "#fee500",
                color: "#191919",
                fontWeight: 600,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: oauthBusy ? "wait" : "pointer",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 2px 8px rgba(254, 229, 0, 0.15)",
                transform: oauthBusy === "kakao" ? "scale(0.98)" : "none",
                opacity: oauthBusy && oauthBusy !== "kakao" ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 14px rgba(254, 229, 0, 0.3)";
                }
              }}
              onMouseLeave={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(254, 229, 0, 0.15)";
                }
              }}
            >
              <svg
                aria-hidden
                width="16"
                height="16"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0 }}
              >
                <path
                  fill="#191919"
                  d="M12 3C6.48 3 2 6.48 2 10.8c0 2.75 1.85 5.16 4.63 6.55l-1.18 4.34c-.05.19.05.39.23.47.06.03.13.04.2.04.13 0 .26-.05.36-.13l5.07-3.36c.23.02.46.04.69.04 5.52 0 10-3.48 10-7.8S17.52 3 12 3z"
                />
              </svg>
              {oauthBusy === "kakao" ? t("loginPage.kakaoGoing") : t("loginPage.kakaoContinue")}
            </button>
          </div>

          {oauthError && (
            <div
              role="alert"
              style={{
                marginBottom: 18,
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                color: "#dc2626",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {oauthError}
            </div>
          )}

          {/* 구분선 — 또는 이메일로 */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "2px 0 18px" }}>
            <div style={{ flex: 1, height: 1, background: "var(--b-line)" }} />
            <span style={{ fontSize: 11, color: "var(--b-fg-4)" }}>{t("loginPage.orEmail")}</span>
            <div style={{ flex: 1, height: 1, background: "var(--b-line)" }} />
          </div>

          {signupSent ? (
            <div
              role="status"
              style={{
                padding: 18,
                background: "var(--b-surface)",
                border: "1px solid var(--b-line)",
                borderRadius: 12,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
                {t("loginPage.checkEmailTitle")}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--b-fg-3)", lineHeight: 1.6 }}>
                {t("loginPage.checkEmailDesc", { email })}
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleEmailSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}
            >
              <input
                type="email"
                autoComplete="email"
                placeholder={t("loginPage.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  height: 44,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid var(--b-line)",
                  background: "var(--b-bg)",
                  color: "var(--b-fg-1)",
                  fontSize: 14,
                }}
              />
              <input
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? t("loginPage.pwPlaceholderNew") : t("loginPage.pwPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "signup" ? 8 : undefined}
                style={{
                  height: 44,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid var(--b-line)",
                  background: "var(--b-bg)",
                  color: "var(--b-fg-1)",
                  fontSize: 14,
                }}
              />
              {emailError && (
                <div role="alert" style={{ color: "#dc2626", fontSize: 12, lineHeight: 1.5 }}>
                  {emailError}
                </div>
              )}
              <button
                type="submit"
                disabled={emailLoading}
                className="b-btn b-btn-primary"
                style={{
                  height: 46,
                  borderRadius: 24,
                  fontSize: 14,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: emailLoading ? "wait" : "pointer",
                }}
              >
                {emailLoading
                  ? (mode === "signup" ? t("loginPage.signupGoing") : t("loginPage.signinGoing"))
                  : (mode === "signup" ? t("loginPage.signupSubmit") : t("loginPage.signinSubmit"))}
              </button>
              {mode === "signin" && (
                <a
                  href="#/forgot-password"
                  style={{
                    fontSize: 12,
                    color: "var(--b-fg-3)",
                    textAlign: "center",
                    textDecoration: "none",
                    marginTop: 4,
                  }}
                >
                  {t("loginPage.forgotPw")}
                </a>
              )}
            </form>
          )}

          <p
            style={{
              fontSize: 11,
              color: "var(--b-fg-4)",
              lineHeight: 1.55,
              textAlign: "center",
              marginTop: 12,
              marginBottom: 0,
            }}
          >
            {t("loginPage.agreePrefix")}
            <a
              href="#/terms"
              style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}
            >
              {t("legalTitle.terms")}
            </a>
            {t("loginPage.agreeMid")}
            <a
              href="#/privacy"
              style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}
            >
              {t("legalTitle.privacy")}
            </a>
            {t("loginPage.agreeSuffix")}
          </p>

          <div
            style={{
              fontSize: 13,
              color: "var(--b-fg-3)",
              textAlign: "center",
              marginTop: 18,
            }}
          >
            {mode === "signin" ? (
              <>
                {t("loginPage.newHere")}
                <a
                  href="#/signup"
                  style={{ color: "var(--b-sig)", fontWeight: 600, textDecoration: "none" }}
                >
                  {t("loginPage.signup")}
                </a>
              </>
            ) : (
              <>
                {t("loginPage.haveAccount")}
                <a
                  href="#/login"
                  onClick={navigateToLogin}
                  style={{ color: "var(--b-sig)", fontWeight: 600, textDecoration: "none" }}
                >
                  {t("loginPage.signin")}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────── Download ─────────

function Download({ os = "mac" }: { os?: "mac" | "win" }) {
  const { t } = useTranslation("marketing");
  const { user } = useAuth();
  const [userPlan, setUserPlan] = useState<"free" | "pro">("free");

  useEffect(() => {
    const checkPlan = async () => {
      const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
      if (localPlan) {
        setUserPlan(localPlan);
      }
      if (user) {
        try {
          const { data } = await supabase
            .from("user_subscriptions")
            .select("plan_id, status, current_period_end")
            .eq("user_id", user.id)
            .maybeSingle();
          if (data) {
            setUserPlan(resolveEffectivePlan(data));
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    checkPlan();
  }, [user]);

  const currentVer = import.meta.env.PACKAGE_VERSION || "0.1.8";
  const m =
    os === "mac"
      ? {
          name: "macOS",
          file: `BaroSit_${currentVer}_universal.dmg`,
          size: "38 MB",
          req: t("downloadPage.macReq"),
          other: "Windows",
          otherUrl: "#/download/win",
          installSecond: t("downloadPage.macInstallSecond"),
        }
      : {
          name: "Windows",
          file: `BaroSit_${currentVer}_x64-setup.exe`,
          size: "42 MB",
          req: t("downloadPage.winReq"),
          other: "macOS",
          otherUrl: "#/download/mac",
          installSecond: t("downloadPage.winInstallSecond"),
        };

  // Windows 는 Microsoft Store 배포 → 로그인/Pro 게이팅 없이 스토어로 (스토어 설치 무료, Pro 는 인앱 Toss)
  const isWin = os === "win";
  const MS_STORE_URL = "https://apps.microsoft.com/detail/9nmg33l2thhh";

  const handleDownloadClick = () => {
    if (isWin) {
      window.location.href = MS_STORE_URL;
      return;
    }
    if (!user) {
      alert(t(isBetaFree() ? "downloadPage.loginNeeded_beta" : "downloadPage.loginNeeded"));
      // 현재 다운로드 페이지를 redirect 로 저장 → 로그인 후 복귀.
      navigateToLogin();
      return;
    }

    if (isBetaFree()) {
      alert(t("downloadPage.proSuccess_beta", { name: m.name, file: m.file }));
      const downloadUrl = `https://github.com/jay365-code/barosit/releases/download/v${currentVer}/${m.file}`;
      window.location.href = downloadUrl;
    } else {
      if (userPlan !== "pro") {
        alert(t("downloadPage.freeUpsell"));
        window.location.hash = "#/pricing";
      } else {
        alert(t("downloadPage.proSuccess", { name: m.name, file: m.file }));
        const downloadUrl = `https://github.com/jay365-code/barosit/releases/download/v${currentVer}/${m.file}`;
        window.location.href = downloadUrl;
      }
    }
  };

  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav active="download" />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "70px 56px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 30 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              background: "var(--b-sig-bg)",
              border: "1px solid var(--b-sig-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Logo size={56} variant="filled" fill="var(--b-sig)" />
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--b-sig)",
                letterSpacing: "0.08em",
                marginBottom: 6,
              }}
            >
              {t("downloadPage.downloadName", { name: m.name.toUpperCase() })}
            </div>
            <h1
              style={{
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: "-0.028em",
                marginBottom: 6,
                lineHeight: 1.15,
              }}
            >
              {t("downloadPage.forName", { name: m.name })}
            </h1>
            <div className="b-num" style={{ fontSize: 13, color: "var(--b-fg-3)" }}>
              {isWin ? t("downloadPage.storeSubtitle") : t("downloadPage.version", { ver: currentVer, size: m.size })}
            </div>
          </div>
        </div>

        {/* OS Segmented Tab Selector */}
        <div
          style={{
            display: "flex",
            background: "var(--b-surface-2, #242629)",
            border: "1px solid var(--b-line, #333)",
            padding: 4,
            borderRadius: 12,
            maxWidth: 240,
            marginBottom: 30,
          }}
        >
          <button
            onClick={() => { window.location.hash = "#/download/mac"; }}
            className="b-btn"
            style={{
              flex: 1,
              height: 34,
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: os === "mac" ? "var(--b-sig, #5b8c7a)" : "transparent",
              color: os === "mac" ? "#fff" : "var(--b-fg-3, #8a8d90)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            macOS
          </button>
          <button
            onClick={() => { window.location.hash = "#/download/win"; }}
            className="b-btn"
            style={{
              flex: 1,
              height: 34,
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: os === "win" ? "var(--b-sig, #5b8c7a)" : "transparent",
              color: os === "win" ? "#fff" : "var(--b-fg-3, #8a8d90)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Windows
          </button>
        </div>

        <button
          onClick={handleDownloadClick}
          className="b-btn b-btn-primary"
          style={{ height: 52, padding: "0 28px", fontSize: 15, marginBottom: 14 }}
        >
          <Icon name="arrow-r" size={15} /> {isWin ? t("downloadPage.getFromStore") : t("downloadPage.downloadFile", { file: m.file })}
        </button>
        <div style={{ fontSize: 12, color: "var(--b-fg-4)", marginBottom: 36 }}>
          {t("downloadPage.agreePrefix")}
          <a style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}>
            {t("legalTitle.terms")}
          </a>
          {t("downloadPage.agreeMid")}
          <a style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}>
            {t("downloadPage.privacyPolicy")}
          </a>
          {t("downloadPage.agreeSuffix")}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            marginBottom: 36,
          }}
        >
          <MiniCard title={t("downloadPage.sysReq")} icon="cpu">
            <div style={{ fontSize: 13, color: "var(--b-fg-2)", lineHeight: 1.7 }}>
              {m.req}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--b-fg-3)",
                marginTop: 8,
                lineHeight: 1.6,
              }}
            >
              {t("downloadPage.camNote")}
            </div>
          </MiniCard>
          <MiniCard title={t("downloadPage.installHow")} icon="info">
            <ol
              style={{
                fontSize: 13,
                color: "var(--b-fg-2)",
                paddingLeft: 18,
                margin: 0,
                lineHeight: 1.8,
              }}
            >
              {isWin ? (
                <>
                  <li>{t("downloadPage.storeStep1")}</li>
                  <li>{t("downloadPage.installStep3")}</li>
                </>
              ) : (
                <>
                  <li>{t("downloadPage.installStep1")}</li>
                  <li>{m.installSecond}</li>
                  <li>{t("downloadPage.installStep3")}</li>
                </>
              )}
            </ol>
          </MiniCard>
        </div>

        <MiniCard title={t("downloadPage.latestBuild", { ver: currentVer })} icon="sparkle">
          <ul
            style={{
              fontSize: 13,
              color: "var(--b-fg-2)",
              paddingLeft: 18,
              margin: 0,
              lineHeight: 1.8,
            }}
          >
            <li>{t("downloadPage.feat1")}</li>
            <li>{t("downloadPage.feat2")}</li>
            <li>{t("downloadPage.feat3")}</li>
            <li>{t("downloadPage.feat4")}</li>
          </ul>
          <a
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginTop: 12,
              fontSize: 12,
              color: "var(--b-sig)",
              fontWeight: 600,
            }}
          >
            {t("downloadPage.releaseNotes")} <Icon name="chev-r" size={11} />
          </a>
        </MiniCard>

        <div
          style={{
            marginTop: 30,
            padding: 24,
            borderRadius: 14,
            background: "var(--b-surface-2)",
            border: "1px solid var(--b-line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
              {t("downloadPage.otherOsQ", { other: m.other })}
            </div>
            <div style={{ fontSize: 12, color: "var(--b-fg-3)" }}>
              {t("downloadPage.otherOsDesc", { other: m.other })}
            </div>
          </div>
          <a
            href={m.otherUrl}
            className="b-btn b-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            {t("downloadPage.otherOsBtn", { other: m.other })} <Icon name="arrow-r" size={12} />
          </a>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ───────── Pricing ─────────

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

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY || "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";

function Pricing() {
  const { t } = useTranslation("pricing");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentPlan, setCurrentPlan] = useState<"free" | "pro">("free");
  
  // 결제 진행 상태: "idle" | "select_method" | "checkout" | "success"
  const [paymentState, setPaymentState] = useState<"idle" | "select_method" | "checkout" | "success">("idle");
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
            console.warn("Security Warning: Subscription plan tampering detected in Marketing Pricing!");
            
            // 1. admin_notifications 테이블에 critical 경보 적재
            await supabase.from("admin_notifications").insert({
              event_type: "tampering_detected",
              severity: "critical",
              message: `보안 침해 감지 (마케팅): 사용자 ${userObj.email} 님이 요금제 진입 시 로컬 요금제 캐시를 PRO로 불법 변조한 정황이 포착되어, 시스템이 권한을 격하하고 로그를 기록했습니다.`,
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
              const cleanUrl = window.location.origin + window.location.pathname + "#/pricing";
              try {
                if (!userObj) throw new Error("로그인이 필요합니다.");

                // Toss 가 successUrl 에 authKey + customerKey 를 붙여 리다이렉트함
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

                trackPaymentEvent("checkout_completed", {
                  billingCycle: cycleParam,
                  amount: finalAmount,
                  user: userObj?.email
                });

                window.history.replaceState({}, document.title, cleanUrl);
              } catch (e: any) {
                console.error("billing-issue failed:", e);
                setPaymentState("idle");
                window.alert(t("web.paymentProcessError", { error: e?.message || String(e) }));
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
              message: `결제 실패: 사용자 ${userObj?.email || "비회원"} 님의 토스페이 결제 승인이 거절되거나 실패했습니다. (마케팅 화면 쿼리 수신)`,
              payload: {
                user_id: userObj?.id || null,
                email: userObj?.email || null,
                reason: "paymentStatus is fail from redirect query",
                failed_at: new Date().toISOString()
              }
            });

            alert(t("errPaymentFailed"));
            const cleanUrl = window.location.origin + window.location.pathname + "#/pricing";
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

  const handleUpgradeToPro = async () => {
    if (currentPlan === "pro") return;

    if (!currentUser) {
      // 로그인되어 있지 않은 상태: 로그인 페이지로 리다이렉트 및 로그인 성공 시 복귀 설정
      localStorage.setItem("barosit:auth_redirect", "#/pricing");
      localStorage.setItem("barosit:pending_subscription", "true");
      localStorage.setItem("barosit:pending_subscription_cycle", billingCycle);
      window.location.hash = "#/login";
      return;
    }

    // 중간 선택 단계 없이 바로 토스 통합 결제창 요청 실행
    await handleTossPayment("CARD" as any);
  };

  const handleTossPayment = async (
    _method: "카드" | "토스페이",
    userOverride?: any,
    cycleOverride?: "monthly" | "yearly"
  ) => {
    // 베타 무료 기간에는 결제 대신 다운로드로 안내 — 전 기능이 이미 개방돼 있음
    if (isBetaFree()) {
      window.location.hash = "#/download";
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

      // user 당 안정적 customerKey (§11 M2)
      const customerKey = activeUser
        ? `cust-${activeUser.id}`
        : `cust-guest-${Math.random().toString(36).substring(2, 10)}`;

      // 정기 구독 결제를 위한 카드 등록 창(requestBillingAuth) 실행
      await toss.requestBillingAuth("카드", {
        customerKey,
        successUrl: window.location.origin + window.location.pathname + `?redirect_route=pricing&payment=success&cycle=${activeCycle}`,
        failUrl: window.location.origin + window.location.pathname + `?redirect_route=pricing&payment=fail`,
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
    <div style={{ background: "var(--b-bg)", minHeight: "100vh", position: "relative" }}>
      <TopNav active="pricing" />
      
      <style>{`
        /* Checkout Spinner Overlay */
        .checkout-loading-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 18, 20, 0.95);
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 20px;
          backdrop-filter: blur(10px);
          WebkitBackdropFilter: blur(10px);
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

        /* Success & Celebration */
        .checkout-success-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 60px 24px;
          position: relative;
          max-width: 600px;
          margin: 0 auto;
          animation: pricingScaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes pricingScaleIn {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .success-circle {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(126, 176, 156, 0.1);
          border: 2px solid #7eb09c;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #7eb09c;
          margin-bottom: 24px;
          font-size: 36px;
          animation: successPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }
        @keyframes successPop {
          0% { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .success-headline {
          font-size: 28px;
          font-weight: 800;
          margin: 0 0 12px;
          color: #fff;
        }
        .success-desc {
          font-size: 15px;
          color: var(--b-fg-2);
          line-height: 1.6;
          max-width: 480px;
          margin: 0 0 40px;
        }

        /* Download Boxes */
        .download-boxes {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          width: 100%;
          max-width: 500px;
          margin-bottom: 32px;
        }
        .download-box {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-decoration: none;
          color: inherit;
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
          font-size: 14px;
          font-weight: 700;
          margin: 12px 0 4px;
          color: #fff;
        }
        .download-btn-label {
          font-size: 12px;
          color: #7eb09c;
          font-weight: 600;
        }

        /* CSS Confetti Sparkles */
        .confetti-sparkle {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 3px;
          top: 30%;
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

      {/* 1. 가상 결제 승인 중 화면 */}
      {paymentState === "checkout" && (
        <div className="checkout-loading-overlay">
          <div className="spinner" />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#fff" }}>
              {t("approving")}
            </div>
            <div style={{ fontSize: 13, color: "var(--b-fg-3)" }}>
              {t("approvingDesc")}
            </div>
          </div>
        </div>
      )}



      {/* 3. 결제 완료 축하 및 성공 다운로드 화면 */}
      {paymentState === "success" ? (
        <div className="checkout-success-view">
          {particles.map((p) => (
            <div
              key={p.id}
              className="confetti-sparkle"
              style={{
                background: p.color,
                "--tx": `${p.x}vw`,
                "--ty": `${p.y}vh`,
                animationDelay: `${p.delay}s`,
              } as any}
            />
          ))}

          <div className="success-circle">
            <Icon name="check" size={36} />
          </div>

          <h2 className="success-headline">{t("web.successHeadline")}</h2>
          <p className="success-desc">
            {t("web.successDesc")}
          </p>

          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--b-fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "16px" }}>
            {t("web.downloadLabel")}
          </div>

          <div className="download-boxes">
            <a href="#/download/mac" className="download-box">
              <Icon name="sparkle" size={32} style={{ color: "#7eb09c" }} />
              <div className="download-os-name">macOS Apple Silicon</div>
              <div className="download-btn-label">{t("web.downloadCta")}</div>
            </a>
            <a href="#/download/win" className="download-box">
              <Icon name="cpu" size={32} style={{ color: "#e08866" }} />
              <div className="download-os-name">Windows x64</div>
              <div className="download-btn-label">{t("web.downloadCta")}</div>
            </a>
          </div>

          <button
            type="button"
            className="b-btn b-btn-primary"
            style={{ height: "46px", padding: "0 28px", fontSize: "14px", borderRadius: "12px" }}
            onClick={() => {
              setPaymentState("idle");
              window.location.hash = "#/landing";
            }}
          >
            {t("web.goMain")}
          </button>
        </div>
      ) : (
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "70px 56px" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h1
              style={{
                fontSize: 48,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                marginBottom: 14,
                lineHeight: 1.1,
              }}
            >
              {t("web.title")}
            </h1>
            <p style={{ fontSize: 16, color: "var(--b-fg-2)", marginBottom: 32 }}>
              {t("web.subtitle")}
            </p>

            {/* 결제 주기 토글 스위치 */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <div
                style={{
                  background: "var(--b-surface-2)",
                  border: "1px solid var(--b-line)",
                  padding: 4,
                  borderRadius: 999,
                  display: "flex",
                  gap: 4,
                }}
              >
                <button
                  type="button"
                  onClick={() => setBillingCycle("monthly")}
                  style={{
                    border: "none",
                    background: billingCycle === "monthly" ? "var(--b-sig-bg)" : "transparent",
                    color: billingCycle === "monthly" ? "var(--b-sig)" : "var(--b-fg-3)",
                    padding: "8px 20px",
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 999,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {t("monthly")}
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle("yearly")}
                  style={{
                    border: "none",
                    background: billingCycle === "yearly" ? "var(--b-sig-bg)" : "transparent",
                    color: billingCycle === "yearly" ? "var(--b-sig)" : "var(--b-fg-3)",
                    padding: "8px 20px",
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 999,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {t("yearly")}
                  <span
                    style={{
                      background: "var(--b-sig)",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "1px 6px",
                      borderRadius: 999,
                    }}
                  >
                    {t("saveBadge")}
                  </span>
                </button>
              </div>
            </div>
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              {
                name: "Free",
                price: t("web.freePrice"),
                sub: t("web.freeSub"),
                feats: t("web.freeFeats", { returnObjects: true }) as string[],
                cta: t("web.freeCta"),
                primary: false,
              },
              {
                name: "Pro",
                price: billingCycle === "yearly" ? t("web.proPriceYear") : t("web.proPriceMonth"),
                sub: billingCycle === "yearly" ? t("web.proSubYear") : t("web.proSubMonth"),
                feats: t("web.proFeats", { returnObjects: true }) as string[],
                cta: currentPlan === "pro" ? t("web.proCtaCurrent") : t("web.proCtaStart"),
                primary: true,
              },
            ].map((p, i) => (
              <div
                key={i}
                style={{
                  padding: 32,
                  borderRadius: 18,
                  background: p.primary ? "var(--b-sig-bg)" : "var(--b-surface)",
                  border: "1px solid",
                  borderColor: p.primary ? "var(--b-sig)" : "var(--b-line)",
                  position: "relative",
                }}
              >
                {p.primary && (
                  <span
                    style={{
                      position: "absolute",
                      top: -10,
                      right: 20,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "var(--b-sig)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {t("web.recommend")}
                  </span>
                )}
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                  {p.name}
                </div>
                <div
                  style={{
                    fontSize: 40,
                    fontWeight: 700,
                    letterSpacing: "-0.028em",
                    lineHeight: 1.1,
                    marginBottom: 4,
                  }}
                >
                  {p.price}
                </div>
                <div style={{ fontSize: 12, color: "var(--b-fg-3)", marginBottom: 24 }}>
                  {p.sub}
                </div>
                
                {p.primary ? (
                  <button
                    type="button"
                    onClick={handleUpgradeToPro}
                    className={`b-btn ${currentPlan === "pro" ? "b-btn-ghost" : "b-btn-primary"}`}
                    disabled={currentPlan === "pro"}
                    style={{
                      width: "100%",
                      justifyContent: "center",
                      height: 44,
                      fontSize: 14,
                      marginBottom: 24,
                    }}
                  >
                    {p.cta}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="b-btn b-btn-ghost"
                    disabled
                    style={{
                      width: "100%",
                      justifyContent: "center",
                      height: 44,
                      fontSize: 14,
                      marginBottom: 24,
                      opacity: 0.5,
                      cursor: "default"
                    }}
                  >
                    {p.cta}
                  </button>
                )}
                
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {p.feats.map((f, j) => (
                    <div
                      key={j}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        color: "var(--b-fg-2)",
                      }}
                    >
                      <Icon
                        name="check"
                        size={14}
                        style={{ color: "var(--b-sig)", flexShrink: 0 }}
                      />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {t("krwNote") && (
            <p
              style={{
                marginTop: 24,
                fontSize: 12,
                color: "var(--b-fg-3)",
                lineHeight: 1.6,
                textAlign: "center",
              }}
            >
              {t("krwNote")}
            </p>
          )}
        </div>
      )}
      <Footer />
    </div>
  );
}

// ───────── Profile ─────────

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--b-fg-3)",
          letterSpacing: "0.04em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          padding: "10px 12px",
          minHeight: 42,
          border: "1px solid var(--b-line)",
          borderRadius: 8,
          background: "var(--b-surface-2)",
          color: "var(--b-fg-1)",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
        }}
      >
        {value || <span style={{ color: "var(--b-fg-4)" }}>—</span>}
      </div>
    </div>
  );
}

function AccountTab({
  user,
  subPlan,
}: {
  user: import("@supabase/supabase-js").User | null;
  subPlan: "free" | "pro";
}) {
  const { t, i18n } = useTranslation("profile");
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  let customName = "";
  if (typeof window !== "undefined") {
    try {
      const localProfileRaw = localStorage.getItem("user_profile_v1");
      if (localProfileRaw) {
        customName = JSON.parse(localProfileRaw).name || "";
      }
    } catch (e) {}
  }
  // DB(profiles.name)를 진짜 소스로 우선 조회 — 로컬 캐시/메타데이터가 기기마다
  // 다를 수 있어, 동기화된 DB 이름이 있으면 그 값을 표시한다.
  const [dbName, setDbName] = useState<string>("");
  const [deletionScheduledAt, setDeletionScheduledAt] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAck, setDeleteAck] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!user?.id) {
      setDbName("");
      setDeletionScheduledAt(null);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("name, deletion_scheduled_at")
          .eq("id", user.id)
          .maybeSingle();
        if (alive && !error) {
          setDbName((data?.name as string | undefined)?.trim() || "");
          setDeletionScheduledAt((data?.deletion_scheduled_at as string | undefined) ?? null);
        }
      } catch (e) {}
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  // 회원탈퇴 신청(soft delete + 30일 유예) / 유예 중 취소(복구)
  const requestDeletion = async () => {
    if (!user || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: { action: "request" },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "fail");
      setDeletionScheduledAt(data.scheduled_at ?? null);
      setDeleteConfirmOpen(false);
      setDeleteAck(false);
      const when = data.scheduled_at ? new Date(data.scheduled_at).toLocaleDateString(i18n.language) : "";
      alert(t("deleteSuccess", { date: when }));
    } catch (e) {
      console.error("delete-account request failed:", e);
      alert(t("deleteError"));
    } finally {
      setDeleteBusy(false);
    }
  };
  const cancelDeletion = async () => {
    if (!user || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: { action: "cancel" },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "fail");
      setDeletionScheduledAt(null);
      alert(t("deleteUndoSuccess"));
    } catch (e) {
      console.error("delete-account cancel failed:", e);
      alert(t("deleteUndoError"));
    } finally {
      setDeleteBusy(false);
    }
  };
  const fullName =
    dbName ||
    customName ||
    ((meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      "");
  const avatarUrl = (meta.avatar_url as string | undefined) ?? null;
  const provider =
    ((user?.app_metadata as Record<string, unknown> | undefined)?.provider as
      | string
      | undefined) ?? "—";
  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(i18n.language)
    : "—";
  const initial = (fullName || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <>
      <h2
        style={{
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "-0.022em",
          marginBottom: 6,
        }}
      >
        {t("web.accountTitle")}
      </h2>
      <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 28 }}>
        {t("web.accountSubtitle")}
      </p>

      <div
        style={{
          padding: 24,
          borderRadius: 14,
          background: "var(--b-surface)",
          border: "1px solid var(--b-line)",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
          <Avatar size={72} initial={initial} imageUrl={avatarUrl} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "-0.012em",
                marginBottom: 4,
              }}
            >
              {fullName || user?.email || t("web.userFallback")}
            </div>
            <div style={{ fontSize: 12, color: "var(--b-fg-3)" }}>
              {provider === "google"
                ? t("web.loggedInGoogle")
                : provider === "—"
                  ? t("web.loggedInNone")
                  : t("web.loggedInProvider", { provider })}
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                background:
                  subPlan === "pro"
                    ? "linear-gradient(135deg, #7eb09c 0%, #5b8c7a 100%)"
                    : "var(--b-surface-2)",
                color: subPlan === "pro" ? "#fff" : "var(--b-fg-2)",
                fontSize: 12,
                fontWeight: 700,
                boxShadow:
                  subPlan === "pro"
                    ? "0 2px 8px rgba(126, 176, 156, 0.25)"
                    : "none",
              }}
            >
              {subPlan === "pro" ? "PRO" : "FREE"}
            </span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <ReadOnlyField label={t("web.fieldName")} value={fullName} />
          <ReadOnlyField label={t("web.fieldEmail")} value={user?.email ?? ""} />
          <ReadOnlyField label={t("web.fieldProvider")} value={provider} />
          <ReadOnlyField label={t("web.fieldJoined")} value={createdAt} />
        </div>
      </div>

      <div
        style={{
          padding: 20,
          borderRadius: 14,
          background: "var(--b-surface-2)",
          border: "1px solid var(--b-line)",
          fontSize: 12,
          color: "var(--b-fg-3)",
          lineHeight: 1.6,
        }}
      >
        {t("web.noPasswordPre")}
        <a
          href="#/contact"
          style={{ color: "var(--b-sig-deep)", textDecoration: "underline" }}
        >
          {t("web.noPasswordLink")}
        </a>
        {t("web.noPasswordPost")}
      </div>

      {/* 회원탈퇴 (계정·데이터 영구 삭제) — soft delete + 30일 유예 */}
      {user && (
        <div style={{ marginTop: 18 }}>
          {deletionScheduledAt ? (
            <div style={{
              padding: 18, borderRadius: 14, background: "rgba(248,113,113,0.06)",
              border: "1px solid rgba(248,113,113,0.3)", display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e0564f" }}>{t("deletePendingTitle")}</div>
              <div style={{ fontSize: 13, color: "var(--b-fg-2)", lineHeight: 1.6 }}>
                {t("deletePendingBody", { date: new Date(deletionScheduledAt).toLocaleDateString(i18n.language) })}
              </div>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={cancelDeletion}
                style={{
                  alignSelf: "flex-start", padding: "9px 18px", borderRadius: 10, border: "none",
                  background: "var(--b-sig-deep, #5b8c7a)", color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: deleteBusy ? "default" : "pointer", opacity: deleteBusy ? 0.6 : 1,
                }}
              >
                {t("deletePendingCancel")}
              </button>
            </div>
          ) : !deleteConfirmOpen ? (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              style={{
                padding: "9px 16px", borderRadius: 10, background: "transparent",
                border: "1px solid rgba(248,113,113,0.3)", color: "#e0564f", fontSize: 13,
                fontWeight: 600, cursor: "pointer",
              }}
            >
              {t("deleteAccount")}
            </button>
          ) : (
            <div style={{
              padding: 18, borderRadius: 14, background: "rgba(248,113,113,0.05)",
              border: "1px solid rgba(248,113,113,0.25)", display: "flex", flexDirection: "column", gap: 12,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e0564f" }}>{t("deleteSectionTitle")}</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--b-fg-2)", lineHeight: 1.7 }}>
                <li>{t("deleteWarn1")}</li>
                <li>{t("deleteWarn2")}</li>
                <li>{t("deleteWarn3")}</li>
              </ul>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--b-fg-2)", cursor: "pointer" }}>
                <input type="checkbox" checked={deleteAck} onChange={(e) => setDeleteAck(e.target.checked)} style={{ marginTop: 3 }} />
                <span>{t("deleteAck")}</span>
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={!deleteAck || deleteBusy}
                  onClick={requestDeletion}
                  style={{
                    padding: "9px 16px", borderRadius: 10, border: "none", background: "#e0564f",
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: (!deleteAck || deleteBusy) ? "default" : "pointer",
                    opacity: (!deleteAck || deleteBusy) ? 0.5 : 1,
                  }}
                >
                  {deleteBusy ? t("deleteSubmitting") : t("deleteSubmit")}
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteConfirmOpen(false); setDeleteAck(false); }}
                  style={{
                    padding: "9px 16px", borderRadius: 10, background: "transparent",
                    border: "1px solid var(--b-line)", color: "var(--b-fg-2)", fontSize: 13, cursor: "pointer",
                  }}
                >
                  {t("deleteCancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function PlanTab({
  subPlan,
  planId,
  subStatus,
  periodEnd,
  onUpdateSubscription,
}: {
  subPlan: "free" | "pro";
  planId: "pro_monthly" | "pro_yearly" | "pro" | "free";
  subStatus: "active" | "canceled" | "none";
  periodEnd: string | null;
  onUpdateSubscription: () => void;
}) {
  const { t, i18n } = useTranslation("profile");
  const { user } = useAuth();
  const [billingHistory, setBillingHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [latestPayment, setLatestPayment] = useState<any>(null);
  const [isRefundable, setIsRefundable] = useState(false);

  useEffect(() => {
    const fetchHistoryAndRefundStatus = async () => {
      if (!user) return;
      try {
        setLoadingHistory(true);
        // 결제 내역 조회
        const { data: history, error } = await supabase
          .from("billing_history")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (!error && history) {
          setBillingHistory(history);
          
          // completed payment 찾기
          const lastPay = history.find(r => r.kind === "payment" && r.status === "completed");
          if (lastPay) {
            setLatestPayment(lastPay);
            
            // 결제한 지 7일 이내인지 판단
            const isWithin7Days = new Date().getTime() - new Date(lastPay.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000;
            if (isWithin7Days) {
              // posture_events와 daily_scores에 결제 시각 이후 기록이 존재하는지 판별
              const { count: eventCount } = await supabase
                .from("posture_events")
                .select("*", { count: "exact", head: true })
                .eq("user_id", user.id)
                .gte("created_at", lastPay.created_at);

              const { count: scoreCount } = await supabase
                .from("daily_scores")
                .select("*", { count: "exact", head: true })
                .eq("user_id", user.id)
                .gte("created_at", lastPay.created_at);

              if ((eventCount === 0 || eventCount === null) && (scoreCount === 0 || scoreCount === null)) {
                setIsRefundable(true);
              } else {
                setIsRefundable(false);
              }
            } else {
              setIsRefundable(false);
            }
          } else {
            setLatestPayment(null);
            setIsRefundable(false);
          }
        }
      } catch (err) {
        console.error("Failed to load billing history or refund status:", err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistoryAndRefundStatus();
  }, [user, subPlan, subStatus]);

  // 결제 정보 변경 감지 및 카드 갱신 결과 처리
  useEffect(() => {
    const checkCardUpdateResult = async () => {
      if (typeof window === "undefined" || !user) return;
      const params = new URLSearchParams(window.location.search);
      const paymentStatus = params.get("payment");
      const action = params.get("action");
      const authKey = params.get("authKey");

      if (action === "update_card") {
        // Clean query parameters to avoid double processing on page refresh
        const cleanUrl = window.location.origin + window.location.pathname + "#/profile";
        window.history.replaceState({}, document.title, cleanUrl);

        if (paymentStatus === "success" && authKey) {
          try {
            const customerKey = params.get("customerKey");
            if (!customerKey) throw new Error("결제 인증 정보를 받지 못했습니다.");

            // 서버 신뢰 경로 — 새 빌링키 발급 + 카드 교체 (청구 없음). card_info 는 Toss 응답에서 백엔드가 저장.
            const { data, error } = await supabase.functions.invoke("billing-issue", {
              body: { authKey, customerKey, mode: "update_card" },
            });
            if (error || !data?.success) {
              throw new Error(data?.error || error?.message || "카드 변경에 실패했습니다.");
            }

            window.alert(t("web.cardChangeSuccess"));
            onUpdateSubscription();
          } catch (err) {
            console.error("Failed to update card:", err);
            window.alert(t("web.cardChangeError"));
          }
        } else if (paymentStatus === "fail") {
          // 결제수단 변경 실패 알림 적재
          await supabase.from("admin_notifications").insert({
            event_type: "payment_failed",
            severity: "warning",
            message: `결제수단 변경 실패: 사용자 ${user.email} 님의 신규 결제 카드 등록이 실패하거나 본인 인증이 중단되었습니다.`,
            payload: {
              user_id: user.id,
              email: user.email,
              action: "card_renewal_failed",
              failed_at: new Date().toISOString()
            }
          });
          window.alert(t("web.cardRegAborted"));
        }
      }
    };

    checkCardUpdateResult();
  }, [user, subPlan, subStatus]);

  // 실제 결제 수단 변경 및 카드 갱신 신청 로직
  const handleUpdatePaymentCard = async () => {
    if (!user) return;
    try {
      const TossPaymentsLib = await loadTossPayments();
      const toss = TossPaymentsLib(TOSS_CLIENT_KEY);
      
      const customerKey = `cust-${user.id}`; // user 당 안정적 (§11 M2)
      
      trackPaymentEvent("card_update_initiated", {
        user: user.email
      });

      await toss.requestBillingAuth("카드", {
        customerKey,
        successUrl: window.location.origin + window.location.pathname + `?redirect_route=profile&payment=success&action=update_card`,
        failUrl: window.location.origin + window.location.pathname + `?redirect_route=profile&payment=fail&action=update_card`,
      });
    } catch (err: any) {
      trackPaymentEvent("card_update_failed", {
        reason: err.message,
        user: user.email
      });
      alert(t("web.cardWindowError") + err.message);
    }
  };

  // 플랜 취소 신청
  const handleCancelSubscription = async () => {
    if (!user) return;
    
    trackPaymentEvent("subscription_cancel_initiated");

    const formattedDate = periodEnd ? new Date(periodEnd).toLocaleDateString(i18n.language, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }) : t("web.nextBillingFallback");

    const confirmCancel = window.confirm(
      t("web.cancelConfirm", { date: formattedDate })
    );

    if (confirmCancel) {
      try {
        const { data, error } = await supabase.functions.invoke("subscription-manage", {
          body: { action: "cancel" },
        });

        if (!error && data?.success) {
          trackPaymentEvent("subscription_cancel_confirmed");
          window.alert(t("web.cancelSuccess"));
          onUpdateSubscription();
        } else {
          console.error("Cancel subscription error:", error);
          window.alert(t("web.cancelError"));
        }
      } catch (err) {
        console.error(err);
        window.alert(t("web.cancelErrorShort"));
      }
    }
  };

  // 구독 취소 철회 (구독 계속 유지)
  const handleResumeSubscription = async () => {
    if (!user) return;

    const confirmResume = window.confirm(t("web.resumeConfirm"));

    if (confirmResume) {
      try {
        const { data, error } = await supabase.functions.invoke("subscription-manage", {
          body: { action: "resume" },
        });

        if (!error && data?.success) {
          trackPaymentEvent("subscription_resume_confirmed");
          window.alert(t("web.resumeSuccess"));
          onUpdateSubscription();
        } else {
          console.error("Resume subscription error:", error);
          window.alert(t("web.resumeError"));
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleImmediateRefund = async () => {
    if (!user || !latestPayment) return;
    const confirmRefund = window.confirm(t("web.refundConfirm"));
    if (!confirmRefund) return;

    try {
      // 서버에서 7일/미사용 재검증 + 실제 Toss 취소 + FREE 강등 + 원장 환불 처리
      const { data, error } = await supabase.functions.invoke("payment-cancel", { body: {} });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "환불 처리 실패");
      }

      localStorage.setItem("barosit:subscription_plan", "free");
      window.alert(t("web.refundSuccess"));
      onUpdateSubscription();
    } catch (err: any) {
      console.error("Refund error:", err);
      window.alert(err?.message || t("web.refundError"));
    }
  };

  // 모의 테스트 결제 수단 / 주기 변경 알림
  const handleMockNotice = () => {
    window.alert(t("web.mockNotice"));
  };

  // 베타 무료 기간: 결제/구독 관리 UI 자체를 비노출하고 안내로 대체
  if (isBetaFree()) {
    return (
      <>
        <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.022em", marginBottom: 6 }}>
          {t("web.betaPlanTitle")}
        </h2>
        <p style={{ color: "var(--b-fg-2)", lineHeight: 1.7, marginBottom: 20 }}>
          {t("web.betaPlanBody")}
        </p>
        <a href="#/download" className="b-btn b-btn-primary">
          {t("web.betaPlanCta")}
        </a>
      </>
    );
  }

  if (subPlan === "pro") {
    const isCanceled = subStatus === "canceled";
    const formattedDate = periodEnd ? new Date(periodEnd).toLocaleDateString(i18n.language, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }) : t("web.dateFallback");

    const isYearly = planId === "pro_yearly";
    const planPriceText = isYearly ? t("web.priceYear") : t("web.priceMonth");
    const planPeriodText = isCanceled
      ? t("web.periodCanceled", { date: formattedDate })
      : isYearly
        ? t("web.periodYear", { date: formattedDate })
        : t("web.periodMonth", { date: formattedDate });

    return (
      <>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.022em",
            marginBottom: 6,
          }}
        >
          {t("web.planTitle")}
        </h2>
        <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 28 }}>
          {t("web.planSubtitle")}
        </p>

        <div
          style={{
            padding: 24,
            borderRadius: 14,
            marginBottom: 14,
            background: isCanceled
              ? "linear-gradient(135deg, var(--b-surface-2) 0%, var(--b-bg) 100%)"
              : "linear-gradient(135deg, var(--b-sig-bg) 0%, var(--b-bg) 100%)",
            border: isCanceled
              ? "1px solid var(--b-line)"
              : "1px solid var(--b-sig-soft)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              {isCanceled ? (
                <span
                  className="b-chip"
                  style={{
                    background: "rgba(224, 102, 102, 0.1)",
                    color: "rgb(224, 102, 102)",
                    borderColor: "rgba(224, 102, 102, 0.2)",
                    marginBottom: 12,
                    fontWeight: 600,
                  }}
                >
                  {t("web.chipCanceled")}
                </span>
              ) : (
                <span
                  className="b-chip"
                  style={{
                    background: "var(--b-sig)",
                    color: "#fff",
                    borderColor: "transparent",
                    marginBottom: 12,
                  }}
                >
                  {t("web.chipPro")}
                </span>
              )}
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: "-0.024em",
                  marginBottom: 4,
                  marginTop: 12,
                }}
              >
                {planPriceText}
              </div>
              <div style={{ fontSize: 13, color: isCanceled ? "rgb(224, 102, 102)" : "var(--b-fg-3)" }}>
                {planPeriodText}
              </div>
            </div>
            {!isCanceled && (
              <button onClick={handleUpdatePaymentCard} className="b-btn b-btn-ghost">{t("web.changeCard")}</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center" }}>
            {isCanceled ? (
              <button
                onClick={handleResumeSubscription}
                className="b-btn b-btn-primary"
                style={{
                  background: "linear-gradient(135deg, var(--b-sig) 0%, var(--b-sig-deep) 100%)",
                  color: "#fff",
                  border: "none",
                  fontWeight: 700,
                }}
              >
                {t("web.resume")}
              </button>
            ) : (
              <>
                <button onClick={handleMockNotice} className="b-btn b-btn-ghost" style={{ color: "var(--b-fg-3)" }}>
                  {isYearly ? t("web.changeToMonthly") : t("web.changeToYearly")}
                </button>
                {isRefundable && latestPayment && (
                  <button
                    onClick={handleImmediateRefund}
                    className="b-btn b-btn-quiet"
                    style={{
                      background: "rgba(224, 102, 102, 0.08)",
                      color: "rgb(224, 102, 102)",
                      border: "1px solid rgba(224, 102, 102, 0.2)",
                      fontWeight: 600,
                      padding: "8px 14px",
                      borderRadius: 8
                    }}
                  >
                    {t("web.immediateRefund")}
                  </button>
                )}
                <button onClick={handleCancelSubscription} className="b-btn b-btn-quiet" style={{ color: "var(--b-warn)" }}>
                  {t("web.cancelPlan")}
                </button>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            padding: 24,
            borderRadius: 14,
            background: "var(--b-surface)",
            border: "1px solid var(--b-line)",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{t("web.usageThisMonth")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { k: t("web.usageMonitorTime"), v: "128h", s: t("web.usageMonitorDelta") },
              { k: t("web.usageActiveDays"), v: t("web.usageDaysValue"), s: t("web.usageActiveSub") },
              { k: t("web.usageAvgScore"), v: "78", s: t("web.usageScoreDelta") },
            ].map((u, i) => (
              <div key={i}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--b-fg-3)",
                    letterSpacing: "0.04em",
                    marginBottom: 6,
                  }}
                >
                  {u.k}
                </div>
                <div
                  className="b-num"
                  style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.022em" }}
                >
                  {u.v}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--b-sig)",
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {u.s}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "0 4px" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--b-fg-3)",
              letterSpacing: "0.08em",
              marginBottom: 10,
            }}
          >
            {t("web.billingHistory")}
          </div>
          {loadingHistory ? (
            <div style={{ fontSize: 13, color: "var(--b-fg-3)", padding: "16px 0", textAlign: "center" }}>
              {t("web.billingLoading")}
            </div>
          ) : billingHistory.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--b-fg-3)", padding: "24px 0", textAlign: "center", borderBottom: "1px solid var(--b-line)" }}>
              {t("web.billingEmpty")}
            </div>
          ) : (
            billingHistory.map((r, i) => {
              const dateStr = new Date(r.created_at).toLocaleDateString(i18n.language, {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
              }).replace(/\. /g, ".").replace(/\.$/, "");
              
              const isRefunded = r.status === "refunded";
              
              return (
                <div
                  key={r.id || i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "12px 4px",
                    borderBottom: "1px solid var(--b-line)",
                  }}
                >
                  <span className="b-num" style={{ fontSize: 13, color: "var(--b-fg-2)" }}>
                    {dateStr}
                  </span>
                  <span
                    className="b-num"
                    style={{ 
                      fontSize: 13, 
                      marginLeft: "auto", 
                      marginRight: 18, 
                      fontWeight: 600,
                      color: isRefunded ? "rgb(224, 102, 102)" : "var(--b-fg-1)"
                    }}
                  >
                    {isRefunded
                      ? t("web.refundedAmount", { amount: r.refunded_amount.toLocaleString() })
                      : t("web.paidAmount", { amount: r.amount.toLocaleString() })
                    }
                  </span>
                  <span
                    className="b-chip"
                    style={{
                      background: isRefunded ? "rgba(224, 102, 102, 0.1)" : "var(--b-sig-bg)",
                      color: isRefunded ? "rgb(224, 102, 102)" : "var(--b-sig-deep)",
                      borderColor: isRefunded ? "rgba(224, 102, 102, 0.2)" : "var(--b-sig-soft)",
                      fontWeight: 600
                    }}
                  >
                    {isRefunded ? t("web.statusRefunded") : t("web.statusPaid")}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            marginTop: 32,
            padding: "16px 20px",
            borderRadius: 12,
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--b-line)",
            fontSize: 12,
            color: "var(--b-fg-3)",
            lineHeight: 1.6,
          }}
        >
          ℹ️ <strong>{t("web.refundNoticeTitle")}</strong><br />
          {t("web.refundNoticePre")}
          <a
            href="mailto:support@barosit.com"
            style={{ color: "var(--b-sig-deep)", fontWeight: 600, textDecoration: "underline" }}
          >
            support@barosit.com
          </a>
          {t("web.refundNoticePost")}
        </div>
      </>
    );
  }

  return (
    <>
      <h2
        style={{
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "-0.022em",
          marginBottom: 6,
        }}
      >
        {t("web.planTitle")}
      </h2>
      <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 28 }}>
        {t("web.planSubtitle")}
      </p>

      <div
        style={{
          padding: 24,
          borderRadius: 14,
          marginBottom: 14,
          background: "var(--b-surface)",
          border: "1px solid var(--b-line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <span
              className="b-chip"
              style={{
                background: "var(--b-surface-2)",
                color: "var(--b-fg-2)",
                borderColor: "transparent",
                marginBottom: 12,
              }}
            >
              {t("web.chipFree")}
            </span>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.024em",
                marginBottom: 6,
                marginTop: 12,
              }}
            >
              {t("web.freePlanName")}
            </div>
            <p style={{ fontSize: 13, color: "var(--b-fg-3)", lineHeight: 1.5, maxWidth: 500, margin: "8px 0 0 0" }}>
              {t("web.freePlanDesc")}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
          <button
            onClick={() => { window.location.hash = "#/pricing"; }}
            className="b-btn b-btn-primary"
            style={{
              background: "linear-gradient(135deg, #e08866, #c2613f)",
              color: "#fff",
              boxShadow: "0 4px 15px rgba(224, 136, 102, 0.25)",
              border: "none",
              fontWeight: 700,
              padding: "10px 20px",
            }}
          >
            {t("web.upgradeBtn")}
          </button>
        </div>
      </div>

      <div
        style={{
          padding: 24,
          borderRadius: 14,
          background: "var(--b-surface)",
          border: "1px solid var(--b-line)",
          opacity: 0.6,
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{t("web.usageThisMonthPro")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { k: t("web.usageMonitorTime"), v: "0h", s: t("web.usageProOnly") },
            { k: t("web.usageActiveDays"), v: t("web.usageDaysZero"), s: t("web.usageProOnly") },
            { k: t("web.usageAvgScore"), v: "—", s: t("web.usageProOnly") },
          ].map((u, i) => (
            <div key={i}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--b-fg-3)",
                  letterSpacing: "0.04em",
                  marginBottom: 6,
                }}
              >
                {u.k}
              </div>
              <div
                className="b-num"
                style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.022em" }}
              >
                {u.v}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--b-fg-3)",
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                {u.s}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ProfileLoading() {
  const { t } = useTranslation("profile");
  return (
    <div
      style={{
        background: "var(--b-bg)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        color: "var(--b-fg-3)",
      }}
    >
      {t("web.loadingText")}
    </div>
  );
}

function Profile() {
  const { t } = useTranslation("profile");
  const { user, loading, configured, signOut } = useAuth();
  const [tab, setTab] = useState<"account" | "plan">("account");
  const [subPlan, setSubPlan] = useState<"free" | "pro">("free");
  const [planId, setPlanId] = useState<"pro_monthly" | "pro_yearly" | "pro" | "free">("free");
  const [subStatus, setSubStatus] = useState<"active" | "canceled" | "none">("none");
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && configured && !user) {
      window.location.replace("#/login");
    }
  }, [loading, configured, user]);

  const fetchSub = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("plan_id, status, current_period_end")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!error && data) {
        const verifiedPlan = resolveEffectivePlan(data);
        setSubPlan(verifiedPlan);
        setPlanId((data.plan_id as any) || "free");
        setSubStatus(data.status as any);
        setPeriodEnd(data.current_period_end);
        localStorage.setItem("barosit:subscription_plan", verifiedPlan);
        return;
      } else if (!error && !data) {
        setSubPlan("free");
        setPlanId("free");
        setSubStatus("none");
        setPeriodEnd(null);
        localStorage.setItem("barosit:subscription_plan", "free");
        return;
      }
      const localPlan = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
      setSubPlan(localPlan || "free");
      setPlanId(localPlan === "pro" ? "pro" : "free");
      setSubStatus(localPlan === "pro" ? "active" : "none");
      setPeriodEnd(null);
    } catch (err) {
      console.error("Failed to load user subscription:", err);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchSub();

    const handleSubChanged = () => {
      const p = localStorage.getItem("barosit:subscription_plan") as "free" | "pro";
      setSubPlan(p || "free");
      setPlanId(p === "pro" ? "pro" : "free");
      setSubStatus(p === "pro" ? "active" : "none");
      setPeriodEnd(null);
    };
    window.addEventListener("barosit:subscription-changed", handleSubChanged);
    window.addEventListener("storage", handleSubChanged);
    return () => {
      window.removeEventListener("barosit:subscription-changed", handleSubChanged);
      window.removeEventListener("storage", handleSubChanged);
    };
  }, [user]);

  if (!configured) {
    return (
      <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
        <TopNav />
        <div
          style={{
            maxWidth: 560,
            margin: "0 auto",
            padding: "80px 24px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.018em",
              marginBottom: 8,
            }}
          >
            {t("web.notConfiguredTitle")}
          </h2>
          <p
            style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 20 }}
            dangerouslySetInnerHTML={{ __html: t("web.notConfiguredBody") }}
          />
          <a
            href="#/landing"
            className="b-btn b-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            {t("web.backToLanding")}
          </a>
        </div>
      </div>
    );
  }

  if (loading || !user) return <ProfileLoading />;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  let customName = "";
  if (typeof window !== "undefined") {
    try {
      const localProfileRaw = localStorage.getItem("user_profile_v1");
      if (localProfileRaw) {
        customName = JSON.parse(localProfileRaw).name || "";
      }
    } catch (e) {}
  }
  const fullName =
    customName ||
    ((meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      "");
  const avatarUrl = (meta.avatar_url as string | undefined) ?? null;
  const sidebarInitial = (fullName || user.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  const handleSignOut = async () => {
    const cur = window.location.hash || "";
    await signOut();
    // 인증 필수 영역(#/profile, #/account, #/app, #/admin)에서만 #/landing
    // 으로 강제. 그 외 페이지(#/pricing, #/about 등)는 현재 위치 유지 —
    // useAuth.user=null 이 되면서 React 가 자연 재렌더합니다.
    if (shouldRedirectAfterSignOut(cur)) {
      window.location.replace("#/landing");
    }
  };

  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav />
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "40px 56px",
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 32,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 28,
              padding: "8px 4px",
            }}
          >
            <Avatar size={44} initial={sidebarInitial} imageUrl={avatarUrl} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {fullName || user.email || t("web.userFallback")}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--b-fg-3)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.email}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(
              [
                { k: "account", i: "settings", t: t("web.navAccount") },
                { k: "plan", i: "sparkle", t: t("web.navPlan") },
              ] as Array<{ k: "account" | "plan"; i: IconName; t: string }>
            ).map((it) => (
              <button
                key={it.k}
                onClick={() => setTab(it.k)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  color: tab === it.k ? "var(--b-fg-1)" : "var(--b-fg-3)",
                  background: tab === it.k ? "var(--b-surface)" : "transparent",
                  border:
                    tab === it.k
                      ? "1px solid var(--b-line)"
                      : "1px solid transparent",
                }}
              >
                <Icon name={it.i} size={14} />
                {it.t}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 24, padding: "0 4px" }}>
            <button
              type="button"
              onClick={handleSignOut}
              className="b-btn b-btn-quiet"
              style={{
                width: "100%",
                justifyContent: "flex-start",
                color: "var(--b-warn)",
              }}
            >
              <Icon name="arrow-r" size={13} /> {t("web.logout")}
            </button>
          </div>
        </div>

        <div>
          {tab === "account" && <AccountTab user={user} subPlan={subPlan} />}
          {tab === "plan" && (
            <PlanTab 
              subPlan={subPlan} 
              planId={planId}
              subStatus={subStatus} 
              periodEnd={periodEnd} 
              onUpdateSubscription={fetchSub} 
            />
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ───────── Router ─────────

export type MarketingRoute =
  | "landing"
  | "login"
  | "signup"
  | "download-mac"
  | "download-win"
  | "download"
  | "pricing"
  | "profile"
  | "privacy"
  | "terms"
  | "community"
  | "changelog"
  | "science"
  | "auth-callback"
  | "forgot-password"
  | "reset-password";

function detectOS(): "mac" | "win" {
  if (typeof window === "undefined" || !navigator) return "mac";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "win";
  return "mac";
}

// 근거(Science) 페이지 — 출처는 docs/posture-evidence-and-reflection.md §2 검증 항목.
// 인용 라벨/URL 은 언어 중립이라 상수로 두고, 주장 문장만 i18n.
const SCIENCE_SOURCES: Array<{ id: string; cite: string; url: string }> = [
  { id: "noStandard", cite: "Barra-López, 2024 · J Rehabil Med", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11492508/" },
  { id: "causation", cite: "Swain et al., 2020 · J Biomechanics", url: "https://pubmed.ncbi.nlm.nih.gov/31451200/" },
  { id: "forwardHead", cite: "Mahmoud et al., 2019 · Curr Rev Musculoskelet Med", url: "https://pubmed.ncbi.nlm.nih.gov/31773477/" },
  { id: "sitting", cite: "Ekelund et al., 2016 · The Lancet", url: "https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(16)30370-1/abstract" },
  { id: "cadence", cite: "Network meta-analysis, 2024 · Applied Sciences", url: "https://www.mdpi.com/2076-3417/14/8/3201" },
  { id: "reminders", cite: "Chen et al., 2025 · IJBNPA (18 RCT)", url: "https://ijbnpa.biomedcentral.com/articles/10.1186/s12966-025-01781-0" },
];

function SciencePage() {
  const { t } = useTranslation("marketing");
  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav />
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "60px 56px 80px" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--b-sig)",
            letterSpacing: "0.1em",
            marginBottom: 10,
          }}
        >
          {t("science.eyebrow")}
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.028em", marginBottom: 18 }}>
          {t("science.title")}
        </h1>
        <p style={{ fontSize: 17, color: "var(--b-fg-2)", lineHeight: 1.7, marginBottom: 40 }}>
          {t("science.intro")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {SCIENCE_SOURCES.map((s, i) => (
            <div
              key={s.id}
              style={{
                padding: 22,
                borderRadius: 14,
                background: "var(--b-surface)",
                border: "1px solid var(--b-line)",
              }}
            >
              <div className="b-num" style={{ fontSize: 12, fontWeight: 700, color: "var(--b-sig-deep)", marginBottom: 8 }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.65, marginBottom: 12, color: "var(--b-fg-1)" }}>
                {t(`science.findings.${s.id}`)}
              </p>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                style={{ fontSize: 13, color: "var(--b-fg-3)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Icon name="arrow-r" size={12} /> {s.cite}
              </a>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 40,
            padding: 22,
            borderRadius: 14,
            background: "var(--b-sig-bg)",
            border: "1px solid var(--b-line)",
          }}
        >
          <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--b-fg-2)", margin: 0 }}>
            {t("science.closing")}
          </p>
        </div>

        <p style={{ fontSize: 12, color: "var(--b-fg-4)", lineHeight: 1.6, marginTop: 28 }}>
          {t("science.disclaimer")}
        </p>
        <a href="#/landing" style={{ fontSize: 14, color: "var(--b-sig-deep)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginTop: 20 }}>
          <Icon name="chev-l" size={14} /> {t("science.back")}
        </a>
      </div>
      <Footer />
    </div>
  );
}

export function routeFromHash(hash: string): MarketingRoute | null {
  const h = hash.replace(/^#\/?/, "").split("?")[0];
  if (h === "landing") return "landing";
  if (h === "login") return "login";
  if (h === "signup") return "signup";
  if (h === "download/mac") return "download-mac";
  if (h === "download/win") return "download-win";
  if (h === "download") return "download";
  if (h === "pricing") return "pricing";
  if (h === "profile" || h === "account") return "profile";
  if (h === "privacy") return "privacy";
  if (h === "terms") return "terms";
  if (h === "changelog" || h === "release" || h === "releases") return "changelog";
  if (h === "community" || h === "contact" || h === "support") return "community";
  if (h === "science" || h === "evidence") return "science";
  if (h === "auth/callback") return "auth-callback";
  if (h === "forgot-password") return "forgot-password";
  if (h === "reset-password") return "reset-password";
  return null;
}

function routeBody(route: MarketingRoute, initialPostId?: string | null) {
  switch (route) {
    case "landing":
      return <Landing />;
    case "login":
      return <Login mode="signin" />;
    case "signup":
      return <Login mode="signup" />;
    case "download-mac":
      return <Download os="mac" />;
    case "download-win":
      return <Download os="win" />;
    case "download":
      return <Download os={detectOS()} />;
    case "pricing":
      return <Pricing />;
    case "profile":
      return <Profile />;
    case "privacy":
      return <LegalPage kind="privacy" />;
    case "terms":
      return <LegalPage kind="terms" />;
    case "changelog":
      return <ChangelogPage />;
    case "community":
      return <Contact initialPostId={initialPostId} />;
    case "science":
      return <SciencePage />;
    case "auth-callback":
      return <AuthCallback />;
    case "forgot-password":
      return <ForgotPassword />;
    case "reset-password":
      return <ResetPassword />;
  }
}

export function handleContactClick() {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard
      .writeText("support@barosit.com")
      .then(() => {
        if (typeof window !== "undefined" && (window as any).showContactToast) {
          (window as any).showContactToast();
        }
      })
      .catch(() => {
        // clipboard fallback if needed
      });
  }
}

export function Marketing({ route, initialPostId }: { route: MarketingRoute; initialPostId?: string | null }) {
  const { t } = useTranslation("marketing");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 부팅 시 런치 모드 원격값 + 테스터 여부 동기화 (베타↔시험↔유료). 실패해도 캐시/env 폴백.
  useEffect(() => {
    refreshLaunchMode();
    refreshTesterStatus();
  }, []);

  // 무료 베타 기간에는 가격 페이지 접근 시 메인 홈으로 리다이렉트
  useEffect(() => {
    const checkRedirect = () => {
      if (route === "pricing" && isBetaFree()) {
        window.location.hash = "#/landing";
      }
    };
    checkRedirect();
    window.addEventListener(LAUNCH_MODE_CHANGED_EVENT, checkRedirect);
    return () => {
      window.removeEventListener(LAUNCH_MODE_CHANGED_EVENT, checkRedirect);
    };
  }, [route]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    (window as any).showContactToast = () => {
      setToastMessage(t("copyEmailToast"));
      clearTimeout(timer);
      timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
    };
    return () => {
      clearTimeout(timer);
    };
  }, []);

  // 마케팅 페이지는 라이트 기본 — 디자인 결정 (앱은 다크 지원, 웹은 라이트 고정)
  return (
    <div
      className="b-force-light"
      style={{ minHeight: "100vh", background: "var(--b-bg)", color: "var(--b-fg-1)" }}
    >
      {routeBody(route, initialPostId)}

      {toastMessage && (
        <>
          <style>{`
            @keyframes fadeInUp {
              from {
                opacity: 0;
                transform: translate(-50%, 20px);
              }
              to {
                opacity: 1;
                transform: translate(-50%, 0);
              }
            }
          `}</style>
          <div
            style={{
              position: "fixed",
              bottom: 32,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(17, 24, 39, 0.9)",
              backdropFilter: "blur(8px)",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: "999px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
              fontSize: 14,
              fontWeight: 500,
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              gap: 8,
              animation: "fadeInUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              border: "1px solid rgba(255, 255, 255, 0.15)",
            }}
          >
            <Icon name="check" size={15} style={{ color: "var(--b-sig)" }} />
            {toastMessage}
          </div>
        </>
      )}
    </div>
  );
}
