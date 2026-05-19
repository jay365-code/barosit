import type { AppMode } from "./types";

// 플랫폼 공통 localStorage 헬퍼. 웹/Tauri 양쪽에서 동일하게 동작.

const APP_MODE_KEY = "app_mode";
const MINIBAR_KEY = "minibar_visible";

export function loadAppMode(): AppMode {
  const v = localStorage.getItem(APP_MODE_KEY);
  return v === "widget" ? "widget" : "main";
}

export function saveAppMode(mode: AppMode): void {
  localStorage.setItem(APP_MODE_KEY, mode);
  window.dispatchEvent(
    new CustomEvent("app-mode-change", { detail: mode }),
  );
}

export function isMinibarVisible(): boolean {
  return localStorage.getItem(MINIBAR_KEY) !== "0";
}

export function setMinibarVisible(visible: boolean): void {
  localStorage.setItem(MINIBAR_KEY, visible ? "1" : "0");
}
