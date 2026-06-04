// 로케일 JSON을 자동 수집해 i18next resources 형태로 조립.
// src/i18n/locales/<lng>/<ns>.json 을 추가하면 자동 등록된다 — 별도 import 불필요.
// Vite(import.meta.glob)는 tauri/web 빌드 모두 동일하게 처리한다.

type Bundle = Record<string, Record<string, unknown>>;

const modules = import.meta.glob("./locales/*/*.json", { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>;

const resources: Record<string, Bundle> = {};

for (const path in modules) {
  const m = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!m) continue;
  const [, lng, ns] = m;
  (resources[lng] ??= {})[ns] = modules[path].default ?? {};
}

export { resources };
