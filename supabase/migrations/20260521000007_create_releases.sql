-- Database Migration: Create releases table for dynamic updates log
-- This allows admins to publish release notes directly through the Admin Dashboard

CREATE TABLE IF NOT EXISTS public.releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(50) UNIQUE NOT NULL,
    released_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on releases
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read releases
DROP POLICY IF EXISTS "Allow public read access to releases" ON public.releases;
CREATE POLICY "Allow public read access to releases" ON public.releases
    FOR SELECT USING (true);

-- Allow admins full access to releases
DROP POLICY IF EXISTS "Allow admins full access to releases" ON public.releases;
CREATE POLICY "Allow admins full access to releases" ON public.releases
    FOR ALL USING (public.is_admin());

COMMENT ON TABLE public.releases IS '관리자가 작성하는 공개 업데이트 및 공지사항 내역';
