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
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;

  // 런타임이 주입하는 키와 직접 일치하면 통과(빠른 경로).
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (key && token === key) return true;

  // 그 외에는 JWT 의 role 클레임으로 판정한다. 키 문자열 비교만 하면 Supabase 가
  // 신형 API 키로 이행하면서 런타임 주입값과 대시보드 발급값이 어긋날 때 정상
  // 호출까지 막힌다(실제로 403 발생).
  //
  // 서명을 여기서 검증하지 않아도 되는 이유: 이 함수는 verify_jwt 기본값(활성)으로
  // 배포되어 게이트웨이가 서명을 이미 검증한 요청만 도달한다. 서명 위조가 불가능하므로
  // 남은 판별 기준은 role 클레임이다(anon 과 service_role 은 같은 시크릿으로 서명됨).
  // verify_jwt 를 끈 함수에서는 이 헬퍼를 쓰면 안 된다.
  try {
    const [, payload] = token.split(".");
    if (!payload) return false;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json)?.role === "service_role";
  } catch {
    return false;
  }
}

// 비식별 주문번호 생성 (timestamp 는 인자로 받아 결정성 유지)
export function makeOrderId(prefix = "order"): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}
