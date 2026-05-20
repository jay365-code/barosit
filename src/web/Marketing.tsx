import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import privacyMd from "../../docs/privacy.md?raw";
import termsMd from "../../docs/terms.md?raw";
import { supabase } from "../auth/supabase";
import { useAuth } from "../auth/useAuth";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import {
  MAIN_SLOGAN_LINE1,
  MAIN_SLOGAN_LINE2,
  pickSubSlogan,
} from "../slogans";

// const CONTACT_EMAIL = "jhlee@gubed.co.kr";
const GITHUB_URL = "https://github.com/jay365-code/barosit";

// ───────── Shared ─────────

function TopNav({ active }: { active?: string }) {
  const { user } = useAuth();
  const items = [
    { label: "기능", hash: "#/landing" },
    { label: "가격", hash: "#/pricing" },
    { label: "다운로드", hash: "#/download/mac" },
    { label: "커뮤니티", hash: "#/community" },
  ];
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    "";
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
            key={i.label}
            href={i.hash}
            style={{
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 500,
              color: i.label === active ? "var(--b-fg-1)" : "var(--b-fg-3)",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            {i.label}
          </a>
        ))}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
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
          <a href="#/login" className="b-btn b-btn-quiet" style={{ textDecoration: "none" }}>
            로그인
          </a>
        )}
        <a
          href="#/download/mac"
          className="b-btn b-btn-primary"
          style={{ textDecoration: "none" }}
        >
          <Icon name="arrow-r" size={13} />
          다운로드
        </a>
      </div>
    </div>
  );
}

function Footer() {
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
            <div>주식회사 구비드 | 대표자: 이종현</div>
            <div>주소: 서울특별시 송파구 오금로15길 5-12, 3층 3425호 (방이동, 정환빌딩)</div>
            <div>
              사업자등록번호: 512-88-00059 | 통신판매업신고: 제 2025-서울송파-2552호
            </div>
            <div>전화: 02-2147-2513</div>
          </div>
        </div>

        {/* 법적 고지 및 링크 */}
        <div style={{ display: "flex", gap: 24, fontSize: 13, fontWeight: 500 }}>
          <a href="#/privacy" style={{ color: "var(--b-fg-2)", textDecoration: "none" }}>
            개인정보 처리방침
          </a>
          <a href="#/terms" style={{ color: "var(--b-fg-2)", textDecoration: "none" }}>
            이용약관
          </a>
          <a href="#/contact" style={{ color: "var(--b-fg-2)", textDecoration: "none" }}>
            문의
          </a>
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
      {initial ?? "김"}
    </div>
  );
}

// ───────── Landing ─────────

