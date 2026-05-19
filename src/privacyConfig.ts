const KEY = "privacy_mode";

export function isPrivacyMode(): boolean {
  return localStorage.getItem(KEY) !== "0";
}

export function setPrivacyMode(enabled: boolean): void {
  localStorage.setItem(KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent("privacy-mode-change", { detail: enabled }));
}

export function subscribePrivacyMode(cb: (enabled: boolean) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<boolean>).detail);
  window.addEventListener("privacy-mode-change", handler);
  return () => window.removeEventListener("privacy-mode-change", handler);
}
