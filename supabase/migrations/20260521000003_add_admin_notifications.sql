-- Database Migration: Create admin_notifications table and sign-up triggers
-- This enables real-time service events auditing (sign-up, cancel, refund, failure, tampering).

-- 1. admin_notifications 테이블 생성
CREATE TABLE IF NOT EXISTS public.admin_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL, -- 'signup', 'cancellation', 'refund_requested', 'payment_failed', 'tampering_detected', 'system_error'
    severity VARCHAR(20) DEFAULT 'info' NOT NULL, -- 'info', 'warning', 'critical'
    message TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    read_at TIMESTAMPTZ DEFAULT NULL
);

-- 2. admin_notifications 인덱스 생성 (최신 알림 빠른 조회)
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON public.admin_notifications(created_at DESC);

-- 3. Row Level Security (RLS) 활성화
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책 추가
-- 4.1. 누구나 INSERT는 가능하게 설정 (비로그인, 혹은 외부 Webhook, 클라이언트의 변조 감지 등 유연하게 알림을 적재하기 위함)
CREATE POLICY "Allow public insert on admin_notifications" ON public.admin_notifications
    FOR INSERT WITH CHECK (true);

-- 4.2. 어드민은 admin_notifications에 대한 모든 행위(SELECT, UPDATE, DELETE, INSERT)가 가능
CREATE POLICY "Admins can do everything on admin_notifications" ON public.admin_notifications
    FOR ALL USING (public.is_admin());

-- 5. 회원 가입(Sign-up) 시 profiles 테이블 INSERT를 감지하여 자동으로 admin_notifications에 쌓는 트리거 구축
CREATE OR REPLACE FUNCTION public.tr_admin_notify_signup()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.admin_notifications (event_type, severity, message, payload)
    VALUES (
        'signup',
        'info',
        '새로운 회원이 가입했습니다: ' || COALESCE(new.name, '사용자') || ' (' || COALESCE(new.id::text, '') || ')',
        jsonb_build_object(
            'user_id', new.id,
            'name', new.name,
            'avatar', new.avatar,
            'is_admin', new.is_admin
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 바인딩 (존재하지 않을 시에만 생성)
DROP TRIGGER IF EXISTS tr_on_signup_notify ON public.profiles;
CREATE TRIGGER tr_on_signup_notify
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.tr_admin_notify_signup();
