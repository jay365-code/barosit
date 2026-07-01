-- 공유 댓글(다국어 블로그): 번역그룹의 ko/en/ja 글이 하나의 댓글 스레드를 공유.
-- 스레드 키 thread_id = COALESCE(글.translation_group_id, 글.id). UGC 는 self(id) → 기존 동작 유지.
-- 목록 카드가 그룹 전체 댓글수를 embed/클라매핑 없이 보이도록 posts.comment_count 를 트리거로 동기화.

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS thread_id UUID;

-- 백필(20260701030000 의 posts 백필 이후 실행): 각 댓글의 thread_id = 소속 글의 그룹키.
UPDATE public.comments c
   SET thread_id = COALESCE(p.translation_group_id, p.id)
  FROM public.posts p
 WHERE p.id = c.post_id AND c.thread_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_comments_thread_id ON public.comments(thread_id);

-- BEFORE INSERT: thread_id 를 서버가 강제(클라 입력 무시 → 스레드 스푸핑 방지).
CREATE OR REPLACE FUNCTION public.set_comment_thread_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT COALESCE(p.translation_group_id, p.id) INTO NEW.thread_id
    FROM public.posts p WHERE p.id = NEW.post_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_set_comment_thread_id ON public.comments;
CREATE TRIGGER trg_set_comment_thread_id
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.set_comment_thread_id();

-- AFTER INSERT/DELETE: 스레드 댓글수 재계산 → 그룹 전체 posts.comment_count 갱신.
-- SECURITY DEFINER 로 posts 소유자전용 RLS 우회(increment_post_views 와 동일 패턴).
-- category 미변경 UPDATE 라 enforce_notice_admin_only 트리거는 통과.
CREATE OR REPLACE FUNCTION public.sync_thread_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tid UUID; cnt INT;
BEGIN
  tid := COALESCE(NEW.thread_id, OLD.thread_id);
  IF tid IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO cnt FROM public.comments WHERE thread_id = tid;
  UPDATE public.posts
     SET comment_count = cnt
   WHERE id = tid OR translation_group_id = tid;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_thread_comment_count ON public.comments;
CREATE TRIGGER trg_sync_thread_comment_count
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_thread_comment_count();

-- comment_count 초기 백필.
UPDATE public.posts p
   SET comment_count = (
     SELECT count(*) FROM public.comments c
      WHERE c.thread_id = COALESCE(p.translation_group_id, p.id)
   );