function Landing() {
  const subSlogan = pickSubSlogan();
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
          온디바이스 · 영상은 외부로 나가지 않습니다
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
          {MAIN_SLOGAN_LINE1}
          <br />
          <span style={{ color: "var(--b-sig-deep)" }}>{MAIN_SLOGAN_LINE2}</span>
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
          웹캠으로 자세를 살펴드릴게요. 거북목·어깨 기울임·등 구부정·턱 괴임·모니터
          거리·어깨 비대칭 6종을 살펴보다 잘못된 자세가 일정 시간 이어지면 부드럽게
          알려드립니다.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <a
            href="#/app"
            className="b-btn b-btn-primary"
            style={{ height: 48, padding: "0 22px", fontSize: 14, textDecoration: "none" }}
          >
            <Icon name="arrow-r" size={14} /> 웹에서 바로 시작
          </a>
          <a
            href="#/download/mac"
            className="b-btn b-btn-ghost"
            style={{ height: 48, padding: "0 20px", fontSize: 14, textDecoration: "none" }}
          >
            Mac 다운로드
          </a>
          <a
            href="#/download/win"
            className="b-btn b-btn-ghost"
            style={{ height: 48, padding: "0 20px", fontSize: 14, textDecoration: "none" }}
          >
            Windows 다운로드
          </a>
        </div>
        <div className="b-num" style={{ fontSize: 12, color: "var(--b-fg-4)" }}>
          설치 없이 브라우저에서 바로 · 데스크탑 앱은 백그라운드·위젯 지원
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
          작동 원리
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
          세 가지만 기억하면
          <br />
          됩니다
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          {(
            [
              {
                icon: "camera",
                t: "웹캠으로 살펴봐요",
                d: "측면에 둔 카메라가 어깨와 목 각도를 1초에 30번 살펴요. 사이드 모니터 위에 노트북을 두면 좋아요.",
              },
              {
                icon: "target",
                t: "잘못된 자세를 짚어드려요",
                d: "거북목 · 턱 괴임 · 어깨 기울임 · 등 구부정. 네 가지를 따로 구분해 알려드려요.",
              },
              {
                icon: "sparkle",
                t: "잠깐 자세를 바꿔봐요",
                d: "잔소리 대신 부드럽게. 점수와 함께 회복을 응원하고, 스트레칭은 보너스 점수로 돌려드려요.",
              },
            ] as Array<{ icon: IconName; t: string; d: string }>
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
                {s.t}
              </div>
              <div style={{ fontSize: 14, color: "var(--b-fg-3)", lineHeight: 1.6 }}>
                {s.d}
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
              영상은 이 컴퓨터 안에서만 살펴봅니다
            </h2>
            <p
              style={{
                fontSize: 16,
                color: "var(--b-fg-2)",
                lineHeight: 1.6,
                marginBottom: 24,
              }}
            >
              자세 인식은 100% 온디바이스에서 처리됩니다. 영상도, 자세 데이터도 외부
              서버로 나가지 않아요. 인터넷이 끊겨도 작동합니다.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "웹캠 영상은 저장되지 않아요",
                "자세 데이터는 이 컴퓨터에만 남아요",
                "카메라 영상은 외부 서버로 절대 나가지 않아요",
              ].map((t, i) => (
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
                  {t}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { k: "On-device", v: "100%" },
              { k: "클라우드", v: "0%" },
              { k: "오프라인", v: "작동" },
              { k: "동작 분석", v: "13가지" },
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
          꼭 필요한 기능만
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {(
            [
              {
                i: "target",
                t: "자세 4종 감지",
                d: "거북목 · 턱 괴임 · 어깨 기울임 · 등 구부정을 구분해 짚어드려요",
              },
              {
                i: "sparkle",
                t: "0–100 점수 시스템",
                d: "좋은 자세 유지 시 회복 가속, 위반은 그레이스 2초 후 패널티",
              },
              {
                i: "minimize",
                t: "위젯 모드",
                d: "작은 알약 하나로 작업을 방해하지 않고 점수만 살짝 보여드려요",
              },
              { i: "moon", t: "다크 모드", d: "시그니처 색 그대로, 야간 작업에도 눈 편하게" },
            ] as Array<{ i: IconName; t: string; d: string }>
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
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{f.t}</div>
                <div style={{ fontSize: 13, color: "var(--b-fg-3)", lineHeight: 1.55 }}>
                  {f.d}
                </div>
              </div>
            </div>
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
          오늘부터 바르게 앉아볼까요
        </h2>
        <p style={{ fontSize: 16, color: "var(--b-fg-2)", marginBottom: 28 }}>
          무료로 시작하고, Pro는 언제든 결제하세요.
        </p>
        <div style={{ display: "inline-flex", gap: 10 }}>
          <a
            href="#/download/mac"
            className="b-btn b-btn-primary"
            style={{
              height: 48,
              padding: "0 22px",
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Mac 다운로드
          </a>
          <a
            href="#/download/win"
            className="b-btn b-btn-ghost"
            style={{
              height: 48,
              padding: "0 22px",
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Windows 다운로드
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
  const { configured } = useAuth();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!configured) {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(
            "Supabase 가 아직 설정되지 않았어요. .env.local 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인하세요.",
          );
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
        if (!data.session) throw new Error("세션을 확인할 수 없어요.");
        window.location.replace("#/landing");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(
          e instanceof Error ? e.message : "로그인을 완료할 수 없어요.",
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
              로그인 마무리 중…
            </h2>
            <p style={{ fontSize: 13, color: "var(--b-fg-3)", margin: 0 }}>
              계정 정보를 확인하고 있어요. 잠시만요.
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
              로그인을 완료하지 못했어요
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
              className="b-btn b-btn-primary"
              style={{ textDecoration: "none" }}
            >
              로그인 화면으로 돌아가기
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// ───────── Legal (Privacy / Terms) ─────────

const LEGAL_TITLE: Record<"privacy" | "terms", string> = {
  privacy: "개인정보 처리방침",
  terms: "이용약관",
};

const LEGAL_SOURCE: Record<"privacy" | "terms", string> = {
  privacy: privacyMd,
  terms: termsMd,
};

function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const md = useMemo(() => LEGAL_SOURCE[kind], [kind]);
  const otherKind = kind === "privacy" ? "terms" : "privacy";
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
          {LEGAL_TITLE[kind]}
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--b-fg-3)",
            margin: 0,
            marginBottom: 32,
          }}
        >
          본 문서는 앱과 동일한 소스(<code>docs/{kind}.md</code>)로 렌더됩니다.
        </p>
        <div
          className="b-legal-body"
          style={{
            border: "1px solid var(--b-line)",
            borderRadius: 14,
            background: "var(--b-surface)",
            padding: "28px 32px",
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
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
            <Icon name="arrow-r" size={12} /> {LEGAL_TITLE[otherKind]} 보기
          </a>
          <a
            href="#/contact"
            className="b-btn b-btn-quiet"
            style={{ textDecoration: "none" }}
          >
            문의하기
          </a>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ───────── Contact ─────────

function Contact() {
  const { user } = useAuth();

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
  const [activeCategory, setActiveCategory] = useState<string>("전체");

  // Post Form States
  const [writeTitle, setWriteTitle] = useState("");
  const [writeContent, setWriteContent] = useState("");
  const [writeAuthor, setWriteAuthor] = useState("");
  const [writePassword, setWritePassword] = useState("");
  const [writeCategory, setWriteCategory] = useState("💡 기능 제안");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Comment Form States
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [commentPassword, setCommentPassword] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

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

  // --- Auto-set profile display name for logged-in users ---
  useEffect(() => {
    if (user) {
      const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "";
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
      let query = supabase.from("posts").select("*");

      if (searchQuery.trim()) {
        query = query.or(
          `title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%,author_name.ilike.%${searchQuery}%`
        );
      }

      if (activeCategory !== "전체") {
        query = query.eq("category", activeCategory);
      }

      if (sortBy === "likes") {
        query = query.order("likes", { ascending: false }).order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;
      setPosts(data || []);
    } catch (err: any) {
      console.error("Error fetching posts:", err);
      setErrorMsg("게시글 목록을 불러오는 도중 오류가 발생했습니다.");
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
      setComments(data || []);
    } catch (err) {
      console.error("Error fetching comments:", err);
    } finally {
      setCommentsLoading(false);
    }
  };

  // --- Effects ---
  useEffect(() => {
    fetchPosts();
  }, [sortBy, activeCategory]);

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

    // Increment Views with sessionStorage check (1 view per session)
    const viewKey = `barosit_viewed_${post.id}`;
    if (!sessionStorage.getItem(viewKey)) {
      sessionStorage.setItem(viewKey, "true");
      try {
        await supabase
          .from("posts")
          .update({ views: post.views + 1 })
          .eq("id", post.id);
        // Update local state views count
        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, views: p.views + 1 } : p))
        );
      } catch (err) {
        console.error("Error updating views:", err);
      }
    }
  };

  const handleLikePost = async (e: React.MouseEvent, post: any) => {
    e.stopPropagation();
    const likeKey = `barosit_liked_${post.id}`;
    if (localStorage.getItem(likeKey)) {
      alert("이미 이 글을 추천하셨습니다.");
      return;
    }

    try {
      const { error } = await supabase
        .from("posts")
        .update({ likes: post.likes + 1 })
        .eq("id", post.id);
      if (error) throw error;

      localStorage.setItem(likeKey, "true");
      // Update states
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likes: p.likes + 1 } : p))
      );
      if (activePost && activePost.id === post.id) {
        setActivePost((prev: any) => ({ ...prev, likes: prev.likes + 1 }));
      }
    } catch (err) {
      console.error("Error liking post:", err);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const needsPassword = !user;

    if (!writeTitle.trim() || !writeContent.trim() || !writeAuthor.trim() || (needsPassword && !writePassword.trim())) {
      setErrorMsg("모든 빈칸을 빠짐없이 채워주세요.");
      return;
    }
    if (needsPassword && writePassword.length < 4) {
      setErrorMsg("비밀번호는 최소 4자리 이상 입력해주세요.");
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
      setErrorMsg(err.message || "글 작성 도중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePost) return;

    const needsPassword = !user;
    if (!commentAuthor.trim() || !commentContent.trim() || (needsPassword && !commentPassword.trim())) {
      alert("모든 빈칸을 채워주세요.");
      return;
    }
    if (needsPassword && commentPassword.length < 4) {
      alert("댓글 비밀번호는 최소 4자리 이상 입력해주세요.");
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
        },
      ]);

      if (error) throw error;

      setCommentContent("");
      setCommentPassword("");
      if (!user) setCommentAuthor("");
      fetchComments(activePost.id);
    } catch (err) {
      console.error("Error creating comment:", err);
      alert("댓글 등록에 실패했습니다.");
    } finally {
      setCommentSubmitting(false);
    }
  };

  // --- Deletion Handler with Direct Member Option ---
  const handlePostDeleteClick = () => {
    if (activePost.user_id && user && activePost.user_id === user.id) {
      if (confirm("정말로 이 게시글을 삭제하시겠습니까?")) {
        executeDirectDelete("post_delete", activePost.id);
      }
    } else {
      openDeleteModal("post_delete", activePost.id);
    }
  };

  const handleCommentDeleteClick = (comment: any) => {
    if (comment.user_id && user && comment.user_id === user.id) {
      if (confirm("정말로 이 댓글을 삭제하시겠습니까?")) {
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
          alert("삭제 권한이 없거나 이미 삭제된 게시글입니다.");
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
          alert("삭제 권한이 없거나 이미 삭제된 댓글입니다.");
          return;
        }

        if (activePost) {
          fetchComments(activePost.id);
        }
      }
    } catch (err) {
      console.error("Error executing direct delete:", err);
      alert("삭제 작업 중 서버 오류가 발생했습니다.");
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
            error: "비밀번호가 올바르지 않거나 회원 글은 비밀번호로 삭제할 수 없습니다.",
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
            error: "비밀번호가 올바르지 않거나 회원 댓글은 비밀번호로 삭제할 수 없습니다.",
          }));
          return;
        }

        // Success
        closeDeleteModal();
        if (activePost) {
          fetchComments(activePost.id);
        }
      }
    } catch (err) {
      console.error("Error deleting:", err);
      setPasswordModal((prev) => ({
        ...prev,
        error: "삭제 작업 중 서버 오류가 발생했습니다.",
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

  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav active="커뮤니티" />
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
          {view === "list" && "활발한 생각과 의견의 나눔터"}
          {view === "write" && "새로운 이야기 등록"}
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
          {view === "list" && "유용한 정보와 자세 꿀팁, 기능 제안 및 자유 토론을 나누어보세요. 우리 모두의 건강한 자세를 위한 전문적인 소통 공간입니다."}
          {view === "write" && "작성하신 소중한 글은 커뮤니티 모든 유저들과 실시간으로 공유됩니다."}
          {view === "detail" && `작성자: ${activePost?.author_name} · 작성일: ${formatDate(activePost?.created_at || "")}`}
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
              {["전체", "💡 기능 제안", "🔥 자세인증 챌린지", "📢 자유 토론", "❓ 질문/답변"].map((cat) => (
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
                  {cat}
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
                    placeholder="제목, 내용, 작성자 검색..."
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
                  <option value="recent">최신순</option>
                  <option value="likes">추천순</option>
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
                <span>이야기 등록하기</span>
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
                커뮤니티 글을 불러오는 중입니다...
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
                  등록된 게시글이 없습니다.
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  가장 먼저 따뜻하고 유익한 첫 이야기를 시작해 보세요!
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {posts.map((post) => {
                  const isLiked = localStorage.getItem(`barosit_liked_${post.id}`);
                  return (
                    <div
                      key={post.id}
                      onClick={() => handleSelectPost(post)}
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
                      {/* Product Hunt Style Side Upvote */}
                      <div
                        onClick={(e) => handleLikePost(e, post)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 48,
                          height: 58,
                          borderRadius: 12,
                          border: isLiked ? "1px solid var(--b-sig)" : "1px solid var(--b-line)",
                          background: isLiked ? "var(--b-sig-soft)" : "rgba(255, 255, 255, 0.8)",
                          color: isLiked ? "var(--b-sig)" : "var(--b-fg-2)",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          e.currentTarget.style.borderColor = "var(--b-sig)";
                          e.currentTarget.style.background = "var(--b-sig-soft)";
                          e.currentTarget.style.color = "var(--b-sig)";
                        }}
                        onMouseLeave={(e) => {
                          e.stopPropagation();
                          e.currentTarget.style.borderColor = isLiked ? "var(--b-sig)" : "var(--b-line)";
                          e.currentTarget.style.background = isLiked ? "var(--b-sig-soft)" : "rgba(255, 255, 255, 0.8)";
                          e.currentTarget.style.color = isLiked ? "var(--b-sig)" : "var(--b-fg-2)";
                        }}
                      >
                        <Icon name="chev-u" size={16} stroke={2.4} style={{ marginBottom: 2 }} />
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{post.likes}</span>
                      </div>

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
                              {post.category || "자유"}
                            </span>
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
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 12,
                              color: "var(--b-fg-3)",
                              flexShrink: 0,
                            }}
                          >
                            <Icon name="eye" size={13} /> {post.views}
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
                            작성자: <strong style={{ color: "var(--b-fg-2)" }}>{post.author_name}</strong>
                            {post.user_id ? (
                              <span style={{
                                fontSize: 10,
                                padding: "1px 5px",
                                borderRadius: 4,
                                background: "rgba(16, 185, 129, 0.1)",
                                color: "#10b981",
                                fontWeight: 700,
                              }}>👑 회원</span>
                            ) : (
                              <span style={{
                                fontSize: 10,
                                padding: "1px 5px",
                                borderRadius: 4,
                                background: "rgba(107, 114, 128, 0.1)",
                                color: "#6b7280",
                                fontWeight: 600,
                              }}>🌱 익명</span>
                            )}
                          </span>
                          <span>{formatDate(post.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                주제 선택 <span style={{ color: "var(--b-sig)" }}>*</span>
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["💡 기능 제안", "🔥 자세인증 챌린지", "📢 자유 토론", "❓ 질문/답변"].map((cat) => (
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
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Author & Password Fields */}
            <div style={{ display: "grid", gridTemplateColumns: user ? "1fr" : "1fr 1fr", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--b-fg-2)" }}>
                  닉네임 <span style={{ color: "var(--b-sig)" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={writeAuthor}
                  onChange={(e) => setWriteAuthor(e.target.value)}
                  placeholder="작성자 별명"
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
                    수정/삭제 비밀번호 <span style={{ color: "var(--b-sig)" }}>*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={writePassword}
                    onChange={(e) => setWritePassword(e.target.value)}
                    placeholder="4자리 이상"
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
                <span>로그인된 회원 계정으로 글이 등록됩니다. 비밀번호 입력 없이 편리하게 삭제가 가능합니다.</span>
              </div>
            )}

            {/* Title */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--b-fg-2)" }}>
                제목 <span style={{ color: "var(--b-sig)" }}>*</span>
              </label>
              <input
                type="text"
                required
                value={writeTitle}
                onChange={(e) => setWriteTitle(e.target.value)}
                placeholder="게시글의 제목을 입력하세요."
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
                글 내용 <span style={{ color: "var(--b-sig)" }}>*</span>
              </label>
              <textarea
                required
                rows={8}
                value={writeContent}
                onChange={(e) => setWriteContent(e.target.value)}
                placeholder="유용한 자세 습관, 후기, 기능 제안 및 챌린지 인증 등 BaroSit 사용자들과 다양한 생각을 공유해 보세요!"
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
                취소하기
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
                {submitting ? "등록 중..." : "이야기 공유하기"}
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
              onClick={() => {
                setView("list");
                setActivePost(null);
              }}
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
              <span>목록으로 돌아가기</span>
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
                  {activePost.category || "자유"}
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
                  <button
                    onClick={(e) => handleLikePost(e, activePost)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 16px",
                      borderRadius: 12,
                      border: "1px solid var(--b-line)",
                      background: "rgba(255, 255, 255, 0.7)",
                      color: "var(--b-fg-2)",
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
                      e.currentTarget.style.borderColor = "var(--b-line)";
                      e.currentTarget.style.color = "var(--b-fg-2)";
                    }}
                  >
                    <Icon name="chev-u" size={13} stroke={2.4} />
                    <span>추천 {activePost.likes}</span>
                  </button>
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
                  <span>글 삭제</span>
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
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--b-fg-1)", margin: 0 }}>
                댓글 ({comments.length}개)
              </h3>

              {/* Comments List */}
              {commentsLoading ? (
                <div style={{ fontSize: 13, color: "var(--b-fg-3)" }}>댓글을 로딩 중입니다...</div>
              ) : comments.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--b-fg-3)", padding: "8px 0" }}>
                  아직 등록된 댓글이 없습니다. 첫 마디를 나누어보세요!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      style={{
                        padding: "16px 20px 16px 24px",
                        borderRadius: 14,
                        background: "rgba(255, 255, 255, 0.5)",
                        border: "1px solid var(--b-line)",
                        // Reddit Thread Line 데코레이션
                        borderLeft: "3px solid var(--b-sig)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        position: "relative",
                      }}
                    >
                      {/* Comment Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--b-fg-2)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {comment.author_name}
                          {comment.user_id ? (
                            <span style={{
                              fontSize: 9,
                              padding: "1px 4px",
                              borderRadius: 3,
                              background: "rgba(16, 185, 129, 0.1)",
                              color: "#10b981",
                              fontWeight: 700,
                            }}>회원</span>
                          ) : (
                            <span style={{
                              fontSize: 9,
                              padding: "1px 4px",
                              borderRadius: 3,
                              background: "rgba(107, 114, 128, 0.1)",
                              color: "#6b7280",
                              fontWeight: 600,
                            }}>익명</span>
                          )}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 11, color: "var(--b-fg-3)" }}>
                            {formatDate(comment.created_at)}
                          </span>
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
                            title="댓글 삭제"
                          >
                            <Icon name="x" size={13} />
                          </button>
                        </div>
                      </div>
                      {/* Comment Content */}
                      <p style={{ fontSize: 14, color: "var(--b-fg-1)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {comment.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Comment Write Form */}
              <form
                onSubmit={handleCreateComment}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  borderTop: "1px solid var(--b-line)",
                  paddingTop: 20,
                  marginTop: 8,
                }}
              >
                {/* Input Fields Row */}
                <div style={{ display: "grid", gridTemplateColumns: user ? "1fr" : "1fr 1fr", gap: 12 }}>
                  <input
                    type="text"
                    required
                    placeholder="닉네임"
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
                      placeholder="삭제용 비밀번호(4자 이상)"
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
                    required
                    rows={2}
                    placeholder={user ? "회원 계정으로 따뜻한 댓글을 남겨보세요..." : "따뜻하고 유익한 댓글을 입력해 주세요..."}
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
                    {commentSubmitting ? "등록 중" : "등록"}
                  </button>
                </div>
              </form>
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
                  비밀번호 인증
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
                  ? "게시글을 안전하게 삭제하기 위해 글을 쓸 때 입력했던 비밀번호를 입력해 주세요."
                  : "댓글을 영구히 삭제하기 위해 등록 시 설정했던 비밀번호를 입력해 주세요."}
              </p>

              <input
                type="password"
                required
                autoFocus
                placeholder="비밀번호 입력"
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
                  취소
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
                  인증 및 삭제
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
                  직접 메일 발송
                </div>
                <p style={{ fontSize: 12, color: "var(--b-fg-3)", margin: 0, marginBottom: 14, lineHeight: 1.5 }}>
                  공개 토론에 적합하지 않거나, 비공개로 전달하실 중요 제휴/결제 관련 용건은 아래 버튼을 클릭하여 공식 지원 이메일을 간편하게 복사하세요.
                </p>
              </div>
              <button
                type="button"
                onClick={handleContactClick}
                className="b-btn b-btn-ghost"
                style={{ fontSize: 12, height: 36, padding: "0 14px", display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 6 }}
              >
                <span>메일 주소 복사하기</span> <Icon name="sparkle" size={10} />
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
                  이용 안내 및 건의
                </div>
                <p style={{ fontSize: 12, color: "var(--b-fg-3)", margin: 0, marginBottom: 14, lineHeight: 1.5 }}>
                  작성하신 커뮤니티 생각들은 다른 사용자들에게 좋은 정보가 됩니다. 쾌적한 커뮤니티 조성을 위해 건전하고 올바른 대화 예절을 부탁드립니다.
                </p>
              </div>
              <div
                style={{ fontSize: 12, fontWeight: 600, color: "var(--b-sig-deep)", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Icon name="info" size={12} /> <span>365일 24시간 실시간 모니터링 중</span>
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
            주식회사 구비드 (GUBED)
          </div>
          <div style={{ fontSize: 12, color: "var(--b-fg-2)", lineHeight: 1.8 }}>
            <div>대표이사 : 이종현 · 사업자등록번호 : 512-88-00059</div>
            <div>주소 : 서울특별시 송파구 오금로15길 5-12, 3층 3425호</div>
            <div>통신판매업신고번호 : 제 2025-서울송파-2552호 · 고객센터 : 02-2147-2513</div>
            <div style={{ marginTop: 4 }}>
              오픈소스 코드 저장소 :{" "}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--b-sig-deep)", textDecoration: "underline", fontWeight: 500 }}
              >
                {GITHUB_URL.replace("https://", "")}
              </a>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ───────── Login / Signup ─────────

function Login({ mode = "signin" }: { mode?: "signin" | "signup" }) {
  const subSlogan = pickSubSlogan();
  const {
    signInWithGoogle,
    signInWithApple,
    signInWithKakao,
    signInWithNaver,
    signInWithLine,
    configured,
    user,
    loading
  } = useAuth();
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      window.location.replace("#/landing");
    }
  }, [loading, user]);

  const handleOAuth = async (provider: "google" | "apple" | "kakao" | "naver" | "line", signInFn: () => Promise<void>) => {
    setOauthError(null);
    if (!configured) {
      setOauthError("아직 인증이 연결되지 않았습니다. .env.local 의 Supabase 설정을 확인하세요.");
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
        kakao: "카카오",
        naver: "네이버",
        line: "라인",
      }[provider];
      setOauthError(e instanceof Error ? e.message : `${provName} 로그인에 실패했어요.`);
    }
  };

  const handleGoogle = () => handleOAuth("google", signInWithGoogle);
  const handleApple = () => handleOAuth("apple", signInWithApple);
  const handleKakao = () => handleOAuth("kakao", signInWithKakao);
  const handleNaver = () => handleOAuth("naver", signInWithNaver);
  const handleLine = () => handleOAuth("line", signInWithLine);

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
            {MAIN_SLOGAN_LINE1}
            <br />
            <span style={{ color: "var(--b-sig-deep)" }}>{MAIN_SLOGAN_LINE2}</span>
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
            웹캠으로 자세를 살펴드릴게요.
            <br />
            영상은 이 컴퓨터를 떠나지 않습니다.
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
          <Icon name="shield" size={12} /> 자세 데이터는 사용자가 동기화를 켤 때만
          클라우드로 갑니다.
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
            {mode === "signin" ? "다시 오셨군요" : "시작해볼까요"}
          </h2>
          <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 28 }}>
            {mode === "signin" ? "간편한 소셜 로그인으로 계속하세요" : "1초 만에 회원 가입이 가능합니다"}
          </p>

          {/* 메인 소셜 로그인 세트 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
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
              {oauthBusy === "google" ? "Google 로 이동 중…" : "Google로 계속하기"}
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
                border: "1px solid #050505",
                background: "#050505",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: oauthBusy ? "wait" : "pointer",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                transform: oauthBusy === "apple" ? "scale(0.98)" : "none",
                opacity: oauthBusy && oauthBusy !== "apple" ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.background = "#151515";
                  e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)";
                }
              }}
              onMouseLeave={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.background = "#050505";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
                }
              }}
            >
              <svg
                aria-hidden
                width="15"
                height="18"
                viewBox="0 0 170 170"
                fill="currentColor"
                style={{ flexShrink: 0 }}
              >
                <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.34.13-9.13-1.92-14.34-6.15-3.23-2.63-7.11-7.25-11.64-13.86-9.74-14.28-14.62-28.77-14.62-43.49 0-14.88 4.41-26.9 13.23-36.05 8.82-9.15 19.34-13.73 31.54-13.73 5.48 0 11.28 1.44 17.41 4.31 6.13 2.88 10.22 4.31 12.27 4.31 1.76 0 5.61-1.33 11.54-3.99 7.42-3.29 13.79-4.7 19.11-4.22 15.62 1.34 27.24 7.21 34.88 17.59-13.54 8.24-20.19 19.5-19.93 33.77.26 11.22 4.54 20.67 12.83 28.36 8.3 7.68 18.06 11.83 29.27 12.44-.73 2.53-1.63 5.26-2.71 8.2zM119.22 30.13c0-7.85 2.76-15.11 8.28-21.78 5.53-6.67 12.28-10.43 20.26-11.27.13.91.2 1.79.2 2.64 0 7.55-2.82 14.75-8.48 21.61-5.66 6.85-12.44 10.66-20.36 11.42-.39-1.04-.62-1.95-.62-2.62z" />
              </svg>
              {oauthBusy === "apple" ? "Apple 로 이동 중…" : "Apple로 계속하기"}
            </button>
          </div>

          {/* 구분 분할 선 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "24px 0",
              fontSize: 12,
              color: "var(--b-fg-4)",
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--b-line)" }} />
            <span>또는 다른 서비스로 계속하기</span>
            <div style={{ flex: 1, height: 1, background: "var(--b-line)" }} />
          </div>

          {/* 보조 소셜 로그인 서클 버튼 세트 */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 18,
              marginBottom: 24,
            }}
          >
            {/* Kakao */}
            <button
              type="button"
              onClick={handleKakao}
              disabled={oauthBusy !== null}
              title="카카오 계정으로 계속하기"
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#FEE500",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: oauthBusy ? "wait" : "pointer",
                transition: "all 0.2s ease",
                boxShadow: "0 2px 10px rgba(254, 229, 0, 0.15)",
                opacity: oauthBusy && oauthBusy !== "kakao" ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "translateY(-2px) scale(1.05)";
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(254, 229, 0, 0.35)";
                }
              }}
              onMouseLeave={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 2px 10px rgba(254, 229, 0, 0.15)";
                }
              }}
            >
              <svg
                aria-hidden
                width="18"
                height="18"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0 }}
              >
                <path
                  fill="#191919"
                  d="M12 3C6.48 3 2 6.48 2 10.8c0 2.75 1.85 5.16 4.63 6.55l-1.18 4.34c-.05.19.05.39.23.47.06.03.13.04.2.04.13 0 .26-.05.36-.13l5.07-3.36c.23.02.46.04.69.04 5.52 0 10-3.48 10-7.8S17.52 3 12 3z"
                />
              </svg>
            </button>

            {/* Naver */}
            <button
              type="button"
              onClick={handleNaver}
              disabled={oauthBusy !== null}
              title="네이버 계정으로 계속하기"
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#03C75A",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                cursor: oauthBusy ? "wait" : "pointer",
                transition: "all 0.2s ease",
                boxShadow: "0 2px 10px rgba(3, 199, 90, 0.15)",
                opacity: oauthBusy && oauthBusy !== "naver" ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "translateY(-2px) scale(1.05)";
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(3, 199, 90, 0.35)";
                }
              }}
              onMouseLeave={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 2px 10px rgba(3, 199, 90, 0.15)";
                }
              }}
            >
              <svg
                aria-hidden
                width="14"
                height="14"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                style={{ fill: "currentColor", flexShrink: 0 }}
              >
                <path d="M16.2 2H22v20h-5.8L7.8 8.6V22H2V2h5.8l8.4 13.4V2z" />
              </svg>
            </button>

            {/* LINE */}
            <button
              type="button"
              onClick={handleLine}
              disabled={oauthBusy !== null}
              title="라인 계정으로 계속하기"
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#06C755",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                cursor: oauthBusy ? "wait" : "pointer",
                transition: "all 0.2s ease",
                boxShadow: "0 2px 10px rgba(6, 199, 85, 0.15)",
                opacity: oauthBusy && oauthBusy !== "line" ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "translateY(-2px) scale(1.05)";
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(6, 199, 85, 0.35)";
                }
              }}
              onMouseLeave={(e) => {
                if (!oauthBusy) {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 2px 10px rgba(6, 199, 85, 0.15)";
                }
              }}
            >
              <svg
                aria-hidden
                width="18"
                height="18"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                style={{ fill: "currentColor", flexShrink: 0 }}
              >
                <path d="M12 2C6.48 2 2 5.58 2 10c0 3.96 3.6 7.26 8.5 7.82l-1.1 3.88c-.06.2.04.4.24.48.06.02.12.02.18.02.14 0 .28-.06.36-.16l4.62-4.66C19.78 16.56 22 13.5 22 10c0-4.42-4.48-8-10-8zm-2.8 11.2H7.6V6.8h1.6v6.4zm4.4 0h-1.6v-3.2h-1.2v3.2H9.2v-6.4h1.6v1.6h1.2v-1.6h1.6v6.4zm4.8-4.8h-1.6v3.2h-1.2v-3.2H14v6.4h4.4v-1.6h-2.8v-1.6h2.8v-3.2z" />
              </svg>
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
            계속하시면{" "}
            <a
              href="#/terms"
              style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}
            >
              이용약관
            </a>
            과{" "}
            <a
              href="#/privacy"
              style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}
            >
              개인정보 처리방침
            </a>
            에 동의하게 됩니다.
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
                처음이신가요?{" "}
                <a
                  href="#/signup"
                  style={{ color: "var(--b-sig)", fontWeight: 600, textDecoration: "none" }}
                >
                  가입하기
                </a>
              </>
            ) : (
              <>
                이미 계정이 있나요?{" "}
                <a
                  href="#/login"
                  style={{ color: "var(--b-sig)", fontWeight: 600, textDecoration: "none" }}
                >
                  로그인
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
  const m =
    os === "mac"
      ? {
          name: "macOS",
          file: "Barosit-0.1.0.dmg",
          size: "38 MB",
          req: "macOS 12.0 (Monterey) 이상 · Apple Silicon · Intel",
          other: "Windows",
          otherUrl: "#/download/win",
          installSecond: "응용 프로그램 폴더로 옮겨요",
        }
      : {
          name: "Windows",
          file: "Barosit-Setup-0.1.0.exe",
          size: "42 MB",
          req: "Windows 10 64-bit 이상 · x64 · ARM64",
          other: "macOS",
          otherUrl: "#/download/mac",
          installSecond: "안내에 따라 설치해요",
        };
  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav active="다운로드" />
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
              {m.name.toUpperCase()} 다운로드
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
              {m.name}용 Barosit
            </h1>
            <div className="b-num" style={{ fontSize: 13, color: "var(--b-fg-3)" }}>
              버전 0.1.0 · {m.size}
            </div>
          </div>
        </div>

        <button
          className="b-btn b-btn-primary"
          style={{ height: 52, padding: "0 28px", fontSize: 15, marginBottom: 14 }}
        >
          <Icon name="arrow-r" size={15} /> {m.file} 다운로드
        </button>
        <div style={{ fontSize: 12, color: "var(--b-fg-4)", marginBottom: 36 }}>
          다운로드 시{" "}
          <a style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}>
            이용약관
          </a>
          과{" "}
          <a style={{ color: "var(--b-fg-3)", textDecoration: "underline" }}>
            프라이버시 정책
          </a>
          에 동의하게 됩니다.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            marginBottom: 36,
          }}
        >
          <MiniCard title="시스템 요구사항" icon="cpu">
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
              내장 카메라 또는 USB 웹캠 필요. 측면에서 잡히도록 두면 정확도가 가장
              높아요.
            </div>
          </MiniCard>
          <MiniCard title="설치 방법" icon="info">
            <ol
              style={{
                fontSize: 13,
                color: "var(--b-fg-2)",
                paddingLeft: 18,
                margin: 0,
                lineHeight: 1.8,
              }}
            >
              <li>다운로드한 파일을 열어요</li>
              <li>{m.installSecond}</li>
              <li>처음 실행 시 카메라 권한을 허용해요</li>
            </ol>
          </MiniCard>
        </div>

        <MiniCard title="0.1.0 — 첫 빌드" icon="sparkle">
          <ul
            style={{
              fontSize: 13,
              color: "var(--b-fg-2)",
              paddingLeft: 18,
              margin: 0,
              lineHeight: 1.8,
            }}
          >
            <li>자세 4종 감지 (거북목 · 턱 괴임 · 어깨 기울임 · 등 구부정)</li>
            <li>0–100 점수 시스템 + 스트레칭 보너스</li>
            <li>위젯 모드 (드래그·위치 저장)</li>
            <li>다크 모드 · 시그니처 sage</li>
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
            전체 릴리스 노트 <Icon name="chev-r" size={11} />
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
              {m.other}를 쓰시나요?
            </div>
            <div style={{ fontSize: 12, color: "var(--b-fg-3)" }}>
              {m.other}용 빌드도 준비되어 있어요
            </div>
          </div>
          <a
            href={m.otherUrl}
            className="b-btn b-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            {m.other} 버전 <Icon name="arrow-r" size={12} />
          </a>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ───────── Pricing ─────────

