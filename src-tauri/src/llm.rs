use serde::{Deserialize, Serialize};

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const MODEL: &str = "claude-haiku-4-5";

const SYSTEM_PROMPT: &str = "당신은 자세 코치입니다. 사용자가 컴퓨터 작업 중 잘못된 자세를 취했다는 알림을 받았습니다. \
사용자에게 보낼 한국어 코칭 메시지를 한 문장 또는 두 문장으로 작성하세요.\n\n\
규칙:\n\
- 친근하고 격려하는 톤 (꾸짖지 말 것)\n\
- 구체적인 행동 제안 1개 포함 (예: 어깨 뒤로 펴기, 모니터 5cm 올리기, 1분 스트레칭)\n\
- 50자 ~ 80자 사이\n\
- 이모지 1개 정도까지만 허용\n\
- 응답은 코칭 메시지 본문만 출력 (인사말, 머리말 없이)";

#[derive(Debug, Serialize)]
pub struct CoachingRequest {
    pub posture_type: String,
    pub duration_secs: u32,
    pub today_count_for_type: u32,
    pub hour: u32,
}

#[derive(Debug, Serialize)]
struct AnthropicTextBlock<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
    text: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<CacheControl<'a>>,
}

#[derive(Debug, Serialize)]
struct CacheControl<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
}

#[derive(Debug, Serialize)]
struct Message<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Debug, Serialize)]
struct AnthropicRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    system: Vec<AnthropicTextBlock<'a>>,
    messages: Vec<Message<'a>>,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContentBlock>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    kind: String,
    text: String,
}

fn translate_posture(posture_type: &str) -> &'static str {
    match posture_type {
        "forward_head" => "거북목 (목이 앞으로 빠짐)",
        "chin_resting" => "턱 괴기",
        "shoulder_tilt" => "한쪽 어깨가 기울어짐",
        "slouching" => "등이 굽고 어깨가 말림",
        _ => "잘못된 자세",
    }
}

pub async fn generate_coaching_message(
    api_key: &str,
    req: CoachingRequest,
) -> Result<String, String> {
    let user_message = format!(
        "감지된 자세: {}\n지속 시간: {}초\n오늘 같은 자세 알림 횟수: {}회\n현재 시각: {}시",
        translate_posture(&req.posture_type),
        req.duration_secs,
        req.today_count_for_type,
        req.hour,
    );

    let body = AnthropicRequest {
        model: MODEL,
        max_tokens: 200,
        system: vec![AnthropicTextBlock {
            kind: "text",
            text: SYSTEM_PROMPT,
            cache_control: Some(CacheControl { kind: "ephemeral" }),
        }],
        messages: vec![Message {
            role: "user",
            content: &user_message,
        }],
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(ANTHROPIC_API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("network error: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("response read error: {}", e))?;

    if !status.is_success() {
        return Err(format!("anthropic api {}: {}", status.as_u16(), text));
    }

    let parsed: AnthropicResponse = serde_json::from_str(&text)
        .map_err(|e| format!("parse error: {} ({})", e, text))?;

    parsed
        .content
        .into_iter()
        .next()
        .map(|c| c.text)
        .ok_or_else(|| "empty response".to_string())
}
