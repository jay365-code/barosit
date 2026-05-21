-- BaroSit Production Database Initialization Schema
-- This script creates the core schema required for auth sync and subscriptions tracking.

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    avatar TEXT,
    work_env TEXT CHECK (work_env IN ('laptop', 'external_monitor', 'mixed')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Posture Events Table
CREATE TABLE IF NOT EXISTS public.posture_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    device_id TEXT NOT NULL,
    posture_type TEXT NOT NULL,
    duration_secs INT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast posture event history lookup
CREATE INDEX IF NOT EXISTS idx_posture_events_user_occurred ON public.posture_events(user_id, occurred_at DESC);

-- 3. Daily Scores Table
CREATE TABLE IF NOT EXISTS public.daily_scores (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    avg_score INT,
    violation_count INT,
    stretch_count INT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, date)
);

-- 4. User Settings Table
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    thresholds JSONB,
    alert_modes JSONB,
    break_config JSONB,
    cumulative_load JSONB,
    variability JSONB,
    adaptive_sensitivity JSONB,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. User Subscriptions Table (SaaS Monetization Blueprint)
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    plan_id VARCHAR(50) NOT NULL DEFAULT 'free', -- 'free', 'pro', 'premium'
    status VARCHAR(30) NOT NULL DEFAULT 'inactive', -- 'active', 'inactive', 'canceled', 'refunded'
    current_period_end TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for subscription lookup by user
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.user_subscriptions(user_id);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posture_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- 6. Row-Level Security Policies (Korean Privacy Law & GDPR Compliance)

-- Profiles Policies
CREATE POLICY "Users can select their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Posture Events Policies
CREATE POLICY "Users can manage their own posture events" ON public.posture_events
    FOR ALL USING (auth.uid() = user_id);

-- Daily Scores Policies
CREATE POLICY "Users can manage their own daily scores" ON public.daily_scores
    FOR ALL USING (auth.uid() = user_id);

-- User Settings Policies
CREATE POLICY "Users can manage their own user settings" ON public.user_settings
    FOR ALL USING (auth.uid() = user_id);

-- User Subscriptions Policies (Read-only for users, updates done via PG S2S webhook)
CREATE POLICY "Users can view their own subscription" ON public.user_subscriptions
    FOR SELECT USING (auth.uid() = user_id);


-- 7. Triggers for Automatic User Provisioning on Auth Signup

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert default profile row using metadata from provider
    INSERT INTO public.profiles (id, name, avatar, work_env)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '사용자'),
        COALESCE(new.raw_user_meta_data->>'avatar_url', '😊'),
        'mixed'
    );

    -- Insert default user settings row
    INSERT INTO public.user_settings (user_id)
    VALUES (new.id);

    -- Insert default free active subscription row
    INSERT INTO public.user_subscriptions (user_id, plan_id, status)
    VALUES (new.id, 'free', 'active');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger binding
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
