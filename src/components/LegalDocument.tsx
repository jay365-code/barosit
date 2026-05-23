// 약관·개인정보 처리방침을 앱 내 모달로 표시. docs/*.md 를 Vite 의 ?raw
// import 로 가져와 react-markdown 으로 렌더. 외부 GitHub 페이지로 이탈 없이
// 같은 앱 안에서 읽고 닫을 수 있게.

import { useMemo } from "react";
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

const TITLE: Record<LegalDocKind, string> = {
  privacy: "개인정보 처리방침",
  terms: "이용약관",
};

const SOURCE: Record<LegalDocKind, string> = {
  privacy: privacyMd,
  terms: termsMd,
};

export function LegalDocument({ kind, onClose }: Props) {
  const md = useMemo(() => interpolateLegalTemplate(SOURCE[kind]), [kind]);

  return (
    <div className="b-overlay" onClick={onClose}>
      <div
        className="b-modal b-legal-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="b-legal-header">
          <h2 className="b-legal-title">{TITLE[kind]}</h2>
          <button
            type="button"
            className="b-legal-close"
            aria-label="닫기"
            onClick={onClose}
          >
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="b-legal-body">
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
                        alert(
                          `[BaroSit 구독 요금 및 환불 정책 요약]\n\n` +
                          `1. 청약철회 (결제 후 7일 이내):\n` +
                          ` - 서비스 이용 이력이 없는 경우, 결제 수수료 공제 없이 100% 전액 환불\n\n` +
                          `2. 중도 환불 및 해지 (이용 이력이 있거나 7일 경과):\n` +
                          ` - 월간 구독: 당월 잔여 기간까지 이용 후 다음 결제일에 정기 결제 자동 종료 (권장)\n` +
                          ` - 중도 즉시 환불: 결제 대금의 10% 위약금 및 이용 일수(일일 300원) 공제 후 잔액 환불\n` +
                          ` - 연간 구독 중도 즉시 환불: 연간 할인혜택이 소급 소멸되며, 이용 일수(정가 기준 일할 계산) 및 10% 위약금 공제 후 잔액 환불\n\n` +
                          `3. 환불 신청 및 문의:\n` +
                          ` - 프로필 메뉴 [구독 관리 -> 환불/구독 해지 신청] 이용\n` +
                          ` - 또는 대표 CS 이메일 (support@barosit.com)로 접수`
                        );
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
