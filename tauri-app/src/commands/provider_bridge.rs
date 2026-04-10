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

fn extract_json_object(text: &str) -> Result<String, String> {
    let candidate = if let Some(caps) = text.find("```") {
        let after = &text[caps + 3..];
        let skip_lang = if after.starts_with("json") {
            &after[4..]
        } else {
            after
        };
        if let Some(end) = skip_lang.find("```") {
            skip_lang[..end].trim().to_string()
        } else {
            text.to_string()
        }
    } else {
        text.to_string()
    };

    let start = candidate.find('{').ok_or("JSON 응답을 찾지 못했습니다.")?;
    let end = candidate
        .rfind('}')
        .ok_or("JSON 응답을 찾지 못했습니다.")?;
    if end <= start {
        return Err("JSON 응답을 찾지 못했습니다.".into());
    }
    Ok(candidate[start..=end].to_string())
}

fn read_required_string(payload: &Value, key: &str, error: &str) -> Result<String, String> {
    payload
        .get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| error.to_string())
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

fn gpt_oss_tools(enabled_tools: &[String]) -> Vec<Value> {
    let mut tools = vec![];
    if enabled_tools.iter().any(|t| t == "web_search") {
        tools.push(json!({"type": "browser_search"}));
    }
    if enabled_tools.iter().any(|t| t == "code_interpreter") {
        tools.push(json!({"type": "code_interpreter"}));
    }
    tools
}

fn locale(state: &Value) -> &str {
    state
        .get("uiLocale")
        .and_then(|v| v.as_str())
        .unwrap_or("ko")
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
        .unwrap_or("gemini-3.1-pro-preview");
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
        .unwrap_or("groq/compound")
        .trim()
        .to_string()
}

