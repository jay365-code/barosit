/**
 * Posture Events Database Purge Cron Script
 * Aligned with docs/saas-core-blueprint.md Section 5.
 */

import { createClient } from "@supabase/supabase-js";

async function run() {
  const isDryRun = process.argv.includes("--dry-run");
  
  // Load configuration from env
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  // Standard cron script needs service role key to bypass RLS and delete old records
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log("====================================================");
  console.log("📊 BaroSit 오래된 자세 위반 기록 정리 스크립트");
  console.log(`⏱️ 실행 시간: ${new Date().toISOString()}`);
  console.log(`⚙️ 모드: ${isDryRun ? "🧪 DRY RUN (삭제하지 않음)" : "⚡ LIVE (실제 삭제 실행)"}`);
  console.log("====================================================");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ 에러: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되지 않았습니다.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });

  // Calculate 90 days ago timestamp
  const DAYS_LIMIT = 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DAYS_LIMIT);
  const cutoffIso = cutoffDate.toISOString();

  console.log(`📅 정리 대상 기준일: ${DAYS_LIMIT}일 이전 (${cutoffIso})`);

  try {
    // 1. Query records count before deletion
    const { count, error: countError } = await supabase
      .from("posture_events")
      .select("*", { count: "exact", head: true })
      .lt("occurred_at", cutoffIso);

    if (countError) {
      throw new Error(`대상 데이터 카운트 조회 중 오류 발생: ${countError.message}`);
    }

    const targetCount = count || 0;
    console.log(`🔍 정리할 데이터 개수: ${targetCount}개`);

    if (targetCount === 0) {
      console.log("✅ 정리할 오래된 자세 기록 데이터가 없습니다.");
      process.exit(0);
    }

    if (isDryRun) {
      console.log("🧪 DRY RUN 모드: 실제 삭제 연산을 건너뛰고 정상 완료 처리합니다.");
      process.exit(0);
    }

    // 2. Perform deletion
    console.log("⚡ 오래된 자세 기록 물리 삭제를 시작합니다...");
    const { error: deleteError } = await supabase
      .from("posture_events")
      .delete()
      .lt("occurred_at", cutoffIso);

    if (deleteError) {
      throw new Error(`오래된 데이터 삭제 중 오류 발생: ${deleteError.message}`);
    }

    console.log(`🎉 성공적으로 약 ${targetCount}개의 오래된 자세 위반 기록을 삭제했습니다.`);
    process.exit(0);
  } catch (err: any) {
    console.error("❌ 에러 발생: 배치 정리 스크립트 실행에 실패했습니다.");
    console.error(err?.message || err);
    process.exit(1);
  }
}

// Run the script
run();
