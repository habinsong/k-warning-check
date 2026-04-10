use rand::RngCore;
use serde_json::{json, Value};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::fs;
use tokio::process::Command;

use crate::store::{kwc_data_dir, read_json, write_json};

const BRIDGE_HOST: &str = "127.0.0.1";
const BRIDGE_PORT: u16 = 4317;

fn codex_path_candidates() -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    let mut candidates = vec![
        home.join(".npm-global/bin/codex"),
        PathBuf::from("/usr/local/bin/codex"),
        PathBuf::from("/opt/homebrew/bin/codex"),
    ];
    if let Ok(bin) = std::env::var("CODEX_BIN") {
        candidates.insert(0, PathBuf::from(bin));
    }
    candidates
}

fn find_codex_bin() -> String {
    codex_path_candidates()
        .into_iter()
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "codex".to_string())
}

fn tool_env_path() -> String {
    let home = dirs::home_dir().unwrap_or_default();
    let extra = [
        home.join(".npm-global/bin").to_string_lossy().to_string(),
        "/usr/local/bin".to_string(),
        "/opt/homebrew/bin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
        "/usr/sbin".to_string(),
        "/sbin".to_string(),
    ];
    let existing = std::env::var("PATH").unwrap_or_default();
    let mut parts: Vec<String> = extra.into_iter().collect();
    parts.push(existing);
    parts.join(":")
}

fn is_bridge_open() -> bool {
    TcpStream::connect_timeout(
        &format!("{BRIDGE_HOST}:{BRIDGE_PORT}").parse().unwrap(),
        Duration::from_millis(500),
    )
    .is_ok()
}

async fn get_bridge_token() -> Result<String, String> {
    let path = kwc_data_dir().join("codex-bridge.json");
    let state = read_json(&path, json!({})).await;
    let existing = state
        .get("token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if !existing.is_empty() {
        return Ok(existing);
    }

    let mut bytes = [0u8; 24];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let token = hex::encode(bytes);

    write_json(
        &path,
        &json!({
            "token": token,
            "updatedAt": chrono::Utc::now().to_rfc3339(),
        }),
    )
    .await?;

    Ok(token)
}

async fn kill_bridge_on_port() {
    if cfg!(target_os = "windows") {
        if let Ok(output) = Command::new("netstat")
            .args(["-ano", "-p", "tcp"])
            .output()
            .await
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let pids: std::collections::HashSet<String> = stdout
                .lines()
                .filter(|line| line.contains(&format!(":{BRIDGE_PORT}")))
                .filter_map(|line| line.split_whitespace().last().map(|s| s.to_string()))
                .collect();
            for pid in pids {
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid, "/F"])
                    .output()
                    .await;
            }
        }
    } else {
        if let Ok(output) = Command::new("/usr/sbin/lsof")
            .args(["-ti", &format!("tcp:{BRIDGE_PORT}")])
            .output()
            .await
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for pid_str in stdout.lines() {
                let pid_str = pid_str.trim();
                if let Ok(_pid) = pid_str.parse::<i32>() {
                    #[cfg(unix)]
                    unsafe {
                        libc::kill(_pid, libc::SIGTERM);
                    }
                }
            }
        }
    }
}

fn execution_cwd() -> PathBuf {
    std::env::current_dir()
        .ok()
        .filter(|p| p.exists() && p.to_string_lossy() != "/")
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
}

async fn codex_status_raw() -> Result<String, String> {
    let codex = find_codex_bin();
    let output = Command::new(&codex)
        .args(["login", "status"])
        .env("PATH", tool_env_path())
        .output()
        .await
        .map_err(|e| format!("codex 실행 실패: {e}"))?;

    let text = String::from_utf8_lossy(&output.stdout).to_string();
    let err = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = if text.trim().is_empty() {
        err.trim().to_string()
    } else {
        text.trim().to_string()
    };
    Ok(combined)
}

#[tauri::command]
pub async fn kwc_codex_get_status() -> Result<Value, String> {
    let status = codex_status_raw().await.unwrap_or_else(|_| "미확인".into());
    Ok(json!({
        "status": status,
        "bridgeRunning": false,
        "message": "Codex 상태를 확인했습니다.",
    }))
}

