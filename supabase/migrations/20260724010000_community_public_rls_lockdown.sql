-- 커뮤니티 공개 RLS 잠금 (2026-07-24)
--
-- 문제: posts/comments 에 qual=true 공개 정책이 살아 있어 anon 키만으로
--   임의 글·댓글을 삭제("Allow public delete posts/comments")·변조("Allow public update posts")
--   할 수 있었다. 게스트 비밀번호 검증은 클라이언트가 붙이는 .eq("password_hash", …)
--   필터뿐이라 REST 직접 호출로 그대로 우회된다.
--
-- 해소: 게스트(비회원) 글/댓글의 비밀번호 삭제를 SECURITY DEFINER RPC 로 옮기고
--   (서버에서 저장된 password_hash 와 대조), 공개 delete/update 정책을 제거한다.
--   회원 본인 삭제/수정("auth.uid() = user_id")과 어드민(is_admin) 정책은 그대로 유지.
--   클라이언트는 비밀번호를 SHA-256 hex 로 해시해 보낸다(기존 저장 형식과 동일).

-- 1) 게스트 글 삭제 RPC — 게스트 글(user_id IS NULL)만, 비밀번호 일치 시에만.
--    운영자(Aria/Ethan) 글은 is_agent + 빈 password_hash 로 이중 차단.
CREATE OR REPLACE FUNCTION public.delete_guest_post(p_post_id uuid, p_password_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF coalesce(p_password_hash, '') = '' THEN
    RETURN false;
  END IF;
  DELETE FROM public.posts
   WHERE id = p_post_id
     AND user_id IS NULL
     AND is_agent = false
     AND coalesce(password_hash, '') <> ''
     AND password_hash = p_password_hash;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- 2) 게스트 댓글 삭제 RPC — 동일 규칙.
CREATE OR REPLACE FUNCTION public.delete_guest_comment(p_comment_id uuid, p_password_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF coalesce(p_password_hash, '') = '' THEN
    RETURN false;
  END IF;
  DELETE FROM public.comments
   WHERE id = p_comment_id
     AND user_id IS NULL
     AND is_agent = false
     AND coalesce(password_hash, '') <> ''
     AND password_hash = p_password_hash;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_guest_post(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_guest_comment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_guest_post(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_guest_comment(uuid, text) TO anon, authenticated;

-- 3) 공개 삭제/수정 정책 제거 — 이후 삭제 경로는
--    본인(auth.uid()=user_id) · 어드민(is_admin) · 위 RPC 셋뿐이다.
--    (게스트 글 작성용 "Allow public insert …" 정책은 유지)
DROP POLICY IF EXISTS "Allow public delete posts" ON public.posts;
DROP POLICY IF EXISTS "Allow public update posts" ON public.posts;
DROP POLICY IF EXISTS "Allow public delete comments" ON public.comments;
