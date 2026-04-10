use serde_json::{json, Value};
use std::sync::Arc;

use crate::commands::history::HistoryStore;
use crate::secure::derive_secure_store_status_from_state;
use crate::store::{kwc_data_dir, read_json, write_json};

fn provider_state_path() -> std::path::PathBuf {
    kwc_data_dir().join("provider-state.json")
}

fn default_provider_state() -> Value {
    json!({
        "uiLocale": "ko",
        "onboardingCompleted": false,
        "preferredProvider": "codex",
        "webSearchEnabled": true,
        "theme": "system",
        "autoUseConfiguredProviders": true,
        "remoteExplanationEnabled": false,
        "remoteOcrEnabled": false,
        "gemini": {
            "model": "gemini-3.1-pro-preview",
            "endpoint": "https://generativelanguage.googleapis.com/v1beta/models",
            "apiKeyRetention": "7d",
            "hasSecret": false,
            "storageBackend": null,
            "expiresAt": null,
            "lastValidationAt": null
        },
        "groq": {
            "model": "groq/compound",
            "endpoint": "https://api.groq.com/openai/v1",
            "apiKeyRetention": "7d",
            "enabledTools": ["web_search", "code_interpreter", "visit_website", "browser_automation", "wolfram_alpha"],
            "hasSecret": false,
            "storageBackend": null,
            "expiresAt": null,
            "lastValidationAt": null
        },
        "codex": {
            "bridgeUrl": "http://127.0.0.1:4317",
            "bridgeToken": "",
            "workspaceRoot": "",
            "loginCommand": "codex login",
            "model": "gpt-5.4-mini",
            "reasoningEffort": "low"
        }
    })
}

fn get_system_ui_locale() -> &'static str {
    let locale = sys_locale::get_locale().unwrap_or_else(|| "ko-KR".to_string());
    if locale.to_lowercase().starts_with("en") {
        "en"
    } else {
        "ko"
    }
}

fn merge_objects(base: &Value, overlay: &Value) -> Value {
    match (base, overlay) {
        (Value::Object(b), Value::Object(o)) => {
            let mut merged = b.clone();
            for (k, v) in o {
                merged.insert(k.clone(), v.clone());
            }
            Value::Object(merged)
        }
        (_, overlay) if !overlay.is_null() => overlay.clone(),
        (base, _) => base.clone(),
    }
}

fn is_provider_selectable(state: &Value, provider: &str) -> bool {
    match provider {
        "codex" => !state
            .get("webSearchEnabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        "gemini" => {
            let section = state.get("gemini").unwrap_or(&Value::Null);
            section
                .get("hasSecret")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
                && section
                    .get("storageBackend")
                    .and_then(|v| v.as_str())
                    .is_some()
        }
        "groq" => {
            let section = state.get("groq").unwrap_or(&Value::Null);
            section
                .get("hasSecret")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
                && section
                    .get("storageBackend")
                    .and_then(|v| v.as_str())
                    .is_some()
        }
        _ => false,
    }
}

