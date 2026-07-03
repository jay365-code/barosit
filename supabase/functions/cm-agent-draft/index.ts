// cm-agent-draft — 커뮤니티 에이전트 답변 초안 생성기 (Aria + Ethan).
//
// 트리거: posts 테이블 INSERT 에 대한 Supabase DB Webhook.
// 동작: 글의 의도를 분류하고, 개입할 가치가 있으면 답변 초안 + 근거 + 위험플래그를
//       생성해 ai_response_drafts(status='pending') 에 저장한다. 게시는 하지 않는다(사람 검수).
// 페르소나(docs/agent-roster.md):
//   - Aria(아리아)  = 커뮤니티 매니저·자세 코치 — 질문/버그/불만 응대 (agent_role: coach|manager)
//   - Ethan(이든)   = 프로덕트 매니저 — 기능 제안 접수·중복 클러스터링·상태 회신 (agent_role: pm)
// 방어: _shared/agentGuard.ts 서킷브레이커 — 스팸/공격으로 글이 폭주해도 Anthropic API
//       호출이 상한(일/시간/작성자/중복)에서 자동 중단된다. 요금 폭탄 방지.
//
// 필요한 함수 시크릿:
//   ANTHROPIC_API_KEY (필수), ANTHROPIC_MODEL (선택, 기본 claude-sonnet-4-6)
//   AGENT_GUARD_DAILY_MAX / HOURLY_MAX / AUTHOR_MAX (선택 — agentGuard.ts 참조)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (플랫폼이 자동 주입)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient } from "../_shared/admin.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { checkAgentGuard, contentHashOf, recordAgentCall } from "../_shared/agentGuard.ts";
import { KNOWLEDGE_BASE } from "./knowledge.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";

// 사용자가 자유토론/챌린지로 분류한 글은 기본적으로 개입하지 않는다(잡담에 끼면 봇 티).
// 단 내용에 실질 질문/문제가 있으면 모델이 should_respond=true 로 올릴 수 있다.
const PASSIVE_CATEGORIES = ["📢 자유 토론", "🔥 자세인증 챌린지"];

const SYSTEM_PROMPT = `너는 BaroSit 커뮤니티에서 활동하는 두 명의 공식 에이전트를 대행한다.
아래 지식베이스와 규칙에 따라, 새로 올라온 커뮤니티 글에 대해 (1) 의도를 분류하고
(2) 개입할 가치가 있는지 판단하고 (3) 개입한다면 담당 페르소나의 답변 초안을 작성한다.
반드시 submit_draft 도구를 호출해 결과를 제출한다.

페르소나(의도에 따라 자동 배정):
- "Aria(아리아)" — 커뮤니티 매니저·자세 코치. 질문/버그/불만/소통 담당.
  따뜻하고 친근한 톤. agent_role: 기술/자세/제품/버그 답변=coach, 환영/공지/소통=manager.
- "Ethan(이든)" — 프로덕트 매니저. 기능 제안(intent=feature_request) 담당. agent_role=pm.
  간결하고 명확한 전문가 톤, 사실 기반, 과장 없음.
  Ethan 답변 규칙: ① 제안을 요약해 정확히 이해했음을 보여준다 ② [기존 기능 요청 클러스터]에
  같은 제안이 있으면 "같은 제안을 N명이 요청했고 현재 상태는 X"라고 알린다(새 제안이면 접수
  사실과 '검토중' 상태를 알린다) ③ 출시 시점·가격·확정 약속은 절대 하지 않는다 — 상태는
  검토중/예정/진행중/완료만 언급 ④ 반영 여부와 무관하게 제안 자체에 감사를 표한다.

개입 판단 기준:
- 질문/버그/기능제안/불만 → 보통 개입(should_respond=true).
- 단순 잡담/인사/자랑/챌린지 인증처럼 답이 필요 없는 또래 소통 → 개입하지 않음(should_respond=false).
- 애매하면 보수적으로: 굳이 운영자가 끼어들 필요가 없으면 false.
- 환불/결제/개인정보/법적/의학 단정이 필요한 건은 should_respond=false 로 두고 risk_flags 를 채워
  사람이 직접 처리하게 한다.

기능 제안 클러스터링(intent=feature_request 일 때만):
- 사용자 메시지의 [기존 기능 요청 클러스터] 목록과 대조해, 본질적으로 같은 기능을 원하는
  제안이면 feature_matched_id 에 그 클러스터 id 를 넣는다(표현이 달라도 목적이 같으면 매칭).
- 목록에 없으면 feature_matched_id=null 로 두고 feature_title 에 새 클러스터의 대표 제목을
  한국어 한 줄(20자 내외)로 정규화해 넣는다.

${KNOWLEDGE_BASE}`;

