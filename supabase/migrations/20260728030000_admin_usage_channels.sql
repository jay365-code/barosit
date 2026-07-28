-- 유입 채널 집계를 서버로 이관.
--
-- 어드민은 usage_events 를 `order by created_at desc limit 2000` 으로 끌어와
-- 클라이언트에서 집계했다. 이벤트가 늘수록 그 2000건이 덮는 **기간**이 짧아지므로,
-- 2주 전 캠페인은 표에서 행 자체가 사라진다. 0 으로 보이는 것도 아니고 경고도 없어
-- "그 채널은 반응이 없었다"로 오해하기 쉽다.
--
-- 집계를 Postgres 에서 하면 상한이 사라지고 기간을 잘라 보는 것도 가능해진다.
-- created_at 인덱스(idx_usage_events_created)가 이미 있어 범위 스캔이 싸다.
--
-- ⚠ usage_events 는 어드민만 읽을 수 있는 테이블이므로 여기서도 is_admin() 을
-- 본문 첫 줄에서 검사한다. EXECUTE 는 authenticated 에게만(anon 제외).

CREATE OR REPLACE FUNCTION public.admin_usage_channels(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    source    TEXT,
    campaign  TEXT,
    views     BIGINT,
    cta       BIGINT,
    opened    BIGINT,
    activated BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION '권한이 없습니다 (관리자 전용).';
    END IF;

    RETURN QUERY
    WITH scoped AS (
        SELECT
            COALESCE(e.props->>'acq_source', '')   AS src,
            COALESCE(e.props->>'acq_campaign', '') AS cmp,
            e.event,
            e.install_id
        FROM public.usage_events e
        WHERE (p_from IS NULL OR e.created_at >= p_from)
          AND (p_to   IS NULL OR e.created_at <  p_to)
    ),
    grouped AS (
        SELECT
            s.src::TEXT AS source,
            -- 출처를 모르면 캠페인도 의미가 없다(클라이언트 캡처 규칙과 동일).
            (CASE WHEN s.src = '' THEN '' ELSE s.cmp END)::TEXT AS campaign,
            count(*) FILTER (WHERE s.event = 'landing_view')                            AS views,
            count(*) FILTER (WHERE s.event = 'landing_cta_clicked')                     AS cta,
            count(DISTINCT s.install_id) FILTER (WHERE s.event = 'app_opened')          AS opened,
            count(DISTINCT s.install_id) FILTER (WHERE s.event = 'calibration_succeeded') AS activated
        FROM scoped s
        GROUP BY 1, 2
    )
    SELECT g.source, g.campaign, g.views, g.cta, g.opened, g.activated
    FROM grouped g
    WHERE g.views + g.cta + g.opened + g.activated > 0
    ORDER BY g.activated DESC, g.views DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_usage_channels(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_usage_channels(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_usage_channels(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
