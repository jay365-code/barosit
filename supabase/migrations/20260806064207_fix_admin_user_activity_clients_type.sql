-- 적용: 2026-08-06 프로덕션(kllcnllkcewnutxodwhx) MCP apply_migration.
--       파일명 버전은 원격에 기록된 자동 타임스탬프에 맞춰 둔 것 — 어긋나면 db push 가 거부된다.
-- admin_user_activity() 반환 타입 불일치 수정 — 이 함수는 도입(20260804030000) 이후
-- **한 번도 성공한 적이 없다.**
--
--   ERROR 42804: structure of query does not match function result type
--   DETAIL: Returned type character varying[] does not match expected type text[] in column 14
--
-- 원인: 선언은 `clients text[]` 인데 `array_agg(DISTINCT e.client)` 는
-- `usage_events.client` 가 `character varying` 이라 `varchar[]` 를 돌려준다.
-- plpgsql 의 RETURN QUERY 는 컬럼 타입을 정확히 대조하므로 varchar[] → text[] 는
-- 암묵 변환 없이 실패한다(스칼라 varchar → text 와 달리 배열은 통과하지 않는다).
--
-- 왜 아무도 못 봤나: 클라이언트(AdminDashboardView.fetchAllData)가 이 RPC 실패를
-- console.warn 으로 삼키고 목록은 그대로 그린다. 그래서 가입자 관리 탭의
-- "최근 활동 / 환경" 열만 조용히 비어 있었다.
--
-- 고친 것은 마지막 컬럼의 `::text[]` 캐스트 한 곳뿐이다. 나머지는 원본과 동일.