const DRAFT_TOOL = {
  name: "submit_draft",
  description: "분류 결과와 답변 초안을 제출한다.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["question", "feature_request", "bug", "complaint", "chat", "challenge", "other"],
        description: "글의 실제 의도(카테고리 태그가 아니라 내용 기준).",
      },
      agent_role: {
        type: "string",
        enum: ["coach", "manager", "pm"],
        description: "답변 페르소나의 역할. 기술/자세/제품/버그 등 전문 답변=coach(Aria·자세 코치), " +
          "환영/공지/감사/커뮤니티 분위기/일반 소통=manager(Aria·커뮤니티 매니저), " +
          "기능 제안(intent=feature_request)=pm(Ethan·프로덕트 매니저).",
      },
      should_respond: {
        type: "boolean",
        description: "에이전트가 답변할 가치가 있는가.",
      },
      reason: {
        type: "string",
        description: "왜 답하려는지/왜 안 답하려는지 검수자용 한 줄 사유(한국어).",
      },
      language: { type: "string", enum: ["ko", "en", "ja"], description: "글 작성자의 언어." },
      confidence: { type: "number", description: "답변 정확도 자신감 0.0~1.0." },
      risk_flags: {
        type: "array",
        items: { type: "string", enum: ["refund", "payment", "privacy", "legal", "medical", "unknown"] },
        description: "사람이 직접 처리해야 할 위험 요소. 없으면 빈 배열.",
      },
      citations: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, url: { type: "string" } },
          required: ["title"],
        },
        description: "답변 근거 출처(지식베이스/공식 문서). 없으면 빈 배열.",
      },
      draft_body: {
        type: "string",
        description: "should_respond=true 일 때 답변 초안(작성자 언어, 서명 제외). false 면 빈 문자열.",
      },
      feature_matched_id: {
        type: ["string", "null"],
        description: "intent=feature_request 이고 [기존 기능 요청 클러스터]에 같은 제안이 있으면 그 id. " +
          "없거나 기능 제안이 아니면 null.",
      },
      feature_title: {
        type: ["string", "null"],
        description: "intent=feature_request 이고 새 클러스터일 때 대표 제목(한국어, 20자 내외). 그 외 null.",
      },
    },
    required: ["intent", "agent_role", "should_respond", "reason", "language", "confidence", "risk_flags", "citations", "draft_body"],
  },
};

type DraftResult = {
  intent: string;
  agent_role: "coach" | "manager" | "pm";
  should_respond: boolean;
  reason: string;
  language: string;
  confidence: number;
  risk_flags: string[];
  citations: { title: string; url?: string }[];
  draft_body: string;
  feature_matched_id?: string | null;
  feature_title?: string | null;
};

type FeatureCluster = { id: string; title: string; status: string; request_count: number };

