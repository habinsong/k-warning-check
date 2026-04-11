mod commands;
mod secure;
mod store;

#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicBool, Ordering};

use commands::capture::new_capture_state;
use commands::history::HistoryStore;
use commands::shortcuts::{
    build_global_shortcut_plugin, read_shortcut_config_sync, register_shortcuts_from_config,
    ShortcutConfigState,
};

#[cfg(target_os = "macos")]
use objc2::MainThreadMarker;
#[cfg(target_os = "macos")]
use objc2_app_kit::NSApplication;
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
#[cfg(target_os = "macos")]
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
#[cfg(target_os = "macos")]
use tauri::{
    AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder, Window,
    WindowEvent, Wry,
};

#[cfg(target_os = "macos")]
const MAIN_WINDOW_LABEL: &str = "main";
#[cfg(target_os = "macos")]
const LAUNCHER_WINDOW_LABEL: &str = "launcher";
#[cfg(target_os = "macos")]
const MAIN_NAVIGATION_EVENT: &str = "kwc:navigate-main";
#[cfg(target_os = "macos")]
const LAUNCHER_SHOWN_EVENT: &str = "kwc:launcher-shown";
#[cfg(target_os = "macos")]
const TRAY_OPEN_APP_ID: &str = "tray-open-app";
#[cfg(target_os = "macos")]
const TRAY_OPEN_SETTINGS_ID: &str = "tray-open-settings";
#[cfg(target_os = "macos")]
const TRAY_QUIT_ID: &str = "tray-quit";
#[cfg(target_os = "macos")]
const LAUNCHER_WIDTH: f64 = 840.0;
#[cfg(target_os = "macos")]
const LAUNCHER_HEIGHT: f64 = 492.0;
#[cfg(target_os = "macos")]
const LAUNCHER_BOTTOM_MARGIN: f64 = 44.0;
#[cfg(target_os = "macos")]
const TRAY_ICON: tauri::image::Image<'_> = tauri::include_image!("icons/tray-template.png");

#[cfg(target_os = "macos")]
struct AppLifecycleState {
    quitting: AtomicBool,
}

#[cfg(target_os = "macos")]
impl AppLifecycleState {
    fn new() -> Self {
        Self {
            quitting: AtomicBool::new(false),
        }
    }

    fn mark_quitting(&self) {
        self.quitting.store(true, Ordering::SeqCst);
    }

    fn is_quitting(&self) -> bool {
        self.quitting.load(Ordering::SeqCst)
    }
}

#[cfg(target_os = "macos")]
#[allow(dead_code)]
struct MacTrayIcon(TrayIcon<Wry>);

#[cfg(target_os = "macos")]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopNavigateEvent {
    tab: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    input_tab: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
}

#[cfg(target_os = "macos")]
impl DesktopNavigateEvent {
    fn settings() -> Self {
        Self {
            tab: "settings".to_string(),
            input_tab: None,
            text: None,
            url: None,
        }
    }
}

pub fn run() {
    let shortcut_config = read_shortcut_config_sync();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(build_global_shortcut_plugin())
        .manage(HistoryStore::new())
        .manage(new_capture_state())
        .manage(ShortcutConfigState(std::sync::Mutex::new(shortcut_config.clone())));

    #[cfg(target_os = "macos")]
    let builder = builder.manage(AppLifecycleState::new());

    builder
        .setup(move |_app| {
            let _ = register_shortcuts_from_config(_app.handle(), &shortcut_config);

            #[cfg(target_os = "macos")]
            setup_macos_tray(_app)?;

            Ok(())
        })
        .on_window_event(|_window, _event| {
            #[cfg(target_os = "macos")]
            handle_macos_window_event(_window, _event);
        })
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
            commands::system::kwc_system_get_runtime_capabilities,
            commands::system::kwc_system_get_screen_capture_permission_status,
            commands::system::kwc_system_request_screen_capture_permission,
            // Capture
            commands::capture::kwc_system_capture_screen_region,
            commands::capture::kwc_capture_overlay_complete,
            commands::capture::kwc_capture_overlay_cancel,
            // Shortcuts
            commands::shortcuts::kwc_shortcuts_get_config,
            commands::shortcuts::kwc_shortcuts_save_config,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 앱 실행 중 오류가 발생했습니다.");
}

