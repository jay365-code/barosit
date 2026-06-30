-- 📣 공지 카테고리 RLS 하드닝 — 운영자(is_admin)만 공지 글 작성/수정 가능.
--
-- 배경: 라이브 posts 엔 blanket INSERT 정책("Allow public insert posts" WITH CHECK(true) 등)이
-- 있어, anon 키만으로 API 직접 호출 시 category='📣 공지'(가짜 공식 공지)를 넣을 수 있었다.
-- 정책은 permissive(OR)라 비관리자 insert/update 경로가 여러 개 → 정책을 하나씩 고치면 누락 위험이
-- 크고, 조회수/좋아요 증가(SECURITY DEFINER UPDATE)가 공지 글에서 막히는 부작용도 생긴다.
--
-- 해결: BEFORE INSERT/UPDATE 트리거 단일 체크포인트. 어떤 RLS 정책을 통과해 들어오든 여기서 막는다.
--  · INSERT 시 category='📣 공지' 인데 비관리자 → 거부
--  · UPDATE 시 category 를 '📣 공지' 로 *바꾸려는* 비관리자 → 거부
--    (기존 공지 글의 조회수/좋아요 증가처럼 category 가 안 바뀌는 UPDATE 는 통과 → 부작용 없음)
--  · service_role(백엔드/Edge Function) 과 관리자는 허용 (향후 Aria 가 공지 게시할 여지 포함)

CREATE OR REPLACE FUNCTION public.enforce_notice_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.category = '📣 공지'
       AND (TG_OP = 'INSERT' OR NEW.category IS DISTINCT FROM OLD.category)
       AND NOT (auth.role() = 'service_role' OR public.is_admin())
    THEN
        RAISE EXCEPTION '📣 공지 카테고리는 운영자만 작성할 수 있습니다.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_notice_admin_only ON public.posts;
CREATE TRIGGER trg_enforce_notice_admin_only
    BEFORE INSERT OR UPDATE ON public.posts
    FOR EACH ROW EXECUTE FUNCTION public.enforce_notice_admin_only();
