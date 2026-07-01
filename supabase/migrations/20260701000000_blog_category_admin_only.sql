-- 📝 블로그 카테고리도 운영자 전용으로 하드닝(공지와 동일).
-- 블로그 = BaroSit 운영자가 쓰는 콘텐츠 채널(유익한 자세 정보) → SSR 에서 BlogPosting 색인.
-- 20260630020000_notice_category_admin_only 의 트리거 함수를 교체해 공지+블로그 둘 다 막는다.
-- (BEFORE INSERT/UPDATE 단일 체크포인트. 조회수/좋아요 UPDATE 는 category 미변경이라 통과.)

CREATE OR REPLACE FUNCTION public.enforce_notice_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.category IN ('📣 공지', '📝 블로그')
       AND (TG_OP = 'INSERT' OR NEW.category IS DISTINCT FROM OLD.category)
       AND NOT (auth.role() = 'service_role' OR public.is_admin())
    THEN
        RAISE EXCEPTION '이 카테고리(공지·블로그)는 운영자만 작성할 수 있습니다.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
