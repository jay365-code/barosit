/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM?: "web" | "desktop";
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_AUTH_REDIRECT_BASE?: string;
  readonly VITE_LAUNCH_MODE?: "beta_free" | "paid";
  readonly VITE_TOSS_CLIENT_KEY?: string;
  readonly PACKAGE_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}
