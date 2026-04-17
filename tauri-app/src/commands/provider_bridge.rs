use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;

use crate::commands::provider_state::get_provider_state_merged;
use crate::secure::get_secure_store_secret;

const OFFICIAL_SOURCE_DOMAINS: &[&str] = &[
    "openai.com",
    "platform.openai.com",
    "developers.openai.com",
    "anthropic.com",
    "docs.anthropic.com",
    "ai.google.dev",
    "blog.google",
    "developers.googleblog.com",
];

fn read_required_string(payload: &Value, key: &str, error: &str) -> Result<String, String> {
    payload
        .get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| error.to_string())
}

fn read_bool(payload: &Value, key: &str) -> bool {
    payload
        .get(key)
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn is_compound_model(model: &str) -> bool {
    model == "groq/compound" || model == "groq/compound-mini"
}

fn is_gpt_oss_model(model: &str) -> bool {
    model == "openai/gpt-oss-120b" || model == "openai/gpt-oss-20b"
}

fn supports_vision(model: &str) -> bool {
    model == "meta-llama/llama-4-maverick-17b-128e-instruct"
        || model == "meta-llama/llama-4-scout-17b-16e-instruct"
}

fn gemini_endpoint(state: &Value) -> String {
    let endpoint = state
        .get("gemini")
        .and_then(|g| g.get("endpoint"))
        .and_then(|v| v.as_str())
        .unwrap_or("https://generativelanguage.googleapis.com/v1beta/models");
    let model = state
        .get("gemini")
        .and_then(|g| g.get("model"))
        .and_then(|v| v.as_str())
        .unwrap_or("gemini-3.1-flash-lite-preview");
    format!("{endpoint}/{model}:generateContent")
}

fn groq_endpoint(state: &Value) -> String {
    let endpoint = state
        .get("groq")
        .and_then(|g| g.get("endpoint"))
        .and_then(|v| v.as_str())
        .unwrap_or("https://api.groq.com/openai/v1");
    format!("{endpoint}/chat/completions")
}

fn groq_model(state: &Value) -> String {
    state
        .get("groq")
        .and_then(|g| g.get("model"))
        .and_then(|v| v.as_str())
        .unwrap_or("groq/compound-mini")
        .trim()
        .to_string()
}

fn gemini_thinking_config(model: &str) -> Value {
    if model.starts_with("gemini-3") {
        if model.contains("flash-lite") || model.contains("flash") {
            json!({ "thinkingLevel": "minimal" })
        } else {
            json!({ "thinkingLevel": "low" })
        }
    } else if model.starts_with("gemini-2.5") {
        json!({ "thinkingBudget": 0 })
    } else {
        Value::Null
    }
}

fn parse_data_url(url: &str) -> Result<(String, String), String> {
    let prefix = "data:";
    if !url.starts_with(prefix) {
        return Err("이미지 형식을 해석할 수 없습니다.".into());
    }
    let rest = &url[prefix.len()..];
    let semi = rest.find(';').ok_or("이미지 형식을 해석할 수 없습니다.")?;
    let mime = &rest[..semi];
    let after_semi = &rest[semi + 1..];
    if !after_semi.starts_with("base64,") {
        return Err("이미지 형식을 해석할 수 없습니다.".into());
    }
    let data = &after_semi[7..];
    Ok((mime.to_string(), data.to_string()))
}

fn extract_gemini_text(data: &Value) -> String {
    data.pointer("/candidates/0/content/parts")
        .and_then(|p| p.as_array())
        .map(|parts| {
            parts
                .iter()
                .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn extract_groq_text(data: &Value) -> String {
    data.pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

async fn invoke_gemini(state: &Value, operation: &str, payload: &Value) -> Result<Value, String> {
    if operation != "analyzeRisk" {
        return Err("지원하지 않는 Gemini 작업입니다.".into());
    }

    let api_key = get_secure_store_secret("gemini").await?;
    let endpoint = gemini_endpoint(state);
    let model = state
        .get("gemini")
        .and_then(|g| g.get("model"))
        .and_then(|v| v.as_str())
        .unwrap_or("gemini-3.1-flash-lite-preview")
        .trim()
        .to_string();
    let client = Client::new();
    let prompt = read_required_string(payload, "prompt", "분석 프롬프트가 없습니다.")?;
    let image_data_url = payload
        .get("imageDataUrl")
        .and_then(|v| v.as_str())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let mut parts = vec![json!({ "text": prompt })];

    if let Some(image_data_url) = image_data_url {
        let (mime_type, data) = parse_data_url(image_data_url)?;
        parts.push(json!({
            "inline_data": {
                "mime_type": mime_type,
                "data": data,
            }
        }));
    }

    let use_web_search = read_bool(payload, "useWebSearch");
    let non_search_max_output = if model.contains("pro") { 420 } else { 320 };
    let mut schema_properties = json!({
        "summary": {
            "type": "string",
            "description": "짧은 1문장"
        },
        "responseText": {
            "type": "string",
            "description": "최대 2개의 짧은 문장"
        },
        "evidence": {
            "type": "array",
            "minItems": 1,
            "maxItems": 2,
            "items": { "type": "string" }
        }
    });
    if use_web_search {
        schema_properties["freshnessNote"] = json!({ "type": ["string", "null"] });
    }
    if image_data_url.is_some() {
        schema_properties["extractedText"] = json!({ "type": ["string", "null"] });
    }
    let thinking_config = gemini_thinking_config(&model);
    let resp = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", &api_key)
        .timeout(Duration::from_secs(if use_web_search { 35 } else { 15 }))
        .json(&json!({
            "contents": [{
                "role": "user",
                "parts": parts
            }],
            "tools": if use_web_search { json!([{ "google_search": {} }]) } else { json!([]) },
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": if use_web_search || image_data_url.is_some() { 420 } else { non_search_max_output },
                "responseMimeType": "application/json",
                "responseJsonSchema": {
                    "type": "object",
                    "properties": schema_properties,
                    "required": ["summary", "responseText", "evidence"]
                },
                "thinkingConfig": thinking_config
            }
        }))
        .send()
        .await
        .map_err(|e| format!("Gemini 분석 실패: {e}"))?;

    let status = resp.status();
    if status.as_u16() == 429 {
        return Err("Gemini 할당량을 초과했습니다.".into());
    }
    if !status.is_success() {
        let error_text = resp.text().await.unwrap_or_default();
        return Err(format!("Gemini 분석 실패: {status} {error_text}"));
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let text = extract_gemini_text(&data);
    if text.is_empty() {
        return Err("Gemini 분석 응답이 비어 있습니다.".into());
    }

    Ok(json!(text))
}

async fn invoke_groq(state: &Value, operation: &str, payload: &Value) -> Result<Value, String> {
    if operation != "analyzeRisk" {
        return Err("지원하지 않는 Groq 작업입니다.".into());
    }

    let api_key = get_secure_store_secret("groq").await?;
    let selected_model = groq_model(state);
    let prompt = read_required_string(payload, "prompt", "분석 프롬프트가 없습니다.")?;
    let image_data_url = payload
        .get("imageDataUrl")
        .and_then(|v| v.as_str())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let use_vision = image_data_url.is_some();
    let model = if use_vision {
        if supports_vision(&selected_model) {
            selected_model.clone()
        } else {
            "meta-llama/llama-4-scout-17b-16e-instruct".to_string()
        }
    } else if selected_model.is_empty() {
        "groq/compound-mini".to_string()
    } else {
        selected_model.clone()
    };
    let use_web_search = read_bool(payload, "useWebSearch") && !use_vision;
    let client = Client::new();
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("Authorization", format!("Bearer {api_key}").parse().unwrap());
    headers.insert("Content-Type", "application/json".parse().unwrap());

    let message_content = if let Some(image_data_url) = image_data_url {
        json!([
            { "type": "text", "text": prompt },
            { "type": "image_url", "image_url": { "url": image_data_url } }
        ])
    } else {
        json!(prompt)
    };

    let mut body = json!({
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": message_content
            }
        ],
        "temperature": 0.1,
        "max_completion_tokens": if use_web_search || use_vision { 700 } else { 240 },
        "response_format": { "type": "json_object" }
    });

    if is_compound_model(&model) {
        body["compound_custom"] = json!({
            "tools": {
                "enabled_tools": if use_web_search { json!(["web_search"]) } else { json!([]) }
            }
        });
    }

    if use_web_search {
        if is_compound_model(&model) {
            headers.insert("Groq-Model-Version", "latest".parse().unwrap());
            body["search_settings"] = json!({
                "include_domains": OFFICIAL_SOURCE_DOMAINS
            });
        } else if is_gpt_oss_model(&model) {
            body["tools"] = json!([{ "type": "browser_search" }]);
            body["tool_choice"] = json!("required");
            body["search_settings"] = json!({
                "include_domains": OFFICIAL_SOURCE_DOMAINS
            });
        }
    }

    let resp = client
        .post(&groq_endpoint(state))
        .headers(headers)
        .timeout(Duration::from_secs(if use_web_search { 30 } else { 20 }))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Groq 분석 실패: {e}"))?;

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    if let Some(err) = data
        .get("error")
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
    {
        return Err(err.to_string());
    }

    let text = extract_groq_text(&data);
    if text.is_empty() {
        return Err("Groq 분석 응답이 비어 있습니다.".into());
    }

    Ok(json!(text))
}

#[tauri::command]
pub async fn kwc_provider_bridge_invoke(
    provider: String,
    operation: String,
    payload: Value,
) -> Result<Value, String> {
    let state = get_provider_state_merged().await;
    let payload = if payload.is_null() {
        json!({})
    } else {
        payload
    };

    match provider.as_str() {
        "gemini" => invoke_gemini(&state, &operation, &payload).await,
        "groq" => invoke_groq(&state, &operation, &payload).await,
        _ => Err("지원하지 않는 provider bridge 요청입니다.".into()),
    }
}
