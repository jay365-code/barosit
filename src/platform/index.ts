import { tauriPlatform } from "./tauri";
import { webPlatform } from "./web";
import type { PlatformAPI } from "./types";

/** 빌드 타임에 `VITE_PLATFORM=web` 으로 빌드하면 web stub을 사용.
 *  Vite가 `import.meta.env.VITE_PLATFORM` 을 빌드 시 치환하므로
 *  사용하지 않는 쪽은 트리쉐이킹됨. */
export const IS_WEB =
  (import.meta.env.VITE_PLATFORM as string | undefined) === "web" ||
  (typeof window !== "undefined" && !(window as any).__TAURI_INTERNALS__ && !(window as any).__TAURI__);

export const platform: PlatformAPI = IS_WEB ? webPlatform : tauriPlatform;

export * from "./types";
export * from "./storage";
