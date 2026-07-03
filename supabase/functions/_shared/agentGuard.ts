// AI 에이전트 공통 방어(요금 폭탄 방지) — Anthropic API 호출 전 서킷브레이커.
//
// 사용법 (모든 에이전트 엣지 함수 공통):
//   const guard = await checkAgentGuard(supabase, { fn: "cm-agent-draft", sourceId, authorKey, contentHash });
//   if (!guard.allowed) { ...API 호출 없이 종료... }
//   ...Anthropic 호출...
//   await recordAgentCall(supabase, { fn, sourceId, authorKey, contentHash });
//
// 상한은 함수 시크릿으로 조정(미설정 시 기본값):
//   AGENT_GUARD_DAILY_MAX   (기본 200)  — 24시간 내 전역 API 호출 상한
//   AGENT_GUARD_HOURLY_MAX  (기본 40)   — 1시간 내 전역 API 호출 상한(버스트 감지)
//   AGENT_GUARD_AUTHOR_MAX  (기본 3)    — 같은 작성자 10분 내 상한
//
// 설계 노트: 카운트→호출 사이의 레이스로 상한을 몇 건 넘길 수는 있지만(비원자적),
// 목적은 정확한 쿼터가 아니라 "폭주 시 수십 건 안에서 멈추는 것"이라 충분하다.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAILY_MAX = Number(Deno.env.get("AGENT_GUARD_DAILY_MAX") ?? 200);
const HOURLY_MAX = Number(Deno.env.get("AGENT_GUARD_HOURLY_MAX") ?? 40);
const AUTHOR_MAX = Number(Deno.env.get("AGENT_GUARD_AUTHOR_MAX") ?? 3);

export type GuardInput = {
  fn: string;
  sourceId?: string | null;
  authorKey?: string | null;
  contentHash?: string | null;
};

export type GuardResult =
  | { allowed: true }
  | { allowed: false; reason: "daily_cap" | "hourly_cap" | "author_cap" | "duplicate" };

// 제목+본문 → SHA-256 hex. 동일 내용 도배(복붙 스팸) 시 첫 건만 API 를 태운다.
export async function contentHashOf(...parts: (string | null | undefined)[]): Promise<string> {
  const data = new TextEncoder().encode(parts.map((p) => p ?? "").join("\n"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function countSince(
  supabase: SupabaseClient,
  sinceIso: string,
  extra?: { authorKey?: string; contentHash?: string },
): Promise<number> {
  let q = supabase
    .from("agent_api_usage")
    .select("id", { count: "exact", head: true })
    .gte("called_at", sinceIso);
  if (extra?.authorKey) q = q.eq("author_key", extra.authorKey);
  if (extra?.contentHash) q = q.eq("content_hash", extra.contentHash).eq("blocked", false);
  else q = q.eq("blocked", false); // 차단된 기록은 쿼터를 소모하지 않는다
  const { count, error } = await q;
  if (error) throw new Error(`agent_api_usage count failed: ${error.message}`);
  return count ?? 0;
}

export async function checkAgentGuard(
  supabase: SupabaseClient,
  input: GuardInput,
): Promise<GuardResult> {
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  // 4) 동일 콘텐츠 24시간 중복 — 가장 싼 검사부터
  if (input.contentHash) {
    const dup = await countSince(supabase, iso(24 * 3600_000), { contentHash: input.contentHash });
    if (dup > 0) return await block(supabase, input, "duplicate");
  }

  // 3) 작성자별 10분 상한
  if (input.authorKey) {
    const byAuthor = await countSince(supabase, iso(10 * 60_000), { authorKey: input.authorKey });
    if (byAuthor >= AUTHOR_MAX) return await block(supabase, input, "author_cap");
  }

  // 2) 전역 시간당 버스트
  const hourly = await countSince(supabase, iso(3600_000));
  if (hourly >= HOURLY_MAX) return await block(supabase, input, "hourly_cap", true);

  // 1) 전역 일일 상한
  const daily = await countSince(supabase, iso(24 * 3600_000));
  if (daily >= DAILY_MAX) return await block(supabase, input, "daily_cap", true);

  return { allowed: true };
}

// API 호출 성공 후 사용 기록(쿼터 소모).
export async function recordAgentCall(supabase: SupabaseClient, input: GuardInput): Promise<void> {
  const { error } = await supabase.from("agent_api_usage").insert({
    fn: input.fn,
    source_id: input.sourceId ?? null,
    author_key: input.authorKey ?? null,
    content_hash: input.contentHash ?? null,
    blocked: false,
  });
  if (error) console.error("recordAgentCall failed:", error.message);
}

async function block(
  supabase: SupabaseClient,
  input: GuardInput,
  reason: "daily_cap" | "hourly_cap" | "author_cap" | "duplicate",
  notifyAdmin = false,
): Promise<GuardResult> {
  // 차단도 기록(감사 추적 + 공격 규모 파악). blocked=true 는 쿼터를 소모하지 않는다.
  const { error } = await supabase.from("agent_api_usage").insert({
    fn: input.fn,
    source_id: input.sourceId ?? null,
    author_key: input.authorKey ?? null,
    content_hash: input.contentHash ?? null,
    blocked: true,
    block_reason: reason,
  });
  if (error) console.error("agent guard block log failed:", error.message);

  // 서킷 오픈(전역 상한)은 운영자에게 알림 — 같은 사유로 6시간 내 중복 알림 방지.
  if (notifyAdmin) {
    try {
      const since = new Date(Date.now() - 6 * 3600_000).toISOString();
      const { count } = await supabase
        .from("admin_notifications")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "agent_budget_exceeded")
        .gte("created_at", since);
      if ((count ?? 0) === 0) {
        await supabase.from("admin_notifications").insert({
          event_type: "agent_budget_exceeded",
          severity: "critical",
          message:
            `AI 에이전트 API 호출이 상한(${reason === "daily_cap" ? `일 ${DAILY_MAX}건` : `시간당 ${HOURLY_MAX}건`})에 도달해 ` +
            `자동 중단했습니다. 스팸/공격 가능성을 확인하세요 (agent_api_usage 테이블).`,
          payload: { fn: input.fn, reason, source_id: input.sourceId ?? null },
        });
      }
    } catch (e) {
      console.error("agent guard admin notify failed:", e);
    }
  }

  return { allowed: false, reason };
}
