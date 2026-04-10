use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::store::{kwc_data_dir, read_json, write_json};

const HISTORY_LIMIT: usize = 50;

fn history_path() -> std::path::PathBuf {
    kwc_data_dir().join("history.json")
}

pub struct HistoryStore {
    lock: Mutex<()>,
}

impl HistoryStore {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            lock: Mutex::new(()),
        })
    }

    async fn read_bundle(&self) -> Value {
        let stored = read_json(
            &history_path(),
            json!({ "history": [], "latestRecord": null }),
        )
        .await;

        let history = stored
            .get("history")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let latest = stored
            .get("latestRecord")
            .cloned()
            .unwrap_or(Value::Null);

        json!({
            "history": history,
            "latestRecord": latest,
        })
    }

    pub async fn get_bundle(&self) -> Value {
        let _guard = self.lock.lock().await;
        self.read_bundle().await
    }

    pub async fn save_record(&self, record: Value) -> Result<Value, String> {
        let _guard = self.lock.lock().await;
        let current = self.read_bundle().await;
        let record_id = record.get("id").and_then(|v| v.as_str()).unwrap_or("");

        let mut history: Vec<Value> = current
            .get("history")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        history.retain(|item| {
            item.get("id").and_then(|v| v.as_str()).unwrap_or("") != record_id
        });
        history.insert(0, record.clone());
        history.truncate(HISTORY_LIMIT);

        let bundle = json!({
            "history": history,
            "latestRecord": record,
        });
        write_json(&history_path(), &bundle).await?;

        Ok(json!(history))
    }

    pub async fn delete_record(&self, id: &str) -> Result<Value, String> {
        let _guard = self.lock.lock().await;
        let current = self.read_bundle().await;

        let mut history: Vec<Value> = current
            .get("history")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        history.retain(|item| item.get("id").and_then(|v| v.as_str()).unwrap_or("") != id);

        let current_latest = current.get("latestRecord");
        let latest_id = current_latest
            .and_then(|v| v.get("id"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let latest = if latest_id == id {
            history.first().cloned().unwrap_or(Value::Null)
        } else {
            current_latest.cloned().unwrap_or(Value::Null)
        };

        let bundle = json!({
            "history": history,
            "latestRecord": latest,
        });
        write_json(&history_path(), &bundle).await?;

        Ok(json!(history))
    }

    pub async fn clear(&self) -> Result<(), String> {
        let _guard = self.lock.lock().await;
        let bundle = json!({
            "history": [],
            "latestRecord": null,
        });
        write_json(&history_path(), &bundle).await
    }

    pub async fn get_record_by_id(&self, id: &str) -> Value {
        let _guard = self.lock.lock().await;
        let current = self.read_bundle().await;
        let history = current
            .get("history")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        history
            .into_iter()
            .find(|item| item.get("id").and_then(|v| v.as_str()).unwrap_or("") == id)
            .unwrap_or(Value::Null)
    }
}

#[tauri::command]
pub async fn kwc_history_get_bundle(
    store: tauri::State<'_, Arc<HistoryStore>>,
) -> Result<Value, String> {
    Ok(store.get_bundle().await)
}

#[tauri::command]
pub async fn kwc_history_save_record(
    store: tauri::State<'_, Arc<HistoryStore>>,
    record: Value,
) -> Result<Value, String> {
    store.save_record(record).await
}

#[tauri::command]
pub async fn kwc_history_delete_record(
    store: tauri::State<'_, Arc<HistoryStore>>,
    id: String,
) -> Result<Value, String> {
    store.delete_record(&id).await
}

#[tauri::command]
pub async fn kwc_history_clear(
    store: tauri::State<'_, Arc<HistoryStore>>,
) -> Result<(), String> {
    store.clear().await
}

#[tauri::command]
pub async fn kwc_history_get_record_by_id(
    store: tauri::State<'_, Arc<HistoryStore>>,
    id: String,
) -> Result<Value, String> {
    Ok(store.get_record_by_id(&id).await)
}
