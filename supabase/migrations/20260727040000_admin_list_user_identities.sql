-- 어드민 가입자 목록에 소셜 프로필 사진까지 노출.
--
-- 20260727030000 의 admin_list_user_emails 를 대체한다. 이메일만으로는 부족했다 —
-- profiles.avatar 는 사용자가 앱에서 고른 이모지를 담는 칸이라 비어 있는 계정이 많고,
-- 소셜 로그인이 준 프로필 사진은 auth.users.raw_user_meta_data 에만 있다. 그래서
-- 구글로 가입한 계정인데도 목록에는 기본 이모지가 떴다.
--
-- 반환 타입이 바뀌므로 CREATE OR REPLACE 로는 안 되고 기존 함수를 먼저 지워야 한다.
--
-- ⚠ 이메일·프로필 사진 모두 PII 다. is_admin() 검사를 본문 첫 줄에 두고 EXECUTE 는
-- authenticated 에게만 준다(anon 제외).

DROP FUNCTION IF EXISTS public.admin_list_user_emails();

CREATE OR REPLACE FUNCTION public.admin_list_user_identities()
RETURNS TABLE (id UUID, email TEXT, avatar_url TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION '권한이 없습니다 (관리자 전용).';
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        u.email::TEXT,
        -- 키 우선순위는 클라이언트의 extractSocialAvatarUrl 과 같게 맞춘다.
        -- http 는 https 로 올리되 **맨 앞만** 바꾼다 — 카카오 썸네일처럼
        -- 쿼리스트링에 또 다른 http:// 가 들어있는 URL 이 있어서, 전체 치환하면
        -- 원본 파라미터까지 망가진다.
        CASE
            WHEN v.raw IS NULL OR v.raw = '' THEN NULL
            WHEN v.raw LIKE 'http://%' THEN 'https://' || substring(v.raw FROM 8)
            ELSE v.raw
        END::TEXT
    FROM auth.users u
    CROSS JOIN LATERAL (
        SELECT COALESCE(
            u.raw_user_meta_data->>'avatar_url',
            u.raw_user_meta_data->>'picture',
            u.raw_user_meta_data->>'image',
            u.raw_user_meta_data->>'profile_image_url'
        ) AS raw
    ) v;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_identities() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_user_identities() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_identities() TO authenticated;
