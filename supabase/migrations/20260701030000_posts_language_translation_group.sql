-- 커뮤니티 블로그 다국어화(B-정석): posts 에 언어·번역그룹·공유 댓글수 컬럼 추가.
-- 각 블로그 글을 ko/en/ja 별도 글(고유 URL)로 두고 translation_group_id 로 묶는다.
-- comment_count 는 번역그룹 전체가 공유하는 비정규화 카운트(트리거로 동기화, 20260701040000).

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ko'
    CHECK (language IN ('ko', 'en', 'ja')),
  ADD COLUMN IF NOT EXISTS translation_group_id UUID,
  ADD COLUMN IF NOT EXISTS comment_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_posts_translation_group
  ON public.posts(translation_group_id);

-- 백필: 기존 블로그(KO) 글은 자기 자신을 anchor 로(그룹 id = 자기 id).
-- UGC(질문/자유토론 등)는 translation_group_id NULL 유지 → dedup 대상 아님, 다국어 강제 안 함.
UPDATE public.posts
   SET translation_group_id = id
 WHERE category = '📝 블로그' AND translation_group_id IS NULL;
