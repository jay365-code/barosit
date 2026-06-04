import { defineConfig } from "vitest/config";

// 단위 테스트 전용 설정 (vite.config.ts 의 Tauri/web 분기와 분리)
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
