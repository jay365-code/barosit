-- releases 테이블 다국어 지원: 영어 릴리스 노트 컬럼 추가.
-- content = 한국어(기존), content_en = 영어. 일본어 UI 는 영어로 폴백.
-- Ethan(prepare-release.yml)이 ko/en 두 블록을 작성 → release.yml 이 각각 저장.

ALTER TABLE public.releases
  ADD COLUMN IF NOT EXISTS content_en TEXT;

COMMENT ON COLUMN public.releases.content_en IS '영어 릴리스 노트 (없으면 프런트에서 한국어 content 또는 정적 목록으로 폴백)';
