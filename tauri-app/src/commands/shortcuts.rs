use serde_json::{json, Map, Value};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::store::{kwc_data_dir, read_json, write_json};

const SHORTCUT_TRIGGERED_EVENT: &str = "kwc:shortcut-triggered";

fn shortcut_config_path() -> std::path::PathBuf {
    kwc_data_dir().join("shortcut-config.json")
}

pub fn default_shortcut_config() -> Value {
    json!({
        "openAnalyze": "CommandOrControl+Shift+Y",
        "analyzeSelection": "CommandOrControl+Shift+S",
        "analyzeClipboard": "CommandOrControl+Shift+V",
        "captureArea": "CommandOrControl+Shift+X"
    })
}

pub fn read_shortcut_config_sync() -> Value {
    let path = shortcut_config_path();
    let raw = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or(Value::Null);

    if raw.is_null() {
        return default_shortcut_config();
    }

    let defaults = default_shortcut_config();
    let mut result = defaults.as_object().unwrap().clone();
    if let Some(raw_obj) = raw.as_object() {
        for (k, v) in raw_obj {
            if v.is_string() {
                result.insert(k.clone(), v.clone());
            }
        }
    }
    Value::Object(result)
}

pub struct ShortcutConfigState(pub Mutex<Value>);

pub fn register_shortcuts_from_config<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    config: &Value,
) -> Result<(), String> {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();

    let empty_map = Map::new();
    let entries = config.as_object().unwrap_or(&empty_map);
    for (_, combo_val) in entries {
        if let Some(combo) = combo_val.as_str() {
            if let Ok(shortcut) = combo.parse::<Shortcut>() {
                manager.register(shortcut).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}

fn find_action_for_shortcut(config: &Value, shortcut: &Shortcut) -> Option<String> {
    let empty_map = Map::new();
    let entries = config.as_object().unwrap_or(&empty_map);
    for (action, combo_val) in entries {
        if let Some(combo) = combo_val.as_str() {
            if let Ok(configured) = combo.parse::<Shortcut>() {
                if *shortcut == configured {
                    return Some(action.clone());
                }
            }
        }
    }
    None
}

pub fn build_global_shortcut_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            let action = {
                let state = app.state::<ShortcutConfigState>();
                let config = state.0.lock().unwrap();
                find_action_for_shortcut(&config, shortcut)
            };

            if let Some(action) = action {
                handle_shortcut_action(app, &action);
            }
        })
        .build()
}

fn handle_shortcut_action(app: &tauri::AppHandle, action: &str) {
    // Hide launcher if visible
    if let Some(launcher) = app.get_webview_window("launcher") {
        let _ = launcher.hide();
    }

    // Show and focus main window
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.unminimize();
        let _ = main_window.show();
        let _ = main_window.set_focus();
    }

    // Activate app on macOS
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(|| {
            let mtm = objc2::MainThreadMarker::new()
                .expect("macOS 메인 스레드에서만 앱 활성화가 가능합니다.");
            let ns_app = objc2_app_kit::NSApplication::sharedApplication(mtm);
            #[allow(deprecated)]
            ns_app.activateIgnoringOtherApps(true);
        });
    }

    // Emit event to main window
    let _ = app.emit_to(
        "main",
        SHORTCUT_TRIGGERED_EVENT,
        json!({ "action": action }),
    );
}

#[tauri::command]
pub async fn kwc_shortcuts_get_config() -> Result<Value, String> {
    let raw = read_json(&shortcut_config_path(), Value::Null).await;
    if raw.is_null() {
        return Ok(default_shortcut_config());
    }

    let defaults = default_shortcut_config();
    let mut result = defaults.as_object().unwrap().clone();
    if let Some(raw_obj) = raw.as_object() {
        for (k, v) in raw_obj {
            if v.is_string() {
                result.insert(k.clone(), v.clone());
            }
        }
    }
    Ok(Value::Object(result))
}

#[tauri::command]
pub async fn kwc_shortcuts_save_config(
    app: tauri::AppHandle,
    config: Value,
) -> Result<Value, String> {
    write_json(&shortcut_config_path(), &config).await?;

    // Re-register global shortcuts
    register_shortcuts_from_config(&app, &config)?;

    // Update in-memory state
    let state = app.state::<ShortcutConfigState>();
    *state.0.lock().unwrap() = config.clone();

    Ok(config)
}
