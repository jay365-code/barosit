-- Database Migration: Restrict admin_notifications INSERT to authenticated users
--
-- 기존 정책은 익명(anon) 포함 누구나 INSERT 가능 — 공격자가 가짜 'critical'
-- 결제실패/위변조 경보를 무제한 주입해 운영 대시보드를 오염·마비시킬 수 있었다(§7 M6).
-- 익명 벡터를 제거하되, 로그인 사용자의 변조감지/결제실패 알림 적재와
-- Edge Function(service_role, RLS 우회)의 적재는 그대로 유지하기 위해
-- INSERT 를 authenticated 로 좁힌다.

DROP POLICY IF EXISTS "Allow public insert on admin_notifications" ON public.admin_notifications;

CREATE POLICY "Allow authenticated insert on admin_notifications" ON public.admin_notifications
    FOR INSERT TO authenticated WITH CHECK (true);

COMMENT ON POLICY "Allow authenticated insert on admin_notifications" ON public.admin_notifications
    IS '로그인 사용자만 알림 적재 허용(익명 스팸 차단). service_role Edge Function 은 RLS 우회.';
