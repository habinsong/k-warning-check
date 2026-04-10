import { invoke } from '@tauri-apps/api/core'
import type { DesktopApi, CaptureOverlayApi } from '@/platform/desktopApi'
import type { CaptureRect } from '@/shared/types'

const tauriDesktopApi: DesktopApi = {
  history: {
    getBundle: () => invoke('kwc_history_get_bundle'),
    saveRecord: (record) => invoke('kwc_history_save_record', { record }),
    deleteRecord: (id) => invoke('kwc_history_delete_record', { id }),
    clear: () => invoke('kwc_history_clear'),
    getRecordById: (id) => invoke('kwc_history_get_record_by_id', { id }),
  },
  providerState: {
    get: () => invoke('kwc_provider_state_get'),
    save: (state) => invoke('kwc_provider_state_save', { state }),
  },
  secureStore: {
    getStatus: () => invoke('kwc_secure_store_status'),
    setSecret: (provider, secret, retention) =>
      invoke('kwc_secure_store_set_secret', { provider, secret, retention }),
    deleteSecret: (provider) => invoke('kwc_secure_store_delete_secret', { provider }),
    validateSecret: (provider) => invoke('kwc_secure_store_validate_secret', { provider }),
  },
  providerBridge: {
    invoke: <T = unknown>(
      provider: string,
      operation: string,
      payload: Record<string, unknown>,
    ) => invoke<T>('kwc_provider_bridge_invoke', { provider, operation, payload }),
  },
  codex: {
    getStatus: () => invoke('kwc_codex_get_status'),
    startBridge: (force) => invoke('kwc_codex_start_bridge', { force: force ?? false }),
    startLogin: () => invoke('kwc_codex_start_login'),
  },
  system: {
    readClipboardText: () => invoke('kwc_system_read_clipboard_text'),
    captureScreenRegion: () => invoke('kwc_system_capture_screen_region'),
    getScreenCapturePermissionStatus: () =>
      invoke('kwc_system_get_screen_capture_permission_status'),
    requestScreenCapturePermission: () =>
      invoke('kwc_system_request_screen_capture_permission'),
    openExternal: (url) => invoke('kwc_system_open_external', { url }),
  },
}

const tauriCaptureOverlayApi: CaptureOverlayApi = {
  completeSelection: (rect: CaptureRect) =>
    invoke('kwc_capture_overlay_complete', { rect }),
  cancelSelection: () => invoke('kwc_capture_overlay_cancel'),
}

window.kwcDesktop = tauriDesktopApi
window.kwcCaptureOverlay = tauriCaptureOverlayApi
