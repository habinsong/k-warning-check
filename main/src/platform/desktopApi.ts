import type {
  ApiKeyRetention,
  CaptureRect,
  ProviderState,
  SecretProviderKind,
  SecureStoreProviderStatus,
  SecureStoreStatus,
  StoredAnalysisRecord,
} from '@/shared/types'

export interface DesktopHistoryBundle {
  history: StoredAnalysisRecord[]
  latestRecord: StoredAnalysisRecord | null
}

export interface DesktopCaptureResult {
  imageDataUrl: string
  rect: CaptureRect
  title?: string
}

export interface DesktopScreenCapturePermissionStatus {
  supported: boolean
  granted: boolean
  status: string
}

export interface DesktopCodexStatus {
  status?: string
  message?: string
  command?: string
  bridgeRunning?: boolean
}

export interface DesktopCodexLoginResult {
  output?: string
  authUrl?: string
  message?: string
  logPath?: string
  alreadyLoggedIn?: boolean
}

export type DesktopProviderBridgeKind = 'gemini' | 'groq'
export type DesktopProviderBridgeOperation = 'summarize' | 'extractTextFromImage' | 'verifyFreshness'

export interface DesktopApi {
  history: {
    getBundle(): Promise<DesktopHistoryBundle>
    saveRecord(record: StoredAnalysisRecord): Promise<StoredAnalysisRecord[]>
    deleteRecord(id: string): Promise<StoredAnalysisRecord[]>
    clear(): Promise<void>
    getRecordById(id: string): Promise<StoredAnalysisRecord | null>
  }
  providerState: {
    get(): Promise<ProviderState>
    save(state: ProviderState): Promise<ProviderState>
  }
  secureStore: {
    getStatus(): Promise<SecureStoreStatus>
    setSecret(
      provider: SecretProviderKind,
      secret: string,
      retention: ApiKeyRetention,
    ): Promise<SecureStoreProviderStatus>
    deleteSecret(provider: SecretProviderKind): Promise<SecureStoreProviderStatus>
    validateSecret(provider: SecretProviderKind): Promise<SecureStoreProviderStatus>
  }
  providerBridge: {
    invoke<T = unknown>(
      provider: DesktopProviderBridgeKind,
      operation: DesktopProviderBridgeOperation,
      payload: Record<string, unknown>,
    ): Promise<T>
  }
  codex: {
    getStatus(): Promise<DesktopCodexStatus>
    startBridge(force?: boolean): Promise<DesktopCodexStatus>
    startLogin(): Promise<DesktopCodexLoginResult>
  }
  system: {
    readClipboardText(): Promise<string>
    captureScreenRegion(): Promise<DesktopCaptureResult>
    getScreenCapturePermissionStatus(): Promise<DesktopScreenCapturePermissionStatus>
    requestScreenCapturePermission(): Promise<DesktopScreenCapturePermissionStatus>
    openExternal(url: string): Promise<void>
  }
}

export interface CaptureOverlayApi {
  completeSelection(rect: CaptureRect): Promise<void>
  cancelSelection(): Promise<void>
}

declare global {
  interface Window {
    kwcDesktop: DesktopApi
    kwcCaptureOverlay: CaptureOverlayApi
  }
}

export {}