function Pricing() {
  return (
    <div style={{ background: "var(--b-bg)", minHeight: "100vh" }}>
      <TopNav active="가격" />
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "70px 56px" }}>
        <div style={{ textAlign: "center", marginBottom: 50 }}>
          <h1
            style={{
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              marginBottom: 14,
              lineHeight: 1.1,
            }}
          >
            간단한 가격, 평생 무료 시작
          </h1>
          <p style={{ fontSize: 16, color: "var(--b-fg-2)" }}>
            자세 감지의 핵심은 평생 무료입니다. Pro는 다기기 동기화와 리포트만
            추가해요.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            {
              name: "Free",
              price: "0원",
              sub: "평생 무료",
              feats: [
                "자세 4종 감지",
                "0–100 점수",
                "위젯 모드",
                "오늘의 통계",
                "실루엣/영상 모드",
                "온디바이스 100%",
              ],
              cta: "무료로 시작",
              primary: false,
            },
            {
              name: "Pro",
              price: "월 5,900원",
              sub: "연간 결제 시 월 4,900원",
              feats: [
                "Free의 모든 기능",
                "다기기 점수 동기화",
                "주간/월간 리포트 이메일",
                "AI 코칭 메시지 (한 줄)",
                "90일 → 무제한 기록",
                "우선 지원",
              ],
              cta: "Pro 시작하기",
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
                  추천
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
              <button
                className={`b-btn ${p.primary ? "b-btn-primary" : "b-btn-ghost"}`}
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
      </div>
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
}: {
  user: import("@supabase/supabase-js").User | null;
}) {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    "";
  const avatarUrl = (meta.avatar_url as string | undefined) ?? null;
  const provider =
    ((user?.app_metadata as Record<string, unknown> | undefined)?.provider as
      | string
      | undefined) ?? "—";
  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("ko-KR")
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
        계정
      </h2>
      <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 28 }}>
        소셜 로그인 정보를 보여드려요. 표시 이름·아바타 편집은 곧 지원할 예정이에요.
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
              {fullName || user?.email || "사용자"}
            </div>
            <div style={{ fontSize: 12, color: "var(--b-fg-3)" }}>
              {provider === "google"
                ? "Google 로 로그인됨"
                : provider === "—"
                  ? "로그인 정보 없음"
                  : `${provider} 로 로그인됨`}
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
                background: "var(--b-surface-2)",
                color: "var(--b-fg-2)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              FREE
            </span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <ReadOnlyField label="표시 이름" value={fullName} />
          <ReadOnlyField label="이메일" value={user?.email ?? ""} />
          <ReadOnlyField label="로그인 방식" value={provider} />
          <ReadOnlyField label="가입일" value={createdAt} />
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
        BaroSit 은 비밀번호 가입을 사용하지 않습니다. 소셜 로그인 또는 이메일 매직링크로
        로그인하세요. 계정 삭제·데이터 내려받기는{" "}
        <a
          href="#/contact"
          style={{ color: "var(--b-sig-deep)", textDecoration: "underline" }}
        >
          문의
        </a>
        로 요청 주시면 처리해드립니다.
      </div>
    </>
  );
}

