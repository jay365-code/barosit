-- OPS-1 (2): 클라이언트 에러/크래시 리포트 수집
-- admin_notifications 와 분리한 전용 테이블. 에러는 양이 많을 수 있어
-- fingerprint 로 묶어 같은 에러는 행 1개 + count 증가로 집계(피드 오염 방지).
--   - 적재 경로: report_client_error() RPC (anon/authenticated 실행 허용, SECURITY DEFINER)
--   - 조회/관리: 어드민만 (RLS)

CREATE TABLE IF NOT EXISTS public.client_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint TEXT NOT NULL UNIQUE,            -- kind+메시지 첫줄+top stack frame 해시
    kind VARCHAR(20) NOT NULL DEFAULT 'unknown', -- 'react' | 'window' | 'promise'
    severity VARCHAR(20) NOT NULL DEFAULT 'error',
    message TEXT NOT NULL,
    stack TEXT,
    route TEXT,
    app_version TEXT,
    client VARCHAR(20),                          -- 'desktop' | 'web'
    user_agent TEXT,
    lang VARCHAR(10),
    plan VARCHAR(20),
    count INT NOT NULL DEFAULT 1,
    resolved BOOLEAN NOT NULL DEFAULT false,
    last_user_id UUID,
    first_seen TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_errors_last_seen ON public.client_errors(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_unresolved ON public.client_errors(resolved, last_seen DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

-- 어드민만 조회/수정/삭제 (일반/익명은 직접 SELECT 불가 — RPC 로만 적재)
CREATE POLICY "Admins manage client_errors" ON public.client_errors
    FOR ALL USING (public.is_admin());

-- 적재 RPC: 동일 fingerprint 면 count 증가 + 최신화, 없으면 신규 INSERT
CREATE OR REPLACE FUNCTION public.report_client_error(
    p_fingerprint TEXT,
    p_kind TEXT,
    p_message TEXT,
    p_stack TEXT,
    p_route TEXT,
    p_app_version TEXT,
    p_client TEXT,
    p_user_agent TEXT,
    p_lang TEXT,
    p_plan TEXT
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.client_errors (
        fingerprint, kind, message, stack, route, app_version, client, user_agent, lang, plan, last_user_id
    ) VALUES (
        p_fingerprint,
        COALESCE(NULLIF(p_kind, ''), 'unknown'),
        LEFT(COALESCE(p_message, ''), 2000),
        LEFT(p_stack, 6000),
        p_route, p_app_version, p_client, LEFT(p_user_agent, 400), p_lang, p_plan,
        auth.uid()
    )
    ON CONFLICT (fingerprint) DO UPDATE SET
        count = public.client_errors.count + 1,
        last_seen = timezone('utc'::text, now()),
        message = LEFT(COALESCE(p_message, ''), 2000),
        stack = LEFT(p_stack, 6000),
        route = p_route,
        app_version = p_app_version,
        resolved = false,
        last_user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.report_client_error(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;
