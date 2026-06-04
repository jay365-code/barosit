// 약관·개인정보 처리방침을 앱 내 모달로 표시. docs/*.md 를 Vite 의 ?raw
// import 로 가져와 react-markdown 으로 렌더. 외부 GitHub 페이지로 이탈 없이
// 같은 앱 안에서 읽고 닫을 수 있게.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import privacyMd from "../../docs/privacy.md?raw";
import termsMd from "../../docs/terms.md?raw";
import { Icon } from "./Icon";
import { interpolateLegalTemplate } from "../lib/legal";

export type LegalDocKind = "privacy" | "terms";

interface Props {
  kind: LegalDocKind;
  onClose: () => void;
}

const SOURCE: Record<LegalDocKind, string> = {
  privacy: privacyMd,
  terms: termsMd,
};

export function LegalDocument({ kind, onClose }: Props) {
  const { t, i18n } = useTranslation("legal");
  const md = useMemo(() => interpolateLegalTemplate(SOURCE[kind]), [kind]);
  // 법적 본문은 한국어 정본만 유지 — ko 외 언어에서는 상단 안내 배너 표시
  const showLangNotice = i18n.language !== "ko";

  return (
    <div className="b-overlay" onClick={onClose}>
      <div
        className="b-modal b-legal-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="b-legal-header">
          <h2 className="b-legal-title">
            {kind === "privacy" ? t("titlePrivacy") : t("titleTerms")}
          </h2>
          <button
            type="button"
            className="b-legal-close"
            aria-label={t("close")}
            onClick={onClose}
          >
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="b-legal-body">
          {showLangNotice && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "12px 16px",
                marginBottom: 16,
                borderRadius: 10,
                background: "var(--b-sig-bg)",
                border: "1px solid var(--b-sig-soft)",
                fontSize: 13,
                color: "var(--b-fg-2)",
                lineHeight: 1.5,
              }}
            >
              <Icon name="info" size={15} style={{ color: "var(--b-sig)", marginTop: 1, flexShrink: 0 }} />
              <span>{t("langNotice")}</span>
            </div>
          )}
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
                        alert(t("refundAlert"));
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
      </div>
    </div>
  );
}
