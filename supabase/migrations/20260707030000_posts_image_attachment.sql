-- 커뮤니티 게시글 이미지 첨부
--
-- 배경: 자세인증 챌린지를 비롯한 커뮤니티 전체 카테고리에서 이미지 1장을 첨부할
-- 수 있게 한다. posts 는 단일 테이블 + category 컬럼 구분 구조이므로, image_url
-- 컬럼 하나와 공용 Storage 버킷 하나로 5개 카테고리 전부를 커버한다.
--
-- 이미지는 클라이언트에서 캔버스로 리사이즈/압축(최대 ~1600px, JPEG) 후 업로드하며,
-- 게스트도 글을 쓸 수 있는 정책과 일관되게 anon 업로드를 허용한다(버킷 단위 5MB +
-- image/* MIME 제한으로 남용 범위를 좁힌다).

-- 1. posts.image_url 컬럼 (nullable — 첨부 없는 글이 대부분)
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. 공개 읽기 Storage 버킷 (5MB, image MIME 만)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'post-images',
    'post-images',
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Storage RLS — 공개 SELECT + (anon 포함) INSERT
--    UPDATE/DELETE 는 부여하지 않음: 첨부 이미지는 불변으로 취급.
DROP POLICY IF EXISTS "post-images public read" ON storage.objects;
CREATE POLICY "post-images public read" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'post-images');

DROP POLICY IF EXISTS "post-images public insert" ON storage.objects;
CREATE POLICY "post-images public insert" ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'post-images');