CREATE OR REPLACE FUNCTION public.admin_user_activity()
RETURNS TABLE (
    id                      uuid,
    last_seen_at            timestamptz,
    last_seen_source        text,
    last_sign_in_at         timestamptz,
    first_active_on         date,
    last_active_on          date,
    active_days             integer,
    active_days_7d          integer,
    active_days_30d         integer,
    active_days_after_join  integer,
    recent_active_dates     date[],
    os                      text,
    cores                   integer,
    clients                 text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION '권한이 없습니다 (관리자 전용).';
    END IF;

    RETURN QUERY
    WITH
    -- 활동일 = 세 소스의 합집합(운영자 기준 KST 날짜)
    active AS (
        SELECT e.user_id AS uid, (e.created_at  AT TIME ZONE 'Asia/Seoul')::date AS d
          FROM public.usage_events e   WHERE e.user_id IS NOT NULL
        UNION
        SELECT p.user_id,          (p.occurred_at AT TIME ZONE 'Asia/Seoul')::date
          FROM public.posture_events p
        UNION
        SELECT s.user_id, s.date
          FROM public.daily_scores s
    ),
    agg AS (
        SELECT a.uid,
               min(a.d) AS first_on,
               max(a.d) AS last_on,
               count(*)::int AS total,
               count(*) FILTER (
                   WHERE a.d > ((now() AT TIME ZONE 'Asia/Seoul')::date - 7)
               )::int AS d7,
               count(*) FILTER (
                   WHERE a.d > ((now() AT TIME ZONE 'Asia/Seoul')::date - 30)
               )::int AS d30,
               array_agg(a.d ORDER BY a.d DESC) FILTER (
                   WHERE a.d > ((now() AT TIME ZONE 'Asia/Seoul')::date - 30)
               ) AS recent
          FROM active a
         GROUP BY a.uid
    )
    SELECT
        u.id,
        seen.ts,
        seen.src,
        u.last_sign_in_at,
        g.first_on,
        g.last_on,
        COALESCE(g.total, 0),
        COALESCE(g.d7,    0),
        COALESCE(g.d30,   0),
        -- 가입한 날 말고 **다시 온 날**이 며칠인가 — 단발 이탈 판별의 핵심 지표.
        COALESCE((
            SELECT count(*)::int FROM active a2
             WHERE a2.uid = u.id
               AND a2.d > (pr.created_at AT TIME ZONE 'Asia/Seoul')::date
        ), 0),
        g.recent,
        -- OS: v0.9.17 이후엔 계측이 직접 실어 보내고(props.os), 그 전 구간은
        -- posture_events.device_id 의 UA 로 역추론한다. 위반이 없던 사용자는 NULL.
        -- 판정 순서 주의 — Android UA 에는 "Linux", iPhone UA 에는 "like Mac OS X" 가 들어 있다.
        COALESCE(
            (SELECT e.props->>'os' FROM public.usage_events e
              WHERE e.user_id = u.id AND e.props ? 'os'
              ORDER BY e.created_at DESC LIMIT 1),
            (SELECT CASE
                        WHEN p.device_id ILIKE '%android%'                                  THEN 'android'
                        WHEN p.device_id ILIKE '%iphone%' OR p.device_id ILIKE '%ipad%'      THEN 'ios'
                        WHEN p.device_id ILIKE '%windows%'                                  THEN 'windows'
                        WHEN p.device_id ILIKE '%macintosh%' OR p.device_id ILIKE '%mac os%' THEN 'macos'
                        WHEN p.device_id ILIKE '%linux%' OR p.device_id ILIKE '%x11%'        THEN 'linux'
                        ELSE NULL
                    END
               FROM public.posture_events p
              WHERE p.user_id = u.id
              ORDER BY p.occurred_at DESC LIMIT 1)
        ),
        (SELECT (e.props->>'cores')::int FROM public.usage_events e
          WHERE e.user_id = u.id AND e.props ? 'cores'
          ORDER BY e.created_at DESC LIMIT 1),
        -- ↓ 여기가 수정점. usage_events.client 가 varchar 라 캐스트가 없으면 함수 전체가 실패한다.
        (SELECT array_agg(DISTINCT e.client)::text[] FROM public.usage_events e
          WHERE e.user_id = u.id AND e.client IS NOT NULL)
    FROM auth.users u
    JOIN public.profiles pr ON pr.id = u.id
    LEFT JOIN agg g ON g.uid = u.id
    CROSS JOIN LATERAL (
        -- 최종 사용 = 사용자 행동으로 생긴 타임스탬프 중 가장 늦은 것 + 그 출처.
        -- 단일 소스로는 어느 것도 "최종 사용"이 아니다: 실측상 8명 중 last_sign_in_at
        -- 이 최신인 사람은 2명뿐이고 나머지는 settings/profile/usage 동기화가 이긴다.
        SELECT c.ts, c.src
          FROM (VALUES
            (u.last_sign_in_at, 'sign_in'),
            (pr.updated_at,     'profile'),
            ((SELECT max(e.created_at)  FROM public.usage_events   e WHERE e.user_id = u.id), 'usage'),
            ((SELECT max(p.occurred_at) FROM public.posture_events p WHERE p.user_id = u.id), 'posture'),
            ((SELECT max(s.created_at)  FROM public.daily_scores   s WHERE s.user_id = u.id), 'score'),
            ((SELECT max(t.updated_at)  FROM public.user_settings  t WHERE t.user_id = u.id), 'settings'),
            ((SELECT max(o.created_at)  FROM public.posts          o WHERE o.user_id = u.id), 'post'),
            ((SELECT max(m.created_at)  FROM public.comments       m WHERE m.user_id = u.id), 'comment'),
            ((SELECT max(v.created_at)  FROM public.subscription_events v
               WHERE v.user_id = u.id AND v.actor = 'user'), 'sub')
          ) AS c(ts, src)
         WHERE c.ts IS NOT NULL
         ORDER BY c.ts DESC
         LIMIT 1
    ) AS seen;
END;
$function$;

COMMENT ON FUNCTION public.admin_user_activity() IS
'가입자별 활동 요약(최종 사용·활동일수·리텐션·OS). 어드민 전용. 활동일 기준 시간대 Asia/Seoul. usage_events 가 1차 소스 — posture_events/daily_scores 는 PRO 전용이라 유료 전환 시 무료 사용자가 사라진다.';

REVOKE ALL ON FUNCTION public.admin_user_activity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_user_activity() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_user_activity() TO authenticated;
