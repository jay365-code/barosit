-- 커뮤니티 게시글 이미지 다중 첨부 (최대 5장)
--
-- 기존 image_url(단일 TEXT)은 하위호환/목록 인디케이터/구 리더용으로 유지하고,
-- 다중 첨부는 image_urls TEXT[] 로 저장한다. 새 글은 image_url = 첫 장,
-- image_urls = 전체를 함께 기록. 상세뷰는 image_urls 우선, 없으면 image_url 폴백.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_urls TEXT[];