fn groq_enabled_tools(state: &Value) -> Vec<String> {
    state
        .get("groq")
        .and_then(|g| g.get("enabledTools"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

async fn invoke_gemini(state: &Value, operation: &str, payload: &Value) -> Result<Value, String> {
    let api_key = get_secure_store_secret("gemini").await?;
    let endpoint = gemini_endpoint(state);
    let client = Client::new();
    let is_en = locale(state) == "en";

    match operation {
        "summarize" => {
            let prompt = read_required_string(payload, "prompt", "요약 프롬프트가 없습니다.")?;
            let resp = client
                .post(&endpoint)
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", &api_key)
                .timeout(Duration::from_secs(8))
                .json(&json!({
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}]
                }))
                .send()
                .await
                .map_err(|e| format!("Gemini 호출 실패: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!("Gemini 호출 실패: {}", resp.status()));
            }

            let data: Value = resp.json().await.map_err(|e| e.to_string())?;
            let text = data
                .pointer("/candidates/0/content/parts")
                .and_then(|p| p.as_array())
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();

            if text.trim().is_empty() {
                return Err("Gemini 응답을 해석할 수 없습니다.".into());
            }
            Ok(json!(text.trim()))
        }
        "extractTextFromImage" => {
            let image_data_url =
                read_required_string(payload, "imageDataUrl", "이미지 데이터가 없습니다.")?;
            let (mime_type, data) = parse_data_url(&image_data_url)?;

            let ocr_prompt = if is_en {
                "Read this image like OCR and extract the visible text as faithfully as possible. Return text only, with no explanation or summary. Preserve the original line breaks as much as possible."
            } else {
                "이 이미지를 OCR처럼 읽고 보이는 글자를 한국어로 그대로 추출해 주세요. 설명, 요약, 해설 없이 텍스트만 반환하세요. 줄바꿈은 원문 구조를 최대한 유지하세요."
            };

            let resp = client
                .post(&endpoint)
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", &api_key)
                .timeout(Duration::from_secs(20))
                .json(&json!({
                    "contents": [{
                        "role": "user",
                        "parts": [
                            {"text": ocr_prompt},
                            {"inline_data": {"mime_type": mime_type, "data": data}}
                        ]
                    }]
                }))
                .send()
                .await
                .map_err(|e| format!("Gemini 이미지 인식 실패: {e}"))?;

            let status = resp.status();
            if status.as_u16() == 429 {
                return Err("Gemini 할당량을 초과했습니다.".into());
            }
            if !status.is_success() {
                let error_text = resp.text().await.unwrap_or_default();
                return Err(format!("Gemini 이미지 인식 실패: {status} {error_text}"));
            }

            let data: Value = resp.json().await.map_err(|e| e.to_string())?;
            let text = extract_candidate_text(&data);
            if text.is_empty() {
                return Err("Gemini 이미지 인식 응답이 비어 있습니다.".into());
            }
            Ok(json!(text))
        }
        "verifyFreshness" => {
            let text = read_required_string(payload, "text", "검증할 텍스트가 없습니다.")?;
            let prompt = build_freshness_prompt(is_en, &text);

            let resp = client
                .post(&endpoint)
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", &api_key)
                .timeout(Duration::from_secs(15))
                .json(&json!({
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "tools": [{"google_search": {}}]
                }))
                .send()
                .await
                .map_err(|e| format!("Gemini 최신성 검증 실패: {e}"))?;

            let status = resp.status();
            if status.as_u16() == 429 {
                return Err("Gemini 할당량을 초과했습니다.".into());
            }
            if !status.is_success() {
                let error_text = resp.text().await.unwrap_or_default();
                return Err(format!("Gemini 최신성 검증 실패: {status} {error_text}"));
            }

            let data: Value = resp.json().await.map_err(|e| e.to_string())?;
            let content = extract_candidate_text(&data);
            if content.is_empty() {
                return Err("Gemini 최신성 검증 응답이 비어 있습니다.".into());
            }

            let json_str = extract_json_object(&content)?;
            let parsed: Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
            Ok(build_freshness_result(&parsed, is_en))
        }
        _ => Err("지원하지 않는 Gemini 작업입니다.".into()),
    }
}

async fn invoke_groq(state: &Value, operation: &str, payload: &Value) -> Result<Value, String> {
    let api_key = get_secure_store_secret("groq").await?;
    let selected_model = groq_model(state);
    let model = if selected_model.is_empty() {
        "groq/compound".to_string()
    } else {
        selected_model
    };
    let client = Client::new();
    let is_en = locale(state) == "en";

    match operation {
        "summarize" => {
            let prompt = read_required_string(payload, "prompt", "요약 프롬프트가 없습니다.")?;
            let system_msg = if is_en {
                "You are K-WarningCheck's explanation assistant. Keep the judgment intact and answer in exactly one English sentence."
            } else {
                "K-워닝체크의 보조 요약기입니다. 판정 기준을 바꾸지 말고 한국어 1문장으로만 답하세요."
            };

            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert("Authorization", format!("Bearer {api_key}").parse().unwrap());
            headers.insert("Content-Type", "application/json".parse().unwrap());

            let mut body = json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.1
            });

            if is_compound_model(&model) {
                headers.insert("Groq-Model-Version", "latest".parse().unwrap());
                body["compound_custom"] = json!({
                    "tools": {"enabled_tools": groq_enabled_tools(state)}
                });
            } else if is_gpt_oss_model(&model) {
                let tools = gpt_oss_tools(&groq_enabled_tools(state));
                if !tools.is_empty() {
                    body["tools"] = json!(tools);
                }
            }

            let resp = client
                .post(&groq_endpoint(state))
                .headers(headers)
                .timeout(Duration::from_secs(8))
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Groq 호출 실패: {e}"))?;

            let data: Value = resp.json().await.map_err(|e| e.to_string())?;
            if let Some(err) = data.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()) {
                return Err(err.to_string());
            }

            let text = data
                .pointer("/choices/0/message/content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if text.is_empty() {
                return Err("Groq 응답을 해석할 수 없습니다.".into());
            }
            Ok(json!(text))
        }
        "extractTextFromImage" => {
            let image_data_url =
                read_required_string(payload, "imageDataUrl", "이미지 데이터가 없습니다.")?;
            let vision_model = if supports_vision(&model) {
                model.clone()
            } else {
                "meta-llama/llama-4-scout-17b-16e-instruct".to_string()
            };

            let ocr_prompt = if is_en {
                "Read this image like OCR and extract the visible text as faithfully as possible. Return text only, with no explanation or summary. Preserve the original line breaks as much as possible."
            } else {
                "이 이미지를 OCR처럼 읽고 보이는 글자를 한국어로 그대로 추출해 주세요. 설명, 요약, 해설 없이 텍스트만 반환하세요. 줄바꿈은 원문 구조를 최대한 유지하세요."
            };

            let resp = client
                .post(&groq_endpoint(state))
                .header("Authorization", format!("Bearer {api_key}"))
                .header("Content-Type", "application/json")
                .timeout(Duration::from_secs(20))
                .json(&json!({
                    "model": vision_model,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": ocr_prompt},
                            {"type": "image_url", "image_url": {"url": image_data_url}}
                        ]
                    }],
                    "temperature": 0,
                    "max_completion_tokens": 2048
                }))
                .send()
                .await
                .map_err(|e| format!("Groq 이미지 인식 실패: {e}"))?;

            let data: Value = resp.json().await.map_err(|e| e.to_string())?;
            if let Some(err) = data.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()) {
                return Err(err.to_string());
            }

            let text = data
                .pointer("/choices/0/message/content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if text.is_empty() {
                return Err("Groq 이미지 인식 응답이 비어 있습니다.".into());
            }
            Ok(json!(text))
        }
        "verifyFreshness" => {
            let text = read_required_string(payload, "text", "검증할 텍스트가 없습니다.")?;

            if !(is_compound_model(&model) || is_gpt_oss_model(&model)) {
                return Err(
                    "현재 선택한 Groq 모델은 웹 검색 최신성 검증을 지원하지 않습니다.".into(),
                );
            }

            let system_msg = if is_en {
                "You verify freshness claims about AI models and services. You must use web search and prioritize official documentation, official release notes, and official product pages. Return JSON only."
            } else {
                "당신은 AI 모델·서비스 최신성 검증기입니다. 반드시 웹 검색을 사용해 공식 문서, 공식 릴리스 노트, 공식 제품 페이지를 우선 확인하세요. 반드시 JSON만 반환하세요."
            };

            let user_msg = build_freshness_prompt(is_en, &text);

            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert("Authorization", format!("Bearer {api_key}").parse().unwrap());
            headers.insert("Content-Type", "application/json".parse().unwrap());

            let mut body = json!({
                "model": model,
                "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg}
                ],
                "temperature": 0
            });

            if is_compound_model(&model) {
                headers.insert("Groq-Model-Version", "latest".parse().unwrap());
                body["compound_custom"] = json!({
                    "tools": {"enabled_tools": ["web_search"]}
                });
                body["search_settings"] = json!({
                    "include_domains": OFFICIAL_SOURCE_DOMAINS
                });
            } else {
                body["tools"] = json!([{"type": "browser_search"}]);
                body["tool_choice"] = json!("required");
                body["search_settings"] = json!({
                    "include_domains": OFFICIAL_SOURCE_DOMAINS
                });
            }

            let resp = client
                .post(&groq_endpoint(state))
                .headers(headers)
                .timeout(Duration::from_secs(15))
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Groq 최신성 검증 실패: {e}"))?;

            let data: Value = resp.json().await.map_err(|e| e.to_string())?;
            if let Some(err) = data.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()) {
                return Err(err.to_string());
            }

            let content = data
                .pointer("/choices/0/message/content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if content.is_empty() {
                return Err("Groq 최신성 검증 응답이 비어 있습니다.".into());
            }

            let json_str = extract_json_object(&content)?;
            let parsed: Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
            Ok(build_freshness_result(&parsed, is_en))
        }
        _ => Err("지원하지 않는 Groq 작업입니다.".into()),
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

