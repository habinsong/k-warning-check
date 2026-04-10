mod commands;
mod secure;
mod store;

use commands::capture::new_capture_state;
use commands::history::HistoryStore;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .manage(HistoryStore::new())
        .manage(new_capture_state())
        .invoke_handler(tauri::generate_handler![
            // History
            commands::history::kwc_history_get_bundle,
            commands::history::kwc_history_save_record,
            commands::history::kwc_history_delete_record,
            commands::history::kwc_history_clear,
            commands::history::kwc_history_get_record_by_id,
            // Provider State
            commands::provider_state::kwc_provider_state_get,
            commands::provider_state::kwc_provider_state_save,
            // Secure Store
            commands::secure_store::kwc_secure_store_status,
            commands::secure_store::kwc_secure_store_set_secret,
            commands::secure_store::kwc_secure_store_delete_secret,
            commands::secure_store::kwc_secure_store_validate_secret,
            // Provider Bridge
            commands::provider_bridge::kwc_provider_bridge_invoke,
            // Codex
            commands::codex::kwc_codex_get_status,
            commands::codex::kwc_codex_start_bridge,
            commands::codex::kwc_codex_start_login,
            // System
            commands::system::kwc_system_read_clipboard_text,
            commands::system::kwc_system_open_external,
            commands::system::kwc_system_get_screen_capture_permission_status,
            commands::system::kwc_system_request_screen_capture_permission,
            // Capture
            commands::capture::kwc_system_capture_screen_region,
            commands::capture::kwc_capture_overlay_complete,
            commands::capture::kwc_capture_overlay_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 앱 실행 중 오류가 발생했습니다.");
}