function PlanTab() {
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
        플랜과 결제
      </h2>
      <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 28 }}>
        구독 상태와 결제 수단을 관리합니다.
      </p>

      <div
        style={{
          padding: 24,
          borderRadius: 14,
          marginBottom: 14,
          background: "linear-gradient(135deg, var(--b-sig-bg) 0%, var(--b-bg) 100%)",
          border: "1px solid var(--b-sig-soft)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <span
              className="b-chip"
              style={{
                background: "var(--b-sig)",
                color: "#fff",
                borderColor: "transparent",
                marginBottom: 12,
              }}
            >
              현재 플랜 · PRO
            </span>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.024em",
                marginBottom: 4,
                marginTop: 12,
              }}
            >
              월 5,900원
            </div>
            <div style={{ fontSize: 13, color: "var(--b-fg-3)" }}>
              다음 결제일 · 2026년 6월 11일
            </div>
          </div>
          <button className="b-btn b-btn-ghost">결제수단 변경</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button className="b-btn b-btn-ghost" style={{ color: "var(--b-fg-3)" }}>
            연간으로 변경 (2개월 무료)
          </button>
          <button className="b-btn b-btn-quiet" style={{ color: "var(--b-warn)" }}>
            플랜 취소
          </button>
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
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>이번 달 사용</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { k: "모니터링 시간", v: "128h", s: "+12% 지난 달" },
            { k: "활성 일수", v: "24일", s: "한 달 중" },
            { k: "평균 점수", v: "78", s: "+6 지난 달" },
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
          결제 내역
        </div>
        {[
          { d: "2026.05.11", a: "5,900원", s: "결제 완료" },
          { d: "2026.04.11", a: "5,900원", s: "결제 완료" },
          { d: "2026.03.11", a: "5,900원", s: "결제 완료" },
        ].map((r, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 4px",
              borderBottom: "1px solid var(--b-line)",
            }}
          >
            <span className="b-num" style={{ fontSize: 13, color: "var(--b-fg-2)" }}>
              {r.d}
            </span>
            <span
              className="b-num"
              style={{ fontSize: 13, marginLeft: "auto", marginRight: 18, fontWeight: 600 }}
            >
              {r.a}
            </span>
            <span
              className="b-chip"
              style={{
                background: "var(--b-sig-bg)",
                color: "var(--b-sig-deep)",
                borderColor: "var(--b-sig-soft)",
              }}
            >
              {r.s}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function ProfileLoading() {
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
      불러오는 중…
    </div>
  );
}

