use serde_json::Value;
use std::path::{Path, PathBuf};
use tokio::fs;

pub fn kwc_data_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".k-warning-check")
}

pub async fn ensure_dir(path: &Path) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent).await;
    }
}

pub async fn read_json(path: &Path, fallback: Value) -> Value {
    match fs::read_to_string(path).await {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or(fallback),
        Err(_) => fallback,
    }
}

pub async fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    ensure_dir(path).await;
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(path, format!("{content}\n"))
        .await
        .map_err(|e| e.to_string())
}
