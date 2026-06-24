-- Database Migration: 베타 테스터 플래그 (staged 런치 모드 지원)
--
-- 배경: 토스 라이브 승인 대기 중, 일반 베타 사용자에게는 결제/Pro 메뉴를 숨긴 채로
--   소수의 테스터만 토스 샌드박스로 결제 플로우를 시험하기 위함.
--   런치 모드 'staged' 에서 테스터는 정상 구독 게이팅(paid)을 받고, 일반 사용자는
--   기존 'beta_free' 와 동일하게 전 기능 무료 + 결제 비노출을 유지한다.
--
-- 'staged' 자체는 app_config.launch_mode 값으로만 추가되며 별도 스키마 변경이 없다.

-- 1. profiles 에 베타 테스터 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_beta_tester BOOLEAN DEFAULT false NOT NULL;

-- 2. 테스터 판정 헬퍼 (어드민은 자동으로 테스터로 간주).
--    is_admin() 과 동일하게 SECURITY DEFINER + 고정 search_path 로 RLS 재귀를 피한다.
CREATE OR REPLACE FUNCTION public.is_beta_tester()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND (is_beta_tester = true OR is_admin = true)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. app_config 코멘트 갱신: launch_mode 에 'staged' 추가
COMMENT ON TABLE public.app_config IS
  '전역 런타임 설정. launch_mode = ''beta_free'' | ''staged'' | ''paid''. '
  'staged = 테스터만 결제/Pro 게이팅(paid), 일반 사용자는 beta_free 와 동일.';
