-- Bring DB schema in line with what the client sync layer actually writes.
--
-- 관찰된 프로덕션 에러:
--   user_settings 400 — "Could not find the 'calibration_baseline' column ... in the schema cache"
--   profiles      403 — "new row violates row-level security policy for table profiles"
--
-- 원인:
--   (1) src/lib/syncService.ts 가 user_settings 로 calibration_baseline /
--       calibration_baseline_multi 를 upsert 하는데, init 스키마엔 해당 컬럼이
--       없음 (어떤 마이그레이션에도 추가된 적 없음).
--   (2) syncService 의 profiles upsert(=INSERT ON CONFLICT)는 INSERT 권한을
--       요구하는데, init 스키마엔 SELECT/UPDATE 정책만 있어 RLS 가 거부.
--       (handle_new_user 트리거가 가입 시 행을 만들지만, 클라이언트 upsert 는
--        여전히 INSERT 정책이 있어야 통과.)

-- (1) PRO 플랜 다중/단일 캘리브레이션 베이스라인 동기화 컬럼.
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS calibration_baseline JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS calibration_baseline_multi JSONB DEFAULT NULL;

-- (2) 본인 프로필 행 삽입 허용 (upsert 의 INSERT 경로용). WITH CHECK 로
--     타인 행 위조 방지.
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);
