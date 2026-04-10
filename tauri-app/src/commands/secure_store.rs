use serde_json::Value;

use crate::secure;

#[tauri::command]
pub async fn kwc_secure_store_status() -> Result<Value, String> {
    let status = secure::get_secure_store_status().await;
    serde_json::to_value(&status).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kwc_secure_store_set_secret(
    provider: String,
    secret: String,
    retention: String,
) -> Result<Value, String> {
    let status = secure::set_secure_store_secret(&provider, &secret, &retention).await?;
    serde_json::to_value(&status).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kwc_secure_store_delete_secret(provider: String) -> Result<Value, String> {
    let status = secure::delete_secure_store_secret(&provider).await?;
    serde_json::to_value(&status).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kwc_secure_store_validate_secret(provider: String) -> Result<Value, String> {
    let status = secure::validate_secure_store_secret(&provider).await?;
    serde_json::to_value(&status).map_err(|e| e.to_string())
}
