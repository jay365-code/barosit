import { useState } from "react";
import { useTranslation } from "react-i18next";
import { loadLang, saveLang } from "../i18n/lang";
import { SUPPORTED_LANGS, type Lang } from "../i18n";

const AUTONYM: Record<Lang, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
};

interface Props {
  /** nav: 헤더용 컴팩트 드롭다운(기본) / inline: 본문/푸터용 */
  variant?: "nav" | "inline";
  style?: React.CSSProperties;
}

/**
 * 재사용 언어 선택기. 선택은 saveLang을 통해 barosit_lang(localStorage)에 저장되고
 * 웹에서는 ?lang= 쿼리에도 반영된다 → 마케팅에서 고른 언어가 앱까지 이어진다.
 * 네이티브 <select> 기반이라 키보드/스크린리더 접근성이 보장된다.
 */
export function LanguageSelect({ variant = "nav", style }: Props) {
  // useTranslation 구독으로 언어 변경 시 현재 선택 표시가 갱신됨
  useTranslation();
  const [lang, setLang] = useState<Lang>(() => loadLang());

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as Lang;
    setLang(next);
    void saveLang(next);
  };

  const compact = variant === "nav";
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: compact ? 13 : 12,
        color: "var(--b-fg-2)",
        cursor: "pointer",
        ...style,
      }}
    >
      <span aria-hidden style={{ fontSize: compact ? 14 : 13 }}>
        🌐
      </span>
      <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <select
          aria-label="Language"
          value={lang}
          onChange={onChange}
          style={{
            appearance: "none",
            WebkitAppearance: "none",
            background: "transparent",
            border: "none",
            color: "inherit",
            font: "inherit",
            fontWeight: 600,
            cursor: "pointer",
            paddingRight: 16,
          }}
        >
          {SUPPORTED_LANGS.map((l) => (
            <option key={l} value={l}>
              {AUTONYM[l]}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: 2,
            pointerEvents: "none",
            fontSize: 9,
            opacity: 0.6,
          }}
        >
          ▾
        </span>
      </span>
    </label>
  );
}
