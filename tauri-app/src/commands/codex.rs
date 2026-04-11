use rand::RngCore;
use serde_json::{json, Value};
use std::env;
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::fs;
use tokio::process::Command;

use crate::store::{kwc_data_dir, read_json, write_json};

const BRIDGE_HOST: &str = "127.0.0.1";
const BRIDGE_PORT: u16 = 4317;
const EMBEDDED_BRIDGE_SCRIPT: &str = include_str!("../../../main/scripts/codex-bridge.mjs");

fn ensure_codex_supported() -> Result<(), String> {
    if cfg!(target_os = "windows") {
        Err("Windows에서는 Codex를 지원하지 않습니다.".into())
    } else {
        Ok(())
    }
}

fn codex_path_candidates() -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    let mut candidates = vec![
        home.join(".npm-global/bin/codex"),
        PathBuf::from("/usr/local/bin/codex"),
        PathBuf::from("/opt/homebrew/bin/codex"),
    ];
    #[cfg(target_os = "windows")]
    {
        if let Some(app_data) = dirs::data_dir() {
            candidates.insert(0, app_data.join("npm/codex.cmd"));
            candidates.insert(1, app_data.join("npm/codex"));
        }
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            candidates.push(PathBuf::from(&local_app_data).join("Programs/Codex/codex.exe"));
            candidates.push(PathBuf::from(&local_app_data).join("Microsoft/WindowsApps/codex.exe"));
        }
        candidates.push(home.join("AppData/Roaming/npm/codex.cmd"));
        candidates.push(home.join("AppData/Roaming/npm/codex"));
        candidates.push(home.join(".npm-global/bin/codex.cmd"));
    }
    if let Ok(bin) = std::env::var("CODEX_BIN") {
        candidates.insert(0, PathBuf::from(bin));
    }
    candidates
}

fn node_path_candidates() -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from("node"),
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/local/bin/node"),
        PathBuf::from("/usr/bin/node"),
    ];
    #[cfg(target_os = "windows")]
    {
        let home = dirs::home_dir().unwrap_or_default();
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            candidates.insert(0, PathBuf::from(program_files).join("nodejs/node.exe"));
        }
        if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
            candidates.insert(0, PathBuf::from(program_files_x86).join("nodejs/node.exe"));
        }
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            candidates.insert(0, PathBuf::from(&local_app_data).join("Programs/nodejs/node.exe"));
        }
        candidates.insert(0, home.join("AppData/Local/Programs/nodejs/node.exe"));
        candidates.insert(0, home.join("AppData/Roaming/npm/node.exe"));
    }
    if let Ok(bin) = std::env::var("NODE_BIN") {
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

fn find_node_bin() -> String {
    node_path_candidates()
        .into_iter()
        .find(|p| p.as_os_str() == "node" || p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "node".to_string())
}

#[cfg(target_os = "windows")]
fn windows_shell_bin() -> String {
    env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string())
}

#[cfg(target_os = "windows")]
fn is_windows_command_script(program: &str) -> bool {
    let lowered = program.trim().to_ascii_lowercase();
    lowered.ends_with(".cmd") || lowered.ends_with(".bat")
}

fn codex_command(program: &str, args: &[&str]) -> Command {
    #[cfg(target_os = "windows")]
    {
        if is_windows_command_script(program) {
            let mut command = Command::new(windows_shell_bin());
            command.arg("/C").arg(program).args(args);
            return command;
        }
    }

    let mut command = Command::new(program);
    command.args(args);
    command
}

fn codex_std_command(program: &str, args: &[&str]) -> std::process::Command {
    #[cfg(target_os = "windows")]
    {
        if is_windows_command_script(program) {
            let mut command = std::process::Command::new(windows_shell_bin());
            command.arg("/C").arg(program).args(args);
            return command;
        }
    }

    let mut command = std::process::Command::new(program);
    command.args(args);
    command
}

fn tool_env_path() -> String {
    let home = dirs::home_dir().unwrap_or_default();
    let mut parts = vec![
        home.join(".npm-global/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
        PathBuf::from("/usr/sbin"),
        PathBuf::from("/sbin"),
    ];

    #[cfg(target_os = "windows")]
    {
        if let Some(app_data) = dirs::data_dir() {
            parts.insert(0, app_data.join("npm"));
        }
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            parts.insert(0, PathBuf::from(&local_app_data).join("Programs/nodejs"));
            parts.insert(1, PathBuf::from(&local_app_data).join("Microsoft/WindowsApps"));
        }
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            parts.insert(0, PathBuf::from(program_files).join("nodejs"));
        }
        if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
            parts.insert(0, PathBuf::from(program_files_x86).join("nodejs"));
        }
        parts.insert(0, home.join("AppData/Roaming/npm"));
    }

    parts.extend(env::split_paths(&env::var_os("PATH").unwrap_or_default()));
    env::join_paths(parts)
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|_| env::var("PATH").unwrap_or_default())
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

