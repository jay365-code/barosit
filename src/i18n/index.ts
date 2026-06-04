// i18n 초기화 — react-i18next + 브라우저/OS 로케일 감지.
// 로케일 JSON은 resources.ts에서 정적 번들(오프라인 보장, HTTP backend 미사용).
// 감지 순서: 사용자가 저장한 선택(localStorage) → OS/브라우저 로케일 → en 폴백.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { resources } from "./resources";

export const SUPPORTED_LANGS = ["ko", "en", "ja"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const LANG_STORAGE_KEY = "barosit_lang";

export const NAMESPACES = [
  "common",
  "app",
  "posture",
  "coaching",
  "monitor",
  "widget",
  "settings",
  "onboarding",
  "calibration",
  "stretch",
  "pricing",
  "profile",
  "alerts",
  "marketing",
  "errors",
  "notifications",
  "tray",
  "legal",
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LANGS],
    nonExplicitSupportedLngs: true, // ko-KR → ko, en-US → en, ja-JP → ja
    load: "languageOnly",
    defaultNS: "common",
    ns: [...NAMESPACES],
    interpolation: { escapeValue: false }, // React가 이미 이스케이프함
    returnNull: false,
    react: { useSuspense: false },
    detection: {
      // ?lang=en 쿼리(공유 링크) → 저장된 선택 → OS/브라우저 로케일 순
      order: ["querystring", "localStorage", "navigator"],
      lookupQuerystring: "lang",
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ["localStorage"],
      // ko-KR / en-US 등 지역 코드를 base(ko/en/ja)로 정규화해서 저장
      convertDetectedLanguage: (lng) => lng.split("-")[0],
    },
    // 개발 중 누락 키를 콘솔에 경고 (프로덕션 빌드에선 조용히 폴백)
    saveMissing: false,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, ns, key) =>
          console.warn(`[i18n] missing key: ${ns}:${key} (${lngs.join(",")})`)
      : undefined,
  });

// 초기 <html lang> 반영
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("lang", i18n.language || "en");
}

// 멀티 윈도우 동기화 — 다른 창(메인↔위젯↔알림)에서 언어를 바꾸면 storage 이벤트로
// 전달되어 모든 창이 즉시 따라간다. (storage 이벤트는 변경을 일으킨 창에는 안 옴)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== LANG_STORAGE_KEY || !e.newValue) return;
    const lng = e.newValue.split("-")[0];
    if ((SUPPORTED_LANGS as readonly string[]).includes(lng) && lng !== i18n.language) {
      i18n.changeLanguage(lng);
      document.documentElement.setAttribute("lang", lng);
    }
  });
}

export default i18n;
