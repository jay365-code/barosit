-- 가입자별 활동 요약 RPC — 어드민 users 탭의 "꾸준히 쓰고 있나 / 떠났나" 판정용.
--
-- 왜 필요한가
--   지금 어드민 화면은 가입일과 프로필만 보여줘서, 이 사람이 아직 쓰는지 이탈했는지
--   알 수 없다. 개별 사용자를 확인하려면 매번 SQL 을 직접 쳐야 했다.
--
-- 왜 usage_events 가 1차 소스인가 (중요)
--   posture_events 와 daily_scores 는 클라이언트가 **PRO 플랜에만** 업로드한다
--   (syncService.ts 의 `if (userPlan !== "pro") return true`). 지금은 베타라
--   useEntitlement 가 전원을 pro 로 시드해서 무료 사용자 데이터도 올라오지만,
--   launch_mode 를 'paid' 로 바꾸는 순간 무료 사용자의 두 테이블 쓰기가 전부 멈춘다.
--   그 위에 리텐션 지표를 세우면 **유료 런칭하는 날 무료 사용자가 통계에서 사라진다**.
--   usage_events 는 플랜 게이트가 없고(옵트아웃만 적용) app_opened 이 scope='daily'
--   라 사용자당 하루 1행이다 — 무료·유료 무관하게 동작하는 유일한 DAU 소스다.
--
--   과거 구간은 usage_events 만으로는 성기므로 posture_events·daily_scores 를
--   **합집합**으로 함께 본다. 앞으로는 usage_events 가 단독으로 커버한다.
--
-- 활동일의 기준 시간대
--   Asia/Seoul 로 통일한다. 운영자가 보는 화면이므로 운영자의 하루 경계가 맞다.
--   해외 사용자는 날짜가 한 칸 밀릴 수 있으나, 활동'일수' 집계에서 그 오차는 무의미하다.
--
-- 최종 사용 시각에서 **제외**한 것
--   - user_subscriptions.updated_at, billing_history: 정기결제 갱신·독촉 크론이
--     서버에서 쓴다. 포함하면 앱을 안 켜는 사람도 결제만 되면 영원히 "오늘 사용"이 된다.
--     지금은 유료 갱신이 없어 깨끗하지만, 정확히 이 지표가 중요해지는 시점에 망가진다.
--   - subscription_events 중 actor <> 'user': 관리자의 환불·강등은 사용자 활동이 아니다.
--     실제로 리뷰어 계정의 2026-07-27 refunded/downgraded 가 이 경로로 섞여 있었다.

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
        (SELECT array_agg(DISTINCT e.client) FROM public.usage_events e
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

-- 권한: authenticated 만. anon 회수를 **명시적으로** 해야 한다 —
-- Supabase 기본 권한(ALTER DEFAULT PRIVILEGES)이 public 스키마의 새 함수에 anon
-- EXECUTE 를 자동 부여하는데, REVOKE ... FROM PUBLIC 은 PUBLIC 의사역할만 걷어내고
-- 명시적으로 부여된 anon 은 남긴다. 실제로 최초 적용 시 이 함수에만 anon 이 붙어
-- 기존 admin_* 함수들과 권한이 달라졌다. is_admin() 가드가 있어 데이터가 새지는
-- 않지만, auth.users 를 읽는 SECURITY DEFINER 함수를 비로그인 역할이 호출할 수
-- 있게 둘 이유가 없다.
REVOKE ALL ON FUNCTION public.admin_user_activity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_user_activity() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_user_activity() TO authenticated;
