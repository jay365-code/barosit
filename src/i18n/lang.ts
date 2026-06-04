// 언어 load/save/apply — themeConfig.ts 패턴을 미러링.
// 단일 진실원: i18next의 language + localStorage(LANG_STORAGE_KEY).
import i18n, { LANG_STORAGE_KEY, SUPPORTED_LANGS, type Lang } from "./index";

function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (SUPPORTED_LANGS as readonly string[]).includes(v);
}

export function loadLang(): Lang {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(LANG_STORAGE_KEY) : null;
  if (isLang(stored)) return stored;
  const current = i18n.language?.split("-")[0];
  return isLang(current) ? current : "en";
}

// 언어 변경 시 트레이/알림 등 네이티브 측에 로컬라이즈 문자열을 밀어넣는 훅.
// Phase 5(Rust 통합)에서 실제 구현이 연결된다. 기본은 no-op.
let trayPush: ((lang: Lang) => void | Promise<void>) | null = null;
export function registerTrayPush(fn: (lang: Lang) => void | Promise<void>): void {
  trayPush = fn;
}

// 웹(마케팅)에서는 ?lang= 쿼리도 갱신해 현재 URL을 공유하면 언어가 유지되게 한다.
// 해시 라우트는 보존하고, history 항목을 늘리지 않도록 replaceState 사용.
function syncLangQueryParam(lang: Lang): void {
  if (import.meta.env.VITE_PLATFORM !== "web") return;
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("lang") === lang) return;
  url.searchParams.set("lang", lang);
  window.history.replaceState(null, "", url.toString());
}

export async function saveLang(lang: Lang): Promise<void> {
  if (typeof localStorage !== "undefined") localStorage.setItem(LANG_STORAGE_KEY, lang);
  await i18n.changeLanguage(lang);
  if (typeof document !== "undefined") document.documentElement.setAttribute("lang", lang);
  syncLangQueryParam(lang);
  if (trayPush) await trayPush(lang);
}
