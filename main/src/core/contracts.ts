import type {
  AnalysisInput,
  ApiKeyRetention,
  CaptureRect,
  PopupStatus,
  ProviderSecrets,
  ProviderState,
  SecretProviderKind,
  SecureStoreProviderStatus,
  SecureStoreStatus,
  StoredAnalysisRecord,
} from '@/shared/types'

export interface HistoryRepository {
  getHistoryBundle(): Promise<{
    history: StoredAnalysisRecord[]
    latestRecord?: StoredAnalysisRecord
  }>
  saveRecord(record: StoredAnalysisRecord): Promise<StoredAnalysisRecord[]>
  deleteRecord(id: string): Promise<StoredAnalysisRecord[]>
  clearHistory(): Promise<void>
  getRecordById(id: string): Promise<StoredAnalysisRecord | undefined>
}

export interface ProviderStateRepository {
  getProviderState(): Promise<ProviderState>
  saveProviderState(state: ProviderState): Promise<ProviderState>
}

export interface SecureStoreService {
  getStatus(): Promise<SecureStoreStatus>
  setSecret(
    provider: SecretProviderKind,
    secret: string,
    retention: ApiKeyRetention,
  ): Promise<SecureStoreProviderStatus>
  deleteSecret(provider: SecretProviderKind): Promise<SecureStoreProviderStatus>
  validateSecret(provider: SecretProviderKind): Promise<SecureStoreProviderStatus>
  getSecret(provider: SecretProviderKind): Promise<string>
  resolveProviderSecrets(): Promise<ProviderSecrets>
}

export interface CodexBridgeService {
  getStatus(): Promise<unknown>
  startBridge(force?: boolean): Promise<unknown>
  startLogin(): Promise<unknown>
}

export interface AnalysisReadyNotifier {
  notify(record: StoredAnalysisRecord): Promise<void> | void
}

export interface PopupStatusStore {
  getPopupStatus(): Promise<PopupStatus>
  setPopupStatus(status: PopupStatus): Promise<void>
  clearPopupStatus(): Promise<void>
}

export interface ClipboardReader {
  readClipboardText(): Promise<string>
}

export interface CaptureReader {
  captureRegion(request: {
    rect: CaptureRect
    title?: string
    pageUrl?: string
  }): Promise<AnalysisInput>
}
