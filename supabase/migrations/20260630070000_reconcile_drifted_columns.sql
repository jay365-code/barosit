-- 스키마 드리프트 보정 — 프로덕션에 마이그레이션 없이 직접 추가됐던 컬럼들을 정식 반영.
--
-- 배경: posts 의 author_name / category / password_hash 는 베타 기간에 대시보드/스니펫으로 라이브 DB 에
-- 직접 추가돼 마이그레이션 파일엔 없었다. 그래서 로컬 Supabase(마이그레이션으로만 구성)엔 이 컬럼들이
-- 없어 글 작성이 "author_name 컬럼 없음"으로 실패했다. 여기서 IF NOT EXISTS 로 반영해
-- 로컬/CI/재현 환경과 프로덕션 스키마를 일치시킨다(프로덕션엔 이미 있으므로 no-op).
--
-- 클라이언트(src/web/Marketing.tsx)가 posts 에 쓰는 컬럼: title/content/views/likes/user_id(기존 마이그레이션)
-- + author_name/category/password_hash(아래) + is_agent/agent_role(20260630010000/020000).
-- category 는 공지 차단 트리거(enforce_notice_admin_only)도 참조하므로 로컬에 반드시 필요.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS author_name   TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS category      TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- comments 드리프트도 함께 보장(author_name 은 20260630010000 에서, password_hash 는 030000 에서 보강됨 — 재확인)
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS author_name   TEXT;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS password_hash TEXT;
