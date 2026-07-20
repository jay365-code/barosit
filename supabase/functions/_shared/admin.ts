// Supabase service-role 클라이언트 + JWT 사용자 검증 헬퍼
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Authorization: Bearer <user jwt> 에서 사용자 추출. 실패 시 null.
export async function getUser(req: Request, supabase: SupabaseClient) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// pg_cron 등 서버 내부에서만 불려야 하는 함수를 보호한다.
// verify_jwt 기본값은 "유효한 JWT면 통과"라 로그인한 아무 사용자나 배치를 실행할 수
// 있었다. 호출자의 Bearer 가 service_role 키와 일치할 때만 허용한다.
export function isServiceRole(req: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return false;
  return (req.headers.get("Authorization") ?? "") === `Bearer ${key}`;
}

// 비식별 주문번호 생성 (timestamp 는 인자로 받아 결정성 유지)
export function makeOrderId(prefix = "order"): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}
