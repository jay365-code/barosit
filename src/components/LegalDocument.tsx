// 약관·개인정보 처리방침을 앱 내 모달로 표시. docs/*.md 를 Vite 의 ?raw
// import 로 가져와 react-markdown 으로 렌더. 외부 GitHub 페이지로 이탈 없이
// 같은 앱 안에서 읽고 닫을 수 있게.

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import privacyMd from "../../docs/privacy.md?raw";
import termsMd from "../../docs/terms.md?raw";
import { Icon } from "./Icon";

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
  const md = useMemo(() => SOURCE[kind], [kind]);

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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
