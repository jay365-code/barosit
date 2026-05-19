// 테마 모드 — auto(OS 따라감) / light / dark.
// auto일 때도 JS가 직접 OS scheme을 읽어 <html data-theme> 를 명시 설정한다.
// 미디어 쿼리만 의존하면 일부 dev/HMR 환경에서 갱신 누락 위험.

export type ThemeMode = "auto" | "light" | "dark";

const STORAGE_KEY = "theme_mode";

export function loadThemeMode(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "auto";
}

export function saveThemeMode(mode: ThemeMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  applyThemeMode(mode);
}

function resolvedTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "auto") return mode;
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyThemeMode(mode: ThemeMode = loadThemeMode()): void {
  document.documentElement.setAttribute("data-theme", resolvedTheme(mode));
}

// OS 시스템 테마가 바뀌면 auto 모드일 때 자동 반영
let mediaListenerAttached = false;
export function watchOsTheme(): void {
  if (mediaListenerAttached) return;
  if (typeof window === "undefined" || !window.matchMedia) return;
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if (loadThemeMode() === "auto") applyThemeMode("auto");
  };
  mql.addEventListener("change", handler);
  mediaListenerAttached = true;
}