fn normalize_preferred_provider(state: Value) -> Value {
    let web_search = state
        .get("webSearchEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let has_search_capable =
        is_provider_selectable(&state, "gemini") || is_provider_selectable(&state, "groq");

    if web_search && !has_search_capable {
        let mut s = state;
        s["webSearchEnabled"] = json!(false);
        s["preferredProvider"] = json!("codex");
        return s;
    }

    let preferred = state
        .get("preferredProvider")
        .and_then(|v| v.as_str())
        .unwrap_or("codex");

    if is_provider_selectable(&state, preferred) {
        return state;
    }

    let fallback_order: Vec<&str> = if web_search {
        vec!["gemini", "groq", "codex"]
    } else {
        vec!["codex", "gemini", "groq"]
    };

    let fallback = fallback_order
        .iter()
        .find(|p| is_provider_selectable(&state, p))
        .unwrap_or(&"codex");

    let mut s = state;
    s["preferredProvider"] = json!(*fallback);
    s
}

fn sync_provider_security_metadata(mut state: Value, secure_status: &Value) -> Value {
    if let Some(gemini_status) = secure_status
        .get("providers")
        .and_then(|p| p.get("gemini"))
    {
        if let Some(gemini) = state.get("gemini").cloned() {
            state["gemini"] = merge_objects(&gemini, gemini_status);
        }
    }
    if let Some(groq_status) = secure_status.get("providers").and_then(|p| p.get("groq")) {
        if let Some(groq) = state.get("groq").cloned() {
            state["groq"] = merge_objects(&groq, groq_status);
        }
    }
    state
}

fn merge_provider_state(raw_state: &Value, secure_status: &Value) -> Value {
    let defaults = default_provider_state();
    let system_locale = get_system_ui_locale();

    let ui_locale = raw_state
        .get("uiLocale")
        .and_then(|v| v.as_str())
        .unwrap_or(system_locale);

    let merged = Value::Object({
        let mut m = defaults.as_object().unwrap().clone();
        if let Some(raw_obj) = raw_state.as_object() {
            for (k, v) in raw_obj {
                m.insert(k.clone(), v.clone());
            }
        }
        m.insert("uiLocale".to_string(), json!(ui_locale));
        m.insert(
            "gemini".to_string(),
            merge_objects(
                defaults.get("gemini").unwrap(),
                raw_state.get("gemini").unwrap_or(&Value::Null),
            ),
        );
        m.insert(
            "groq".to_string(),
            merge_objects(
                defaults.get("groq").unwrap(),
                raw_state.get("groq").unwrap_or(&Value::Null),
            ),
        );
        m.insert(
            "codex".to_string(),
            merge_objects(
                defaults.get("codex").unwrap(),
                raw_state.get("codex").unwrap_or(&Value::Null),
            ),
        );
        m
    });

    let synced = sync_provider_security_metadata(merged, secure_status);
    normalize_preferred_provider(synced)
}

fn sanitize_persisted_state(state: &Value) -> Value {
    let mut s = state.clone();
    if let Some(codex) = s.get("codex").cloned() {
        let mut codex = codex;
        codex["bridgeToken"] = json!("");
        s["codex"] = codex;
    }
    s
}

async fn get_bridge_connection_info(preferred_root: Option<&str>) -> Value {
    let bridge_state_path = kwc_data_dir().join("codex-bridge.json");
    let bridge_state = read_json(&bridge_state_path, json!({})).await;
    let token = bridge_state
        .get("token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let workspace = preferred_root
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        });

    json!({
        "bridgeUrl": "http://127.0.0.1:4317",
        "bridgeToken": token,
        "workspaceRoot": workspace,
    })
}

pub async fn get_provider_state_merged() -> Value {
    let raw_state = read_json(&provider_state_path(), Value::Null).await;

    let preferred_root = raw_state
        .get("codex")
        .and_then(|c| c.get("workspaceRoot"))
        .and_then(|v| v.as_str());

    let bridge_info = get_bridge_connection_info(preferred_root).await;

    let resolved = if raw_state.is_null() {
        if bridge_info.get("bridgeToken").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
            Value::Null
        } else {
            json!({
                "codex": bridge_info
            })
        }
    } else {
        let mut state = raw_state.clone();
        let mut codex = state.get("codex").cloned().unwrap_or(json!({}));
        if let Some(url) = bridge_info.get("bridgeUrl") {
            codex["bridgeUrl"] = url.clone();
        }
        codex["bridgeToken"] = bridge_info
            .get("bridgeToken")
            .cloned()
            .unwrap_or(json!(""));
        if let Some(root) = bridge_info.get("workspaceRoot") {
            if codex
                .get("workspaceRoot")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .is_empty()
            {
                codex["workspaceRoot"] = root.clone();
            }
        }
        state["codex"] = codex;
        state
    };

    let secure_status = derive_secure_store_status_from_state(&resolved);
    merge_provider_state(&resolved, &secure_status)
}

pub async fn save_provider_state_merged(state: Value) -> Result<Value, String> {
    let sanitized = sanitize_persisted_state(&state);
    write_json(&provider_state_path(), &sanitized).await?;
    Ok(get_provider_state_merged().await)
}

#[tauri::command]
pub async fn kwc_provider_state_get(
    _store: tauri::State<'_, Arc<HistoryStore>>,
) -> Result<Value, String> {
    Ok(get_provider_state_merged().await)
}

#[tauri::command]
pub async fn kwc_provider_state_save(
    _store: tauri::State<'_, Arc<HistoryStore>>,
    state: Value,
) -> Result<Value, String> {
    save_provider_state_merged(state).await
}
