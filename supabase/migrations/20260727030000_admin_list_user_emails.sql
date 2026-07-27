-- 어드민 가입자 관리 화면에 "가입 이메일" 노출.
--
-- profiles 에는 이메일이 없고(auth.users 에만 있음), anon/authenticated 는 auth 스키마를
-- 읽을 수 없다. 방법이 둘인데:
--   ① profiles 에 email 컬럼을 복제 — 가입 트리거·백필이 필요하고, 사용자가 나중에
--      이메일을 바꾸면 조용히 어긋난다(동기화 주체가 없다).
--   ② 어드민만 통과하는 SECURITY DEFINER 함수로 auth.users 를 그때그때 읽는다.
-- ②를 택한다. 항상 최신값이고, 복제본이 없으니 회원탈퇴 파기 절차([[account_deletion]])
-- 에서 따로 지워야 할 흔적도 늘지 않는다.
--
-- ⚠ 이메일은 PII 다. is_admin() 검사를 함수 본문 첫 줄에 두고, EXECUTE 권한도
-- authenticated 에게만 준다(anon 제외). is_admin() 은 auth.uid() 기반이라
-- service_role 에서는 false 이므로, 서버 경로가 필요해지면 별도 함수를 만들 것.

CREATE OR REPLACE FUNCTION public.admin_list_user_emails()
RETURNS TABLE (id UUID, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION '권한이 없습니다 (관리자 전용).';
    END IF;

    RETURN QUERY
    SELECT u.id, u.email::TEXT
    FROM auth.users u;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_emails() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_user_emails() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails() TO authenticated;