function Profile() {
  const { user, loading, configured, signOut } = useAuth();
  const [tab, setTab] = useState<"account" | "plan">("account");

  useEffect(() => {
    if (!loading && configured && !user) {
      window.location.replace("#/login");
    }
  }, [loading, configured, user]);

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
            인증이 아직 연결되지 않았어요
          </h2>
          <p style={{ fontSize: 13, color: "var(--b-fg-3)", marginBottom: 20 }}>
            <code>.env.local</code> 의 <code>VITE_SUPABASE_URL</code> /{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> 를 채우고 다시 시작하세요. 자세한 셋업은{" "}
            <code>docs/auth-google-setup.md</code> 참고.
          </p>
          <a
            href="#/landing"
            className="b-btn b-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            랜딩으로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  if (loading || !user) return <ProfileLoading />;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    "";
  const avatarUrl = (meta.avatar_url as string | undefined) ?? null;
  const sidebarInitial = (fullName || user.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    window.location.replace("#/landing");
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
                {fullName || user.email || "사용자"}
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
                { k: "account", i: "settings", t: "계정" },
                { k: "plan", i: "sparkle", t: "플랜과 결제" },
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
              <Icon name="arrow-r" size={13} /> 로그아웃
            </button>
          </div>
        </div>

        <div>
          {tab === "account" && <AccountTab user={user} />}
          {tab === "plan" && <PlanTab />}
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
  | "pricing"
  | "profile"
  | "privacy"
  | "terms"
  | "community"
  | "auth-callback";

export function routeFromHash(hash: string): MarketingRoute | null {
  const h = hash.replace(/^#\/?/, "").split("?")[0];
  if (h === "landing") return "landing";
  if (h === "login") return "login";
  if (h === "signup") return "signup";
  if (h === "download/mac") return "download-mac";
  if (h === "download/win") return "download-win";
  if (h === "pricing") return "pricing";
  if (h === "profile" || h === "account") return "profile";
  if (h === "privacy") return "privacy";
  if (h === "terms") return "terms";
  if (h === "community" || h === "contact" || h === "support") return "community";
  if (h === "auth/callback") return "auth-callback";
  return null;
}

function routeBody(route: MarketingRoute) {
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
    case "pricing":
      return <Pricing />;
    case "profile":
      return <Profile />;
    case "privacy":
      return <LegalPage kind="privacy" />;
    case "terms":
      return <LegalPage kind="terms" />;
    case "community":
      return <Contact />;
    case "auth-callback":
      return <AuthCallback />;
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

export function Marketing({ route }: { route: MarketingRoute }) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    (window as any).showContactToast = () => {
      setToastMessage("이메일 주소(support@barosit.com)가 복사되었습니다.");
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
      {routeBody(route)}

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
