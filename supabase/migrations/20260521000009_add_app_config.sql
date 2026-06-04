-- Database Migration: app_config (global runtime config, e.g. launch_mode)
-- 런치 모드 토글(베타무료↔유료)을 원격에서 즉시 전환하기 위한 전역 설정 테이블.
-- 읽기는 누구나(부팅 시 로그인 전에도 필요), 쓰기는 어드민만.

CREATE TABLE IF NOT EXISTS public.app_config (
    key        TEXT PRIMARY KEY,
    value      JSONB,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- 읽기: 익명 포함 누구나 (런치 모드는 부팅 시 비로그인 상태에서도 읽어야 함)
DROP POLICY IF EXISTS "Anyone can read app_config" ON public.app_config;
CREATE POLICY "Anyone can read app_config" ON public.app_config
    FOR SELECT USING (true);

-- 쓰기: 어드민만 (is_admin() 은 20260521000001 에서 정의됨)
DROP POLICY IF EXISTS "Admins manage app_config" ON public.app_config;
CREATE POLICY "Admins manage app_config" ON public.app_config
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 기본값 시드: 안전하게 'paid' (베타 전환은 관리자가 명시적으로 수행)
INSERT INTO public.app_config (key, value)
VALUES ('launch_mode', '"paid"'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.app_config IS '전역 런타임 설정. launch_mode = ''beta_free'' | ''paid''.';
