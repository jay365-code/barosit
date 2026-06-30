// cm-agent-draft — 커뮤니티 운영자 "Aria" 답변 초안 생성기.
//
// 트리거: posts 테이블 INSERT 에 대한 Supabase DB Webhook.
// 동작: 글의 의도를 분류하고, 운영자가 개입할 가치가 있으면 답변 초안 + 근거 + 위험플래그를
//       생성해 ai_response_drafts(status='pending') 에 저장한다. 게시는 하지 않는다(사람 검수).
//
// 필요한 함수 시크릿:
//   ANTHROPIC_API_KEY (필수), ANTHROPIC_MODEL (선택, 기본 claude-sonnet-4-6)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (플랫폼이 자동 주입)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient } from "../_shared/admin.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { KNOWLEDGE_BASE } from "./knowledge.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";

// 사용자가 자유토론/챌린지로 분류한 글은 기본적으로 개입하지 않는다(잡담에 끼면 봇 티).
// 단 내용에 실질 질문/문제가 있으면 모델이 should_respond=true 로 올릴 수 있다.
const PASSIVE_CATEGORIES = ["📢 자유 토론", "🔥 자세인증 챌린지"];

const SYSTEM_PROMPT = `너는 BaroSit 의 공식 커뮤니티 운영자 "Aria" 다. 아래 지식베이스와 규칙에 따라,
새로 올라온 커뮤니티 글에 대해 (1) 의도를 분류하고 (2) 운영자가 개입할 가치가 있는지 판단하고
(3) 개입한다면 답변 초안을 작성한다. 반드시 submit_draft 도구를 호출해 결과를 제출한다.

개입 판단 기준:
- 질문/버그/기능제안/불만 → 보통 개입(should_respond=true).
- 단순 잡담/인사/자랑/챌린지 인증처럼 답이 필요 없는 또래 소통 → 개입하지 않음(should_respond=false).
- 애매하면 보수적으로: 굳이 운영자가 끼어들 필요가 없으면 false.
- 환불/결제/개인정보/법적/의학 단정이 필요한 건은 should_respond=false 로 두고 risk_flags 를 채워
  사람이 직접 처리하게 한다.

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
        enum: ["coach", "manager"],
        description: "답변 시 Aria 가 쓸 역할. 기술/자세/제품/버그 등 전문 답변=coach(자세 코치), " +
          "환영/공지/감사/커뮤니티 분위기/일반 소통=manager(커뮤니티 매니저).",
      },
      should_respond: {
        type: "boolean",
        description: "운영자(Aria)가 답변할 가치가 있는가.",
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
        description: "should_respond=true 일 때 Aria 의 답변 초안(작성자 언어, 서명 제외). false 면 빈 문자열.",
      },
    },
    required: ["intent", "agent_role", "should_respond", "reason", "language", "confidence", "risk_flags", "citations", "draft_body"],
  },
};

async function generateDraft(post: Record<string, unknown>) {
  const userContent = `[새 커뮤니티 글]
카테고리(작성자 선택): ${post.category ?? "(없음)"}
제목: ${post.title ?? ""}
내용:
${post.content ?? ""}`;

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
  return toolUse.input as {
    intent: string;
    agent_role: "coach" | "manager";
    should_respond: boolean;
    reason: string;
    language: string;
    confidence: number;
    risk_flags: string[];
    citations: { title: string; url?: string }[];
    draft_body: string;
  };
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

    const result = await generateDraft(post);

    // 자유토론/챌린지인데 모델도 개입 불필요로 판단하면 초안 자체를 만들지 않고 종료(노이즈 방지).
    const passiveCategory = PASSIVE_CATEGORIES.includes(String(post.category ?? ""));
    if (!result.should_respond && passiveCategory && result.risk_flags.length === 0) {
      return json({ message: "No draft created (passive chat, no response needed)", post_id: post.id });
    }

    const supabase = adminClient();
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
