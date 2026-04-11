use serde_json::{json, Value};

fn runtime_os_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        return "mac";
    }

    #[cfg(target_os = "windows")]
    {
        return "windows";
    }

    #[cfg(target_os = "linux")]
    {
        return "linux";
    }

    #[cfg(target_os = "android")]
    {
        return "android";
    }

    #[cfg(target_os = "openbsd")]
    {
        return "openbsd";
    }

    #[cfg(target_os = "fuchsia")]
    {
        return "fuchsia";
    }

    #[allow(unreachable_code)]
    "unknown"
}

#[tauri::command]
pub async fn kwc_system_get_runtime_capabilities() -> Result<Value, String> {
    Ok(json!({
        "os": runtime_os_name(),
        "supportsCodex": !cfg!(target_os = "windows"),
    }))
}

fn parse_safe_external_url(url: &str) -> Result<String, String> {
    let parsed = url::Url::parse(url).map_err(|_| "외부 URL 형식을 해석하지 못했습니다.")?;
    if parsed.scheme() != "https" {
        return Err("외부로 여는 URL은 HTTPS만 허용됩니다.".into());
    }
    Ok(parsed.to_string())
}

#[tauri::command]
pub async fn kwc_system_read_clipboard_text(
    app: tauri::AppHandle,
) -> Result<String, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let content = app
        .clipboard()
        .read_text()
        .map_err(|e| format!("클립보드 읽기 실패: {e}"))?;
    Ok(content)
}

#[tauri::command]
pub async fn kwc_system_open_external(url: String) -> Result<(), String> {
    let safe_url = parse_safe_external_url(&url)?;
    open::that(&safe_url).map_err(|e| format!("외부 URL 열기 실패: {e}"))
}

#[tauri::command]
pub async fn kwc_system_get_screen_capture_permission_status() -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    {
        let granted = macos_screen_capture_granted();
        Ok(json!({
            "supported": true,
            "granted": granted,
            "status": if granted { "granted" } else { "denied" },
        }))
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(json!({
            "supported": false,
            "granted": true,
            "status": "unsupported",
        }))
    }
}

#[tauri::command]
pub async fn kwc_system_request_screen_capture_permission() -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    {
        let granted = macos_screen_capture_granted();
        if granted {
            return Ok(json!({
                "supported": true,
                "granted": true,
                "status": "granted",
            }));
        }

        // Try triggering the permission dialog by attempting a capture
        let _ = xcap::Monitor::all();

        let granted_after = macos_screen_capture_granted();
        if !granted_after {
            // Open System Settings
            let _ = open::that(
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
            );
        }

        Ok(json!({
            "supported": true,
            "granted": granted_after,
            "status": if granted_after { "granted" } else { "denied" },
        }))
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(json!({
            "supported": false,
            "granted": true,
            "status": "unsupported",
        }))
    }
}

#[cfg(target_os = "macos")]
fn macos_screen_capture_granted() -> bool {
    // Use CoreGraphics API to check screen capture permission
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }
    unsafe { CGPreflightScreenCaptureAccess() }
}
