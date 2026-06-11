import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./package.json"), "utf-8"));
const PACKAGE_VERSION = pkg.version;

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const IS_WEB = process.env.VITE_PLATFORM === "web";

// ─── dev 전용 OAuth loopback relay ──────────────────────────────────────
//
// macOS 에서 `tauri dev` 인스턴스는 barosit:// 스킴을 받을 수 없음 (스킴은
// 번들된 .app 에만 등록되어 설치본 /Applications/BaroSit.app 으로 라우팅).
// 그래서 dev 에선 deep-link 대신 이 relay 가 OAuth 콜백을 중계:
//   외부 브라우저 → GoTrue → GET /__dev-auth-relay?code=… (여기 저장)
//   Tauri webview(useAuth) → GET /__dev-auth-relay/poll 폴링 → code 수신
// apply:"serve" 라 production 빌드엔 포함되지 않음.
function devAuthRelay() {
  let lastCallbackQuery: string | null = null;

  // production bridge 페이지(public/desktop-auth-redirect.html)의 디자인
  // (자세 교정 SVG 애니메이션 포함)을 재사용 — barosit:// redirect 스크립트만
  // 제거하고 문구를 relay 상황에 맞게 치환. 디자인 원본은 한 곳에서 관리.
  function renderRelayPage(isError: boolean): string {
    try {
      const html = fs.readFileSync(
        path.resolve(__dirname, "public/desktop-auth-redirect.html"),
        "utf-8",
      );
      const heading = isError ? "로그인이 완료되지 않았습니다" : "로그인 처리 완료";
      const body = isError
        ? "BaroSit 앱에서 다시 시도해주세요.<br>이 탭은 닫아도 됩니다."
        : "BaroSit 앱으로 자동 로그인됩니다.<br>이 탭은 닫아도 됩니다.";
      return html
        .replace(/<script>[\s\S]*?<\/script>/g, "")
        .replace(/<title>[\s\S]*?<\/title>/, `<title>BaroSit — ${heading}</title>`)
        .replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${heading}</h1>`)
        .replace(/<p>[\s\S]*?<\/p>/, `<p>${body}</p>`);
    } catch {
      // bridge 파일을 못 읽어도 relay 기능은 유지 — 최소 안내만.
      return "<!doctype html><meta charset='utf-8'><body style='font-family:sans-serif;text-align:center;padding-top:20vh'><h2>로그인 처리 완료</h2><p>BaroSit 앱으로 돌아가세요.</p></body>";
    }
  }

  return {
    name: "dev-auth-relay",
    apply: "serve" as const,
    configureServer(server: { middlewares: { use: (path: string, fn: (req: any, res: any) => void) => void } }) {
      server.middlewares.use("/__dev-auth-relay", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname === "/poll") {
          const query = lastCallbackQuery;
          lastCallbackQuery = null; // 1회성 전달 — stale 재사용 방지
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ query }));
          return;
        }
        const qs = url.search.replace(/^\?/, "");
        if (qs) lastCallbackQuery = qs;
        const isError = url.searchParams.has("error") || url.searchParams.has("error_description");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderRelayPage(isError));
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), devAuthRelay()],

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
    "import.meta.env.PACKAGE_VERSION": JSON.stringify(PACKAGE_VERSION),
  },
}));
