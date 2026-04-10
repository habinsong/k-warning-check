use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::store::{kwc_data_dir, read_json, write_json};

const SECURE_STORE_SERVICE_NAME: &str = "K-WarningCheck";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretMetadata {
    pub provider: String,
    pub retention: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<u64>,
    #[serde(rename = "lastValidationAt")]
    pub last_validation_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecureStoreProviderStatus {
    pub provider: String,
    #[serde(rename = "hasSecret")]
    pub has_secret: bool,
    #[serde(rename = "storageBackend")]
    pub storage_backend: Option<String>,
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<u64>,
    #[serde(rename = "lastValidationAt")]
    pub last_validation_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecureStoreStatus {
    pub available: bool,
    pub backend: Option<String>,
    pub providers: SecureStoreProviders,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecureStoreProviders {
    pub gemini: SecureStoreProviderStatus,
    pub groq: SecureStoreProviderStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CacheRecord {
    iv: String,
    #[serde(rename = "cipherText")]
    cipher_text: String,
    #[serde(rename = "authTag")]
    auth_tag: String,
}

fn metadata_path() -> std::path::PathBuf {
    kwc_data_dir().join("secure-store-metadata.json")
}

fn cache_path() -> std::path::PathBuf {
    kwc_data_dir().join("secure-store-cache.json")
}

pub fn get_storage_backend() -> &'static str {
    if cfg!(target_os = "macos") {
        "keychain"
    } else if cfg!(target_os = "windows") {
        "credential-locker"
    } else {
        "secret-service"
    }
}

fn retention_ms(retention: &str) -> u64 {
    if retention == "hourly" {
        return 60 * 60 * 1000;
    }
    let days: u64 = retention
        .replace('d', "")
        .parse()
        .unwrap_or(7);
    days * 24 * 60 * 60 * 1000
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn local_cache_key() -> [u8; 32] {
    let home = dirs::home_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let hostname = hostname::get()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let username = whoami::username();
    let platform = std::env::consts::OS;

    let input = format!(
        "{SECURE_STORE_SERVICE_NAME}:{platform}:{home}:{home}:{hostname}:{username}"
    );

    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

fn encrypt_for_cache(secret: &str) -> Option<CacheRecord> {
    let key = local_cache_key();
    let cipher = Aes256Gcm::new_from_slice(&key).ok()?;
    let mut iv_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut iv_bytes);
    let nonce = Nonce::from_slice(&iv_bytes);
    let encrypted = cipher.encrypt(nonce, secret.as_bytes()).ok()?;

    let tag_start = encrypted.len() - 16;
    let cipher_text = &encrypted[..tag_start];
    let auth_tag = &encrypted[tag_start..];

    Some(CacheRecord {
        iv: B64.encode(iv_bytes),
        cipher_text: B64.encode(cipher_text),
        auth_tag: B64.encode(auth_tag),
    })
}

fn decrypt_from_cache(record: &CacheRecord) -> Option<String> {
    let key = local_cache_key();
    let cipher = Aes256Gcm::new_from_slice(&key).ok()?;
    let iv = B64.decode(&record.iv).ok()?;
    let nonce = Nonce::from_slice(&iv);
    let cipher_text = B64.decode(&record.cipher_text).ok()?;
    let auth_tag = B64.decode(&record.auth_tag).ok()?;

    let mut payload = cipher_text;
    payload.extend_from_slice(&auth_tag);

    let decrypted = cipher.decrypt(nonce, payload.as_ref()).ok()?;
    String::from_utf8(decrypted).ok()
}

fn assert_provider(provider: &str) -> Result<(), String> {
    if provider != "gemini" && provider != "groq" {
        return Err("지원하지 않는 provider입니다.".into());
    }
    Ok(())
}

fn empty_provider_status(provider: &str) -> SecureStoreProviderStatus {
    SecureStoreProviderStatus {
        provider: provider.to_string(),
        has_secret: false,
        storage_backend: None,
        expires_at: None,
        last_validation_at: None,
    }
}

async fn read_metadata_state() -> Value {
    read_json(&metadata_path(), serde_json::json!({})).await
}

async fn write_metadata_state(state: &Value) -> Result<(), String> {
    write_json(&metadata_path(), state).await
}

async fn read_cache_state() -> Value {
    read_json(&cache_path(), serde_json::json!({})).await
}

async fn write_cache_state(state: &Value) -> Result<(), String> {
    write_json(&cache_path(), state).await
}

pub async fn read_secret_metadata(provider: &str) -> Option<SecretMetadata> {
    let state = read_metadata_state().await;
    let meta = state.get(provider)?;
    serde_json::from_value(meta.clone()).ok()
}

async fn write_secret_metadata(
    provider: &str,
    retention: &str,
) -> Result<SecretMetadata, String> {
    let now = now_ms();
    let metadata = SecretMetadata {
        provider: provider.to_string(),
        retention: retention.to_string(),
        created_at: now,
        expires_at: Some(now + retention_ms(retention)),
        last_validation_at: Some(now),
    };

    let mut state = read_metadata_state().await;
    state[provider] = serde_json::to_value(&metadata).map_err(|e| e.to_string())?;
    write_metadata_state(&state).await?;
    Ok(metadata)
}

async fn update_last_validation_at(provider: &str) -> Result<Option<SecretMetadata>, String> {
    let Some(mut metadata) = read_secret_metadata(provider).await else {
        return Ok(None);
    };
    metadata.last_validation_at = Some(now_ms());

    let mut state = read_metadata_state().await;
    state[provider] = serde_json::to_value(&metadata).map_err(|e| e.to_string())?;
    write_metadata_state(&state).await?;
    Ok(Some(metadata))
}

async fn delete_secret_metadata(provider: &str) -> Result<(), String> {
    let mut state = read_metadata_state().await;
    if let Some(obj) = state.as_object_mut() {
        obj.remove(provider);
    }
    write_metadata_state(&state).await
}

async fn read_cached_secret(provider: &str) -> String {
    let state = read_cache_state().await;
    if let Some(record_val) = state.get(provider) {
        if let Ok(record) = serde_json::from_value::<CacheRecord>(record_val.clone()) {
            if let Some(secret) = decrypt_from_cache(&record) {
                return secret;
            }
        }
        // Invalid cache entry, clean it up
        let mut next = state.clone();
        if let Some(obj) = next.as_object_mut() {
            obj.remove(provider);
        }
        let _ = write_cache_state(&next).await;
    }
    String::new()
}

async fn write_cached_secret(provider: &str, secret: &str) -> Result<(), String> {
    let record = encrypt_for_cache(secret).ok_or("암호화 실패")?;
    let mut state = read_cache_state().await;
    state[provider] = serde_json::to_value(&record).map_err(|e| e.to_string())?;
    write_cache_state(&state).await
}

async fn delete_cached_secret(provider: &str) -> Result<(), String> {
    let mut state = read_cache_state().await;
    if let Some(obj) = state.as_object_mut() {
        if obj.remove(provider).is_some() {
            write_cache_state(&serde_json::to_value(obj).unwrap_or_default()).await?;
        }
    }
    Ok(())
}

fn keyring_set(provider: &str, secret: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new(SECURE_STORE_SERVICE_NAME, provider).map_err(|e| e.to_string())?;
    entry.set_password(secret).map_err(|e| e.to_string())
}

fn keyring_delete(provider: &str) {
    if let Ok(entry) = keyring::Entry::new(SECURE_STORE_SERVICE_NAME, provider) {
        let _ = entry.delete_credential();
    }
}

async fn get_provider_secure_status(
    provider: &str,
) -> Result<SecureStoreProviderStatus, String> {
    assert_provider(provider)?;
    let backend = get_storage_backend().to_string();

    let cached = read_cached_secret(provider).await;
    let metadata = read_secret_metadata(provider).await;

    if let Some(ref meta) = metadata {
        if let Some(expires) = meta.expires_at {
            if expires <= now_ms() {
                keyring_delete(provider);
                let _ = delete_secret_metadata(provider).await;
                let _ = delete_cached_secret(provider).await;
                return Ok(SecureStoreProviderStatus {
                    provider: provider.to_string(),
                    has_secret: false,
                    storage_backend: Some(backend),
                    expires_at: None,
                    last_validation_at: meta.last_validation_at,
                });
            }
        }
    }

    Ok(SecureStoreProviderStatus {
        provider: provider.to_string(),
        has_secret: !cached.is_empty() || metadata.is_some(),
        storage_backend: Some(backend),
        expires_at: metadata.as_ref().and_then(|m| m.expires_at),
        last_validation_at: metadata.as_ref().and_then(|m| m.last_validation_at),
    })
}

pub async fn get_secure_store_status() -> SecureStoreStatus {
    let backend = get_storage_backend().to_string();

    match tokio::try_join!(
        async { get_provider_secure_status("gemini").await },
        async { get_provider_secure_status("groq").await },
    ) {
        Ok((gemini, groq)) => SecureStoreStatus {
            available: true,
            backend: Some(backend),
            providers: SecureStoreProviders { gemini, groq },
            error: None,
        },
        Err(e) => SecureStoreStatus {
            available: false,
            backend: None,
            providers: SecureStoreProviders {
                gemini: empty_provider_status("gemini"),
                groq: empty_provider_status("groq"),
            },
            error: Some(e),
        },
    }
}

pub async fn set_secure_store_secret(
    provider: &str,
    secret: &str,
    retention: &str,
) -> Result<SecureStoreProviderStatus, String> {
    assert_provider(provider)?;
    let secret = secret.trim();
    if secret.is_empty() {
        return Err("빈 API 키는 저장할 수 없습니다.".into());
    }

    keyring_set(provider, secret)?;
    let metadata = write_secret_metadata(provider, retention).await?;
    write_cached_secret(provider, secret).await?;

    Ok(SecureStoreProviderStatus {
        provider: provider.to_string(),
        has_secret: true,
        storage_backend: Some(get_storage_backend().to_string()),
        expires_at: metadata.expires_at,
        last_validation_at: metadata.last_validation_at,
    })
}

pub async fn get_secure_store_secret(provider: &str) -> Result<String, String> {
    assert_provider(provider)?;

    let metadata = read_secret_metadata(provider).await;
    if let Some(ref meta) = metadata {
        if let Some(expires) = meta.expires_at {
            if expires <= now_ms() {
                keyring_delete(provider);
                let _ = delete_secret_metadata(provider).await;
                let _ = delete_cached_secret(provider).await;
                return Err("API 키 보관 기간이 만료되었습니다.".into());
            }
        }
    }

    let cached = read_cached_secret(provider).await;
    if !cached.is_empty() {
        return Ok(cached);
    }

    Err("런타임 API 키 캐시가 없습니다. 설정에서 API 키를 다시 저장해 주세요.".into())
}

pub async fn delete_secure_store_secret(
    provider: &str,
) -> Result<SecureStoreProviderStatus, String> {
    assert_provider(provider)?;
    keyring_delete(provider);
    let _ = delete_secret_metadata(provider).await;
    let _ = delete_cached_secret(provider).await;

    Ok(SecureStoreProviderStatus {
        provider: provider.to_string(),
        has_secret: false,
        storage_backend: Some(get_storage_backend().to_string()),
        expires_at: None,
        last_validation_at: None,
    })
}

pub async fn validate_secure_store_secret(
    provider: &str,
) -> Result<SecureStoreProviderStatus, String> {
    let status = get_provider_secure_status(provider).await?;
    if !status.has_secret {
        return Err("저장된 API 키가 없습니다.".into());
    }

    let next = update_last_validation_at(provider).await?;
    Ok(SecureStoreProviderStatus {
        last_validation_at: next
            .as_ref()
            .and_then(|m| m.last_validation_at)
            .or(Some(now_ms())),
        ..status
    })
}

pub fn derive_secure_store_status_from_state(raw_state: &Value) -> Value {
    let make_provider = |provider: &str| -> Value {
        let section = raw_state.get(provider);
        serde_json::json!({
            "provider": provider,
            "hasSecret": section.and_then(|s| s.get("hasSecret")).and_then(|v| v.as_bool()).unwrap_or(false),
            "storageBackend": section.and_then(|s| s.get("storageBackend")).cloned().unwrap_or(Value::Null),
            "expiresAt": section.and_then(|s| s.get("expiresAt")).cloned().unwrap_or(Value::Null),
            "lastValidationAt": section.and_then(|s| s.get("lastValidationAt")).cloned().unwrap_or(Value::Null),
        })
    };

    let gemini = make_provider("gemini");
    let groq = make_provider("groq");

    let has_backend = gemini
        .get("storageBackend")
        .and_then(|v| v.as_str())
        .is_some()
        || groq
            .get("storageBackend")
            .and_then(|v| v.as_str())
            .is_some();

    let backend = gemini
        .get("storageBackend")
        .filter(|v| v.is_string() && !v.is_null())
        .or_else(|| groq.get("storageBackend").filter(|v| v.is_string() && !v.is_null()))
        .cloned()
        .unwrap_or(Value::Null);

    serde_json::json!({
        "available": has_backend,
        "backend": backend,
        "providers": {
            "gemini": gemini,
            "groq": groq,
        }
    })
}