#[tauri::command]
pub async fn kwc_codex_start_bridge(force: Option<bool>) -> Result<Value, String> {
    if force.unwrap_or(false) {
        kill_bridge_on_port().await;
    }

    if is_bridge_open() {
        let status = codex_status_raw().await.unwrap_or_else(|_| "미확인".into());
        return Ok(json!({
            "message": "Codex 연결이 이미 실행 중입니다.",
            "bridgeRunning": true,
            "status": status,
        }));
    }

    let token = get_bridge_token().await?;
    let bridge_script = find_bridge_script().await;

    let mut cmd = std::process::Command::new("node");
    cmd.arg(&bridge_script)
        .current_dir(execution_cwd())
        .env("PATH", tool_env_path())
        .env("CODEX_BRIDGE_HOST", BRIDGE_HOST)
        .env("CODEX_BRIDGE_PORT", BRIDGE_PORT.to_string())
        .env("CODEX_BRIDGE_TOKEN", &token)
        .env(
            "CODEX_BRIDGE_ALLOWED_ORIGINS",
            "chrome-extension://lmacmoffmdjjabkdkabfpfefdamlkcgg,null,http://localhost:4173",
        )
        .env(
            "CODEX_BRIDGE_WORKSPACE_ROOT",
            execution_cwd().to_string_lossy().to_string(),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let child = cmd.spawn().map_err(|e| format!("브릿지 시작 실패: {e}"))?;
    drop(child);

    tokio::time::sleep(Duration::from_millis(600)).await;

    let running = is_bridge_open();
    let status = codex_status_raw().await.unwrap_or_else(|_| "미확인".into());

    Ok(json!({
        "message": if running {
            "Codex 연결을 시작했습니다."
        } else {
            "Codex 연결 시작 요청을 보냈지만 아직 연결되지 않았습니다."
        },
        "bridgeRunning": running,
        "status": status,
    }))
}

async fn find_bridge_script() -> String {
    let candidates = [
        kwc_data_dir().join("runtime/codex-bridge.mjs"),
        PathBuf::from("scripts/codex-bridge.mjs"),
    ];
    for c in &candidates {
        if c.exists() {
            return c.to_string_lossy().to_string();
        }
    }
    // Try to find it relative to the workspace
    let workspace = execution_cwd();
    let script = workspace.join("main/scripts/codex-bridge.mjs");
    if script.exists() {
        return script.to_string_lossy().to_string();
    }
    "codex-bridge.mjs".to_string()
}

#[tauri::command]
pub async fn kwc_codex_start_login() -> Result<Value, String> {
    let codex = find_codex_bin();
    let log_path = std::env::temp_dir().join(format!(
        "kwc-codex-oauth-{}.log",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    ));

    let log_file = std::fs::File::create(&log_path).map_err(|e| e.to_string())?;
    let log_file2 = log_file.try_clone().map_err(|e| e.to_string())?;

    let mut cmd = std::process::Command::new(&codex);
    cmd.arg("login")
        .current_dir(execution_cwd())
        .env("PATH", tool_env_path())
        .stdin(Stdio::null())
        .stdout(log_file)
        .stderr(log_file2);

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let child = cmd.spawn().map_err(|e| format!("codex login 실행 실패: {e}"))?;
    drop(child);

    let mut output = String::new();
    let mut auth_url = String::new();

    for _ in 0..20 {
        tokio::time::sleep(Duration::from_millis(250)).await;
        output = fs::read_to_string(&log_path).await.unwrap_or_default();
        if let Some(m) = output.find("https://auth.openai.com/oauth/authorize") {
            let url_end = output[m..]
                .find(|c: char| c.is_whitespace())
                .unwrap_or(output.len() - m);
            auth_url = output[m..m + url_end].to_string();
            break;
        }
    }

    Ok(json!({
        "output": output.trim(),
        "authUrl": auth_url,
        "logPath": log_path.to_string_lossy(),
        "message": if !auth_url.is_empty() {
            "Codex OAuth 로그인을 시작했습니다."
        } else {
            "Codex OAuth 로그인 프로세스를 시작했지만 인증 URL을 아직 읽지 못했습니다."
        },
    }))
}
