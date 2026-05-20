import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const IS_WEB = process.env.VITE_PLATFORM === "web";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Tauri 전용 dev 서버 설정 — 웹 빌드에서는 기본값 사용
  clearScreen: IS_WEB ? true : false,
  server: IS_WEB
    ? {
        port: 1430,
        strictPort: true,
        host: "0.0.0.0",
        watch: {
          usePolling: true,
          ignored: ["**/src-tauri/**"],
        },
      }
    : {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
          ? {
              protocol: "ws",
              host,
              port: 1421,
            }
          : undefined,
        watch: {
          // tell Vite to ignore watching `src-tauri`
          ignored: ["**/src-tauri/**"],
        },
      },
  define: {
    "import.meta.env.VITE_PLATFORM": JSON.stringify(IS_WEB ? "web" : "tauri"),
  },
}));
