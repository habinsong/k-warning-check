import { createAnalysisService } from '@/core/analysisService'
import { setCodexBridgeRestartHandler } from '@/platform/codexBridgeControl'

export const desktopHistoryRepository = {
  async getHistoryBundle() {
    const bundle = await window.kwcDesktop.history.getBundle()
    return {
      history: bundle.history,
      latestRecord: bundle.latestRecord ?? undefined,
    }
  },
  saveRecord(record: Parameters<typeof window.kwcDesktop.history.saveRecord>[0]) {
    return window.kwcDesktop.history.saveRecord(record)
  },
  deleteRecord(id: string) {
    return window.kwcDesktop.history.deleteRecord(id)
  },
  clearHistory() {
    return window.kwcDesktop.history.clear()
  },
  async getRecordById(id: string) {
    return (await window.kwcDesktop.history.getRecordById(id)) ?? undefined
  },
}

export const desktopProviderStateRepository = {
  getProviderState() {
    return window.kwcDesktop.providerState.get()
  },
  saveProviderState(state: Parameters<typeof window.kwcDesktop.providerState.save>[0]) {
    return window.kwcDesktop.providerState.save(state)
  },
}

export const desktopSecureStoreService = {
  getStatus() {
    return window.kwcDesktop.secureStore.getStatus()
  },
  setSecret(
    provider: Parameters<typeof window.kwcDesktop.secureStore.setSecret>[0],
    secret: Parameters<typeof window.kwcDesktop.secureStore.setSecret>[1],
    retention: Parameters<typeof window.kwcDesktop.secureStore.setSecret>[2],
  ) {
    return window.kwcDesktop.secureStore.setSecret(provider, secret, retention)
  },
  deleteSecret(provider: Parameters<typeof window.kwcDesktop.secureStore.deleteSecret>[0]) {
    return window.kwcDesktop.secureStore.deleteSecret(provider)
  },
  validateSecret(provider: Parameters<typeof window.kwcDesktop.secureStore.validateSecret>[0]) {
    return window.kwcDesktop.secureStore.validateSecret(provider)
  },
  async getSecret() {
    throw new Error('데스크톱 렌더러에서는 원문 비밀값을 읽을 수 없습니다.')
  },
  async resolveProviderSecrets() {
    return {}
  },
}

setCodexBridgeRestartHandler(async () => {
  const runtimeCapabilities = await window.kwcDesktop.system.getRuntimeCapabilities()
  if (!runtimeCapabilities.supportsCodex) {
    return
  }
  await window.kwcDesktop.codex.startBridge(true)
})

export const desktopAnalysisService = createAnalysisService({
  historyRepository: desktopHistoryRepository,
  providerStateRepository: desktopProviderStateRepository,
  secureStoreService: desktopSecureStoreService,
  clipboardReader: {
    readClipboardText() {
      return window.kwcDesktop.system.readClipboardText()
    },
  },
})
