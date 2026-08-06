-- 적용: 2026-08-06 프로덕션(kllcnllkcewnutxodwhx) MCP apply_migration.
--       파일명 버전은 원격에 기록된 자동 타임스탬프에 맞춰 둔 것 — 어긋나면 db push 가 거부된다.
-- 어드민 대시보드 통계 RPC — posture_events 원본 1000건을 클라이언트로 끌어오던 것을 대체한다.
--
-- 무엇이 문제였나 (실측, 프로덕션 37,841행 기준)
--   AdminDashboardView 는 `posture_events.select("*").limit(1000)` 로 **336 kB** 를 받아
--   ①시간대별 분포 ②위반 유형 비중 ③건수 카드 세 가지를 그렸다. 서버 시간 139.7 ms 로
--   어드민 진입 시 가장 비싼 쿼리였다. 같은 count 를 RLS 없이 재면 8.6 ms — 즉 130 ms 는
--   전부 RLS 조건의 `is_admin()` 이 **행마다** 호출되는 비용이다(plpgsql·VOLATILE 이라
--   InitPlan 으로 캐시되지 않는다). 관리자 본인 소유가 아닌 행 4,811개 × 약 29 µs.
--   → 다른 사용자 데이터가 늘어나는 만큼 어드민 진입이 선형으로 느려지는 구조였다.
--
-- 왜 SECURITY DEFINER 로 옮기면 해결되나
--   함수 소유자 권한으로 도므로 RLS 를 타지 않는다. is_admin() 가드는 함수 진입 시
--   **한 번만** 돈다. 집계는 인덱스 온리 스캔 한 번으로 끝난다.
--
-- 덤으로 고쳐지는 정확성 문제
--   limit 1000 때문에 "최근 동기화 로그 수" 카드는 데이터가 얼마나 쌓이든 항상
--   "1000건" 이었다. 이제 event_total 은 진짜 전체 건수다.
--
-- 차트 구간을 최근 30일로 명시한 이유
--   기존 차트는 "최신 1000건"이라는 떠다니는 구간을 봤다 — 사용자가 늘면 구간이
--   저절로 좁아져 어제와 오늘의 그래프가 다른 기간을 뜻하게 된다. 고정 창이 맞다.
--   시간대 버킷은 운영자 기준(Asia/Seoul) — admin_user_activity 와 같은 기준이다.

CREATE OR REPLACE FUNCTION public.admin_posture_overview()
RETURNS TABLE (
    event_total   bigint,   -- 전체 누적 posture_events (상한 없음)
    event_30d     bigint,   -- 최근 30일 건수 = 아래 두 분포의 모수
    score_days    bigint,   -- daily_scores 적재 행수
    by_hour       integer[],-- 24칸, KST 시(0~23)별 건수
    by_type       jsonb     -- {posture_type: 건수}
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
    WITH recent AS (
        SELECT extract(hour FROM (p.occurred_at AT TIME ZONE 'Asia/Seoul'))::int AS hr,
               p.posture_type
          FROM public.posture_events p
         WHERE p.occurred_at > now() - interval '30 days'
    ),
    per_hour AS (
        SELECT r.hr, count(*)::int AS n FROM recent r GROUP BY r.hr
    )
    SELECT
        (SELECT count(*) FROM public.posture_events),
        (SELECT count(*) FROM recent),
        (SELECT count(*) FROM public.daily_scores),
        (SELECT array_agg(COALESCE(h.n, 0) ORDER BY g.hr)
           FROM generate_series(0, 23) AS g(hr)
           LEFT JOIN per_hour h ON h.hr = g.hr),
        (SELECT COALESCE(jsonb_object_agg(t.posture_type, t.n), '{}'::jsonb)
           FROM (SELECT r.posture_type, count(*)::int AS n
                   FROM recent r
                  WHERE r.posture_type IS NOT NULL
                  GROUP BY r.posture_type) t);
END;
$function$;

COMMENT ON FUNCTION public.admin_posture_overview() IS
'어드민 대시보드 통계(전체 건수 + 최근 30일 시간대·유형 분포). 어드민 전용. 원본 행 전송을 없애려고 만든 집계 전용 RPC — 클라이언트에서 다시 세지 말 것.';

-- 권한: authenticated 만. anon 은 명시적으로 회수한다 —
-- Supabase 기본 권한이 public 스키마의 새 함수에 anon EXECUTE 를 붙이고,
-- REVOKE ... FROM PUBLIC 은 그것을 걷어내지 못한다(20260804030000 참고).
REVOKE ALL ON FUNCTION public.admin_posture_overview() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_posture_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_posture_overview() TO authenticated;
