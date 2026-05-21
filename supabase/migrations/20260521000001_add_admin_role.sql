-- BaroSit Admin Integration & Q&A Schema Migration
-- This script configures the admin column, updates auth creation triggers, defines Q&A tables, and adds Admin RLS privileges.

-- 1. Add admin column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false NOT NULL;

-- 2. Define Q&A (posts) table
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    views INT DEFAULT 0 NOT NULL,
    likes INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast posts retrieval
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);

-- 3. Define Q&A Comments (comments) table
CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for comment retrieval by post
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);

-- Enable Row Level Security (RLS) on Q&A tables
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- 4. Re-define handle_new_user function to automatically assign admin privileges
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    is_admin_user BOOLEAN := false;
BEGIN
    -- Check email metadata to assign admin role to authorized emails
    IF new.email = 'jhlee@gubed.co.kr' OR new.email = 'leejonhyun88@gmail.com' THEN
        is_admin_user := true;
    END IF;

    -- Insert default profile row using metadata from provider
    INSERT INTO public.profiles (id, name, avatar, work_env, is_admin)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '사용자'),
        COALESCE(new.raw_user_meta_data->>'avatar_url', '😊'),
        'mixed',
        is_admin_user
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

-- 5. Helper Function to Check Admin Privileges securely without recursive loops
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_admin = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Configure RLS Policies for Q&A Tables (Public Select, Owner CRUD)

-- Posts Policies
CREATE POLICY "Allow public select on posts" ON public.posts
    FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert on posts" ON public.posts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own posts" ON public.posts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own posts" ON public.posts
    FOR DELETE USING (auth.uid() = user_id);

-- Comments Policies
CREATE POLICY "Allow public select on comments" ON public.comments
    FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert on comments" ON public.comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own comments" ON public.comments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own comments" ON public.comments
    FOR DELETE USING (auth.uid() = user_id);

-- 7. Add Global Admin Privilege Policies to bypass RLS for Admins

CREATE POLICY "Admins can do everything on profiles" ON public.profiles
    FOR ALL USING (public.is_admin());

CREATE POLICY "Admins can do everything on posture_events" ON public.posture_events
    FOR ALL USING (public.is_admin());

CREATE POLICY "Admins can do everything on daily_scores" ON public.daily_scores
    FOR ALL USING (public.is_admin());

CREATE POLICY "Admins can do everything on user_subscriptions" ON public.user_subscriptions
    FOR ALL USING (public.is_admin());

CREATE POLICY "Admins can do everything on posts" ON public.posts
    FOR ALL USING (public.is_admin());

CREATE POLICY "Admins can do everything on comments" ON public.comments
    FOR ALL USING (public.is_admin());
