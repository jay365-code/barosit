-- 실시간 댓글: comments 테이블을 supabase_realtime publication에 추가(이미 있으면 건너뜀).
-- 공개 SELECT RLS라 구독자(익명 포함)가 변경 이벤트를 받을 수 있다.
-- 필터형(postgres_changes filter) 구독에서 UPDATE/DELETE도 정확히 매칭되도록 REPLICA IDENTITY FULL.
alter table public.comments replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;
