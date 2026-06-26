-- 측정(활성화 퍼널/재방문) — 익명 사용 분석
-- 영상·자세데이터·PII 없음. 익명 install_id 로 여정만 추적.
--   - 적재: track_usage() RPC (anon/authenticated, SECURITY DEFINER)
--   - 조회: 어드민만 (RLS)
-- client_errors 와 동일 패턴.

CREATE TABLE IF NOT EXISTS public.usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    install_id TEXT NOT NULL,          -- 익명 설치 단위 식별자(여정 stitch용)
    user_id UUID,                      -- 로그인 시에만(선택)
    event TEXT NOT NULL,               -- 'app_opened' | 'onboarding_completed' | 'calibration_succeeded' | 'calibration_failed' | ...
    client VARCHAR(20),                -- 'desktop' | 'web'
    app_version TEXT,
    lang VARCHAR(10),
    props JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_events_created ON public.usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_event ON public.usage_events(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_install ON public.usage_events(install_id);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage usage_events" ON public.usage_events
    FOR ALL USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.track_usage(
    p_install_id TEXT,
    p_event TEXT,
    p_client TEXT,
    p_app_version TEXT,
    p_lang TEXT,
    p_props JSONB
) RETURNS VOID AS $$
BEGIN
    IF p_install_id IS NULL OR p_event IS NULL THEN
        RETURN;
    END IF;
    INSERT INTO public.usage_events (install_id, user_id, event, client, app_version, lang, props)
    VALUES (
        LEFT(p_install_id, 64),
        auth.uid(),
        LEFT(p_event, 64),
        p_client,
        p_app_version,
        p_lang,
        COALESCE(p_props, '{}'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.track_usage(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