fn extract_candidate_text(data: &Value) -> String {
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

fn build_freshness_prompt(is_en: bool, text: &str) -> String {
    let truncated = if text.len() > 2400 {
        &text[..2400]
    } else {
        text
    };

    if is_en {
        format!(
            "Verify only claims about AI models, versions, deprecation status, or whether they are current flagship models.\n\
             You must use web search and prioritize official documentation, official release notes, and official product pages.\n\
             Use confirmed_outdated or confirmed_current only when the claim is clearly verified. Otherwise use inconclusive.\n\
             Return only the JSON below.\n\
             {{\"status\":\"confirmed_outdated|confirmed_current|inconclusive\",\"summary\":\"one short English sentence\",\"checkedClaims\":[\"...\"],\"references\":[{{\"title\":\"...\",\"url\":\"https://...\"}}]}}\n\n\
             {truncated}"
        )
    } else {
        format!(
            "다음 문장에서 AI 모델, 버전, deprecated 여부, 현재 주력 모델 여부와 관련된 주장만 검증하세요.\n\
             반드시 웹 검색을 사용하고 공식 문서, 공식 릴리스 노트, 공식 제품 페이지를 우선하세요.\n\
             확실히 확인된 경우에만 confirmed_outdated 또는 confirmed_current를 사용하고, 애매하면 inconclusive를 사용하세요.\n\
             반드시 아래 JSON만 반환하세요.\n\
             {{\"status\":\"confirmed_outdated|confirmed_current|inconclusive\",\"summary\":\"짧은 한국어 1문장\",\"checkedClaims\":[\"...\"],\"references\":[{{\"title\":\"...\",\"url\":\"https://...\"}}]}}\n\n\
             {truncated}"
        )
    }
}

fn build_freshness_result(parsed: &Value, is_en: bool) -> Value {
    let default_summary = if is_en {
        "The web freshness result could not be interpreted."
    } else {
        "웹 검색 기반 최신성 검증 결과를 해석하지 못했습니다."
    };
    let summary = parsed
        .get("summary")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(default_summary);

    let checked_claims = parsed
        .get("checkedClaims")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().take(5).cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    let references = parsed
        .get("references")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().take(3).cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    json!({
        "status": parsed.get("status").and_then(|v| v.as_str()).unwrap_or("inconclusive"),
        "messageKey": "provider",
        "providerSummaryLocale": if is_en { "en" } else { "ko" },
        "providerSummaryText": summary,
        "summary": summary,
        "checkedClaims": checked_claims,
        "references": references,
    })
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
