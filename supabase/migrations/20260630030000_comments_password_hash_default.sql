-- comments.password_hash 기본값 '' 지정.
--
-- 라이브 comments 에는 password_hash 가 NOT NULL(게스트 댓글 삭제용, 마이그레이션 밖 드리프트)인데,
-- Aria(운영자) 댓글 게시처럼 비밀번호 없는 삽입은 이 컬럼을 생략 → NOT NULL 위반으로 실패했다.
-- 로그인 사용자도 관례상 빈 문자열('')을 넣으므로, 기본값 '' 로 맞추면 컬럼을 생략한 삽입도 통과한다.
-- (게스트 댓글은 여전히 해시값을 명시적으로 넣으므로 영향 없음.)

ALTER TABLE public.comments ALTER COLUMN password_hash SET DEFAULT '';