async fn preferred_workspace_root() -> PathBuf {
    let provider_state = read_json(&kwc_data_dir().join("provider-state.json"), json!({})).await;

    provider_state
        .get("codex")
        .and_then(|c| c.get("workspaceRoot"))
        .and_then(|v| v.as_str())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.exists())
        .or_else(|| dirs::home_dir())
        .unwrap_or_else(execution_cwd)
}

async fn ensure_runtime_bridge_script() -> Result<PathBuf, String> {
    let runtime_script = kwc_data_dir().join("runtime/codex-bridge.mjs");
    if !runtime_script.exists() {
        if let Some(parent) = runtime_script.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Codex 브리지 런타임 디렉터리 생성 실패: {e}"))?;
        }
        fs::write(&runtime_script, EMBEDDED_BRIDGE_SCRIPT)
            .await
            .map_err(|e| format!("Codex 브리지 스크립트 준비 실패: {e}"))?;
    }
    Ok(runtime_script)
}

async fn codex_status_raw() -> Result<String, String> {
    ensure_codex_supported()?;
    let codex = find_codex_bin();
    let output = codex_command(&codex, &["login", "status"])
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

fn is_logged_in_status(status: &str) -> bool {
    status.to_ascii_lowercase().contains("logged in")
}

fn extract_auth_url(output: &str) -> String {
    output
        .split_whitespace()
        .find(|token| token.starts_with("https://auth.openai.com/"))
        .unwrap_or("")
        .to_string()
}

#[tauri::command]
pub async fn kwc_codex_get_status() -> Result<Value, String> {
    ensure_codex_supported()?;
    let status = codex_status_raw().await.unwrap_or_else(|_| "미확인".into());
    Ok(json!({
        "status": status,
        "bridgeRunning": is_bridge_open(),
        "message": "Codex 상태를 확인했습니다.",
    }))
}

#[tauri::command]
pub async fn kwc_codex_start_bridge(force: Option<bool>) -> Result<Value, String> {
    ensure_codex_supported()?;
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
    let codex = find_codex_bin();
    let bridge_script = find_bridge_script().await?;
    let node = find_node_bin();

    let workspace_root = preferred_workspace_root().await;

    let mut cmd = std::process::Command::new(&node);
    cmd.arg(&bridge_script)
        .current_dir(&workspace_root)
        .env("PATH", tool_env_path())
        .env("CODEX_BRIDGE_HOST", BRIDGE_HOST)
        .env("CODEX_BRIDGE_PORT", BRIDGE_PORT.to_string())
        .env("CODEX_BRIDGE_TOKEN", &token)
        .env("CODEX_BIN", &codex)
        .env(
            "CODEX_BRIDGE_ALLOWED_ORIGINS",
            "chrome-extension://lmacmoffmdjjabkdkabfpfefdamlkcgg,null,http://localhost:4173",
        )
        .env(
            "CODEX_BRIDGE_WORKSPACE_ROOT",
            workspace_root.to_string_lossy().to_string(),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("브릿지 시작 실패: {e}"))?;
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

async fn find_bridge_script() -> Result<String, String> {
    let runtime_script = ensure_runtime_bridge_script().await?;
    if runtime_script.exists() {
        return Ok(runtime_script.to_string_lossy().to_string());
    }

    let candidates = [
        PathBuf::from("scripts/codex-bridge.mjs"),
        execution_cwd().join("main/scripts/codex-bridge.mjs"),
    ];
    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    Err("Codex 브리지 스크립트를 찾지 못했습니다.".into())
}

#[tauri::command]
pub async fn kwc_codex_start_login() -> Result<Value, String> {
    ensure_codex_supported()?;
    let current_status = codex_status_raw().await.unwrap_or_default();
    if is_logged_in_status(&current_status) {
        return Ok(json!({
            "output": current_status,
            "authUrl": "",
            "logPath": "",
            "alreadyLoggedIn": true,
            "message": "Codex는 이미 로그인되어 있습니다.",
        }));
    }

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

    let workspace_root = preferred_workspace_root().await;
    let mut cmd = codex_std_command(&codex, &["login", "--device-auth"]);
    cmd
        .current_dir(workspace_root)
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
        auth_url = extract_auth_url(&output);
        if !auth_url.is_empty() {
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