#[cfg(target_os = "macos")]
fn setup_macos_tray(app: &mut tauri::App<Wry>) -> tauri::Result<()> {
    let open_app_item = MenuItem::with_id(app, TRAY_OPEN_APP_ID, "앱 실행", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, TRAY_OPEN_SETTINGS_ID, "설정", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, TRAY_QUIT_ID, "종료", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&open_app_item, &settings_item, &separator, &quit_item],
    )?;

    let open_app_id = open_app_item.id().clone();
    let settings_id = settings_item.id().clone();
    let quit_id = quit_item.id().clone();

    let tray_icon = TrayIconBuilder::with_id("kwc-menu-bar")
        .icon(TRAY_ICON)
        .icon_as_template(true)
        .tooltip("K-WarningCheck Desktop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app_handle, event| {
            if event.id() == &open_app_id {
                let _ = show_main_window(app_handle, None);
                return;
            }

            if event.id() == &settings_id {
                let _ = show_main_window(app_handle, Some(DesktopNavigateEvent::settings()));
                return;
            }

            if event.id() == &quit_id {
                app_handle.state::<AppLifecycleState>().mark_quitting();
                app_handle.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = toggle_launcher_window(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(MacTrayIcon(tray_icon));

    Ok(())
}

#[cfg(target_os = "macos")]
fn toggle_launcher_window(app: &AppHandle<Wry>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(LAUNCHER_WINDOW_LABEL) {
        if window.is_visible()? {
            window.hide()?;
        } else {
            activate_macos_app(app)?;
            window.show()?;
            window.set_focus()?;
            app.emit_to(LAUNCHER_WINDOW_LABEL, LAUNCHER_SHOWN_EVENT, ())?;
        }
        return Ok(());
    }

    let position = launcher_position(app)?;
    let window = WebviewWindowBuilder::new(
        app,
        LAUNCHER_WINDOW_LABEL,
        WebviewUrl::App("launcher.html".into()),
    )
    .title("K-WarningCheck Launcher")
    .inner_size(LAUNCHER_WIDTH, LAUNCHER_HEIGHT)
    .position(position.x, position.y)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .focused(true)
    .build()?;

    activate_macos_app(app)?;
    window.set_focus()?;
    app.emit_to(LAUNCHER_WINDOW_LABEL, LAUNCHER_SHOWN_EVENT, ())?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn activate_macos_app(app: &AppHandle<Wry>) -> tauri::Result<()> {
    app.run_on_main_thread(|| {
        let mtm = MainThreadMarker::new().expect("macOS 메인 스레드에서만 앱 활성화가 가능합니다.");
        let ns_app = NSApplication::sharedApplication(mtm);
        #[allow(deprecated)]
        ns_app.activateIgnoringOtherApps(true);
    })
}

#[cfg(target_os = "macos")]
fn launcher_position(app: &AppHandle<Wry>) -> tauri::Result<LogicalPosition<f64>> {
    let monitor = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .and_then(|window| window.current_monitor().ok().flatten())
        .or(app.primary_monitor()?);

    let Some(monitor) = monitor else {
        return Ok(LogicalPosition::new(160.0, 160.0));
    };

    let work_area = monitor.work_area();
    let scale_factor = monitor.scale_factor();
    let work_x = work_area.position.x as f64 / scale_factor;
    let work_y = work_area.position.y as f64 / scale_factor;
    let work_width = work_area.size.width as f64 / scale_factor;
    let work_height = work_area.size.height as f64 / scale_factor;

    let x = work_x + ((work_width - LAUNCHER_WIDTH) / 2.0).max(0.0);
    let y = work_y + (work_height - LAUNCHER_HEIGHT - LAUNCHER_BOTTOM_MARGIN).max(16.0);

    Ok(LogicalPosition::new(x, y))
}

#[cfg(target_os = "macos")]
fn show_main_window(
    app: &AppHandle<Wry>,
    navigation: Option<DesktopNavigateEvent>,
) -> tauri::Result<()> {
    if let Some(launcher_window) = app.get_webview_window(LAUNCHER_WINDOW_LABEL) {
        let _ = launcher_window.hide();
    }

    let main_window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "메인 창을 찾지 못했습니다."))?;

    let _ = main_window.unminimize();
    main_window.show()?;
    main_window.set_focus()?;

    if let Some(payload) = navigation {
        app.emit_to(MAIN_WINDOW_LABEL, MAIN_NAVIGATION_EVENT, payload)?;
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn handle_macos_window_event(window: &Window<Wry>, event: &WindowEvent) {
    let lifecycle = window.state::<AppLifecycleState>();

    match (window.label(), event) {
        (MAIN_WINDOW_LABEL, WindowEvent::CloseRequested { api, .. }) if !lifecycle.is_quitting() => {
            api.prevent_close();
            let _ = window.hide();
        }
        (LAUNCHER_WINDOW_LABEL, WindowEvent::CloseRequested { api, .. }) if !lifecycle.is_quitting() => {
            api.prevent_close();
            let _ = window.hide();
        }
        _ => {}
    }
}
