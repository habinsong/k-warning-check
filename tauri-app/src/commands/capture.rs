use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(rename = "devicePixelRatio")]
    pub device_pixel_ratio: Option<f64>,
}

pub struct CaptureSession {
    pub resolve: tokio::sync::oneshot::Sender<Value>,
}

pub type CaptureState = Arc<Mutex<Option<CaptureSession>>>;

pub fn new_capture_state() -> CaptureState {
    Arc::new(Mutex::new(None))
}

#[tauri::command]
pub async fn kwc_system_capture_screen_region(
    app: tauri::AppHandle,
    capture_state: tauri::State<'_, CaptureState>,
) -> Result<Value, String> {
    {
        let existing = capture_state.lock().await;
        if existing.is_some() {
            return Err("이미 화면 영역 선택이 진행 중입니다.".into());
        }
    }

    // Check macOS permission
    #[cfg(target_os = "macos")]
    {
        extern "C" {
            fn CGPreflightScreenCaptureAccess() -> bool;
        }
        if !unsafe { CGPreflightScreenCaptureAccess() } {
            let _ = open::that(
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
            );
            return Err("화면 영역 분석을 사용하려면 macOS 설정에서 이 앱의 화면 및 시스템 오디오 녹화 권한을 허용한 뒤 앱을 다시 실행하세요.".into());
        }
    }

    // Get primary monitor info (extract values before any .await since Monitor is !Send)
    let (mon_x, mon_y, mon_width, mon_height) = {
        let monitors = xcap::Monitor::all().map_err(|e| format!("모니터 정보 가져오기 실패: {e}"))?;
        let monitor = monitors.first().ok_or("사용 가능한 디스플레이가 없습니다.")?;
        let x = monitor.x().map_err(|e| format!("모니터 좌표 읽기 실패: {e}"))? as f64;
        let y = monitor.y().map_err(|e| format!("모니터 좌표 읽기 실패: {e}"))? as f64;
        let w = monitor.width().map_err(|e| format!("모니터 크기 읽기 실패: {e}"))? as f64;
        let h = monitor.height().map_err(|e| format!("모니터 크기 읽기 실패: {e}"))? as f64;
        (x, y, w, h)
    };

    // Create overlay window
    let overlay = WebviewWindowBuilder::new(
        &app,
        "capture-overlay",
        WebviewUrl::App("capture-overlay.html".into()),
    )
    .title("")
    .inner_size(mon_width, mon_height)
    .position(mon_x, mon_y)
    .transparent(true)
    .decorations(false)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .focused(true)
    .build()
    .map_err(|e| format!("오버레이 윈도우 생성 실패: {e}"))?;

    overlay
        .set_always_on_top(true)
        .map_err(|e| format!("always-on-top 설정 실패: {e}"))?;

    // Set up oneshot channel for result
    let (tx, rx) = tokio::sync::oneshot::channel::<Value>();
    {
        let mut state = capture_state.lock().await;
        *state = Some(CaptureSession { resolve: tx });
    }

    // Wait for capture completion or cancellation
    match rx.await {
        Ok(result) => Ok(result),
        Err(_) => Err("화면 영역 선택을 취소했습니다.".into()),
    }
}

#[tauri::command]
pub async fn kwc_capture_overlay_complete(
    app: tauri::AppHandle,
    capture_state: tauri::State<'_, CaptureState>,
    rect: CaptureRect,
) -> Result<(), String> {
    let session = {
        let mut state = capture_state.lock().await;
        state.take()
    };

    let Some(session) = session else {
        return Ok(());
    };

    // Close overlay window
    if let Some(overlay) = app.get_webview_window("capture-overlay") {
        let _ = overlay.close();
    }

    // Capture the screen
    let monitors = xcap::Monitor::all().map_err(|e| format!("모니터 가져오기 실패: {e}"))?;
    let monitor = monitors.first().ok_or("모니터를 찾을 수 없습니다.")?;
    let scale = monitor.scale_factor().map_err(|e| format!("스케일 팩터 읽기 실패: {e}"))? as f64;
    let captured = monitor
        .capture_image()
        .map_err(|e| format!("화면 캡처 실패: {e}"))?;

    // Crop the selected region
    let crop_x = (rect.x * scale).round().max(0.0) as u32;
    let crop_y = (rect.y * scale).round().max(0.0) as u32;
    let crop_w = (rect.width * scale).round().max(1.0) as u32;
    let crop_h = (rect.height * scale).round().max(1.0) as u32;

    let (img_w, img_h) = captured.dimensions();
    let crop_x = crop_x.min(img_w.saturating_sub(1));
    let crop_y = crop_y.min(img_h.saturating_sub(1));
    let crop_w = crop_w.min(img_w - crop_x);
    let crop_h = crop_h.min(img_h - crop_y);

    let cropped = image::DynamicImage::ImageRgba8(captured)
        .crop_imm(crop_x, crop_y, crop_w, crop_h);

    // Encode to PNG data URL
    let mut png_bytes = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_bytes);
    cropped
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| format!("이미지 인코딩 실패: {e}"))?;

    let data_url = format!("data:image/png;base64,{}", B64.encode(&png_bytes));
    let monitor_name = monitor.name().unwrap_or_else(|_| String::new());

    let result = json!({
        "imageDataUrl": data_url,
        "rect": {
            "x": rect.x,
            "y": rect.y,
            "width": rect.width,
            "height": rect.height,
            "devicePixelRatio": scale,
        },
        "title": if monitor_name.is_empty() { "화면 캡처".to_string() } else { monitor_name },
    });

    let _ = session.resolve.send(result);
    Ok(())
}

#[tauri::command]
pub async fn kwc_capture_overlay_cancel(
    app: tauri::AppHandle,
    capture_state: tauri::State<'_, CaptureState>,
) -> Result<(), String> {
    let session = {
        let mut state = capture_state.lock().await;
        state.take()
    };

    if let Some(overlay) = app.get_webview_window("capture-overlay") {
        let _ = overlay.close();
    }

    // Drop the sender, which causes the receiver to get an error -> cancellation
    drop(session);
    Ok(())
}