async function generateDraft(post: Record<string, unknown>, clusters: FeatureCluster[]) {
  const clusterBlock = clusters.length
    ? `\n\n[기존 기능 요청 클러스터]\n${clusters
      .map((c) => `- id=${c.id} · "${c.title}" · 상태=${c.status} · 요청 ${c.request_count}건`)
      .join("\n")}`
    : "\n\n[기존 기능 요청 클러스터]\n(없음)";

  const userContent = `[새 커뮤니티 글]
카테고리(작성자 선택): ${post.category ?? "(없음)"}
제목: ${post.title ?? ""}
내용:
${post.content ?? ""}${clusterBlock}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: [
        // 지식베이스/규칙은 매 호출 동일 → prompt caching 으로 비용 절감.
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      tools: [DRAFT_TOOL],
      tool_choice: { type: "tool", name: "submit_draft" },
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const toolUse = (data.content ?? []).find((b: { type: string }) => b.type === "tool_use");
  if (!toolUse) throw new Error("No tool_use block in Anthropic response");
  return toolUse.input as DraftResult;
}

// intent=feature_request → 클러스터 upsert + 글 링크. 실패해도 초안 저장은 계속한다.
async function upsertFeatureCluster(
  supabase: ReturnType<typeof adminClient>,
  postId: string,
  postTitle: string,
  result: DraftResult,
  clusters: FeatureCluster[],
): Promise<string | null> {
  try {
    let clusterId: string | null = null;

    // 모델이 매칭한 id 는 반드시 주입한 목록 안의 것만 신뢰(환각 id 방지).
    if (result.feature_matched_id && clusters.some((c) => c.id === result.feature_matched_id)) {
      clusterId = result.feature_matched_id;
    } else {
      const title = (result.feature_title ?? "").trim() || postTitle.trim() || "(제목 없는 기능 제안)";
      const { data, error } = await supabase
        .from("feature_requests")
        .insert({ title })
        .select("id")
        .single();
      if (error) throw error;
      clusterId = data.id;
    }

    const { error: linkErr } = await supabase
      .from("feature_request_posts")
      .upsert({ feature_request_id: clusterId, post_id: postId }, { onConflict: "post_id", ignoreDuplicates: true });
    if (linkErr) throw linkErr;

    return clusterId;
  } catch (e) {
    console.error("feature cluster upsert failed:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");

    const payload = await req.json();
    if (payload.type !== "INSERT" || payload.table !== "posts") {
      return json({ message: `Skipping ${payload.type} on ${payload.table}` });
    }

    const post = payload.record;
    if (!post?.id) throw new Error("No post record in payload");

    const supabase = adminClient();

    // ── 요금 폭탄 방어: Anthropic 호출 전에 서킷브레이커 통과 필수 ──
    const authorKey = String(post.user_id ?? post.author_name ?? "anonymous");
    const hash = await contentHashOf(String(post.title ?? ""), String(post.content ?? ""));
    const guard = await checkAgentGuard(supabase, {
      fn: "cm-agent-draft",
      sourceId: post.id,
      authorKey,
      contentHash: hash,
    });
    if (!guard.allowed) {
      console.warn(`agent guard blocked post ${post.id}: ${guard.reason}`);
      return json({ message: `Blocked by agent guard (${guard.reason})`, post_id: post.id });
    }

    // 기능 제안 클러스터 목록(열린 것만) — Ethan 의 중복 클러스터링 판단 재료.
    const { data: clusterRows } = await supabase
      .from("feature_requests")
      .select("id, title, status, request_count")
      .neq("status", "declined")
      .order("updated_at", { ascending: false })
      .limit(100);
    const clusters = (clusterRows ?? []) as FeatureCluster[];

    const result = await generateDraft(post, clusters);
    await recordAgentCall(supabase, {
      fn: "cm-agent-draft",
      sourceId: post.id,
      authorKey,
      contentHash: hash,
    });

    // 자유토론/챌린지인데 모델도 개입 불필요로 판단하면 초안 자체를 만들지 않고 종료(노이즈 방지).
    const passiveCategory = PASSIVE_CATEGORIES.includes(String(post.category ?? ""));
    if (!result.should_respond && passiveCategory && result.risk_flags.length === 0) {
      return json({ message: "No draft created (passive chat, no response needed)", post_id: post.id });
    }

    // 기능 제안이면 클러스터 반영(Ethan 소관). 초안 저장 전에 해서 draft 에 id 를 연결한다.
    let featureRequestId: string | null = null;
    if (result.intent === "feature_request") {
      featureRequestId = await upsertFeatureCluster(supabase, post.id, String(post.title ?? ""), result, clusters);
    }

    const { error } = await supabase
      .from("ai_response_drafts")
      .upsert(
        {
          source_type: "post",
          source_id: post.id,
          post_id: post.id,
          intent: result.intent,
          agent_role: result.agent_role,
          category: post.category ?? null,
          should_respond: result.should_respond,
          reason: result.reason,
          language: result.language,
          confidence: result.confidence,
          risk_flags: result.risk_flags,
          citations: result.citations,
          draft_body: result.draft_body,
          feature_request_id: featureRequestId,
          status: "pending",
        },
        { onConflict: "source_type,source_id" },
      );

    if (error) throw new Error(`DB insert failed: ${error.message}`);

    return json({ success: true, post_id: post.id, should_respond: result.should_respond });
  } catch (error) {
    console.error("cm-agent-draft error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
