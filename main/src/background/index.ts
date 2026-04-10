import { createAnalysisService } from '@/core/analysisService'
import { cropVisibleArea } from '@/modules/image/cropVisibleArea'
import {
  deleteProviderSecret,
  getSecureStoreStatus,
  getProviderSecret,
  resolveProviderSecrets,
  setProviderSecret,
} from '@/modules/storage/secureStore'
import {
  clearHistory,
  deleteRecord,
  getHistory,
  getRecordById,
  saveRecord,
} from '@/modules/storage/history'
import { getProviderState, saveProviderState } from '@/modules/storage/providerState'
import { setCodexBridgeRestartHandler } from '@/platform/codexBridgeControl'
import { getActiveTab } from '@/shared/chrome'
import { STORAGE_KEYS } from '@/shared/constants'
import type {
  AnalysisInput,
  PopupStatus,
  RuntimeMessage,
  RuntimeResponse,
  StoredAnalysisRecord,
} from '@/shared/types'

interface NativeCodexResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

let offscreenReady: Promise<void> | null = null

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.runtime.openOptionsPage()
  }
})

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureOffscreenDocument() {
  if (offscreenReady) {
    return offscreenReady
  }

  offscreenReady = chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD', 'BLOBS'],
      justification: '클립보드 텍스트 읽기와 이미지 OCR 처리를 위해 필요합니다.',
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)

      if (!message.includes('single offscreen document')) {
        throw error
      }
    })
    .finally(() => {
      offscreenReady = null
    })

  return offscreenReady
}

async function broadcastAnalysisReady(record: StoredAnalysisRecord) {
  try {
    await chrome.runtime.sendMessage({
      type: 'analysis-ready',
      record,
    } satisfies RuntimeMessage)
  } catch {
    // 팝업이 열려 있지 않은 경우는 무시합니다.
  }
}

const extensionAnalysisService = createAnalysisService({
  historyRepository: {
    getHistoryBundle: getHistory,
    saveRecord,
    deleteRecord,
    clearHistory,
    getRecordById,
  },
  providerStateRepository: {
    getProviderState,
    saveProviderState,
  },
  secureStoreService: {
    getStatus: getSecureStoreStatus,
    setSecret: setProviderSecret,
    deleteSecret: deleteProviderSecret,
    validateSecret: async (provider) => getSecureStoreStatus().then((status) => status.providers[provider]),
    getSecret: getProviderSecret,
    resolveProviderSecrets,
  },
  clipboardReader: {
    async readClipboardText() {
      await ensureOffscreenDocument()
      const response = (await chrome.runtime.sendMessage({
        type: 'read-clipboard',
      } satisfies RuntimeMessage)) as RuntimeResponse<string>

      if (!response.ok) {
        throw new Error(response.error ?? '클립보드 읽기에 실패했습니다.')
      }

      return response.data ?? ''
    },
  },
  captureReader: {
    async captureRegion({ rect }) {
      const tab = await getActiveTab()
      const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
      const cropped = await cropVisibleArea(screenshot, rect)

      return {
        source: 'capture',
        imageDataUrl: cropped,
        captureRect: rect,
        pageUrl: tab.url,
        title: tab.title,
        createdAt: new Date().toISOString(),
      }
    },
  },
  analysisReadyNotifier: {
    notify: broadcastAnalysisReady,
  },
})

async function analyzeAndPersist(input: AnalysisInput) {
  return extensionAnalysisService.analyzeAndPersist(input)
}

async function getPopupStatus() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.popupStatus)
  return (
    (stored[STORAGE_KEYS.popupStatus] as PopupStatus | null | undefined) ?? {
      loading: false,
      message: '',
    }
  )
}

async function setPopupStatus(status: PopupStatus) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.popupStatus]: status,
  })
}

async function clearPopupStatus() {
  await setPopupStatus({
    loading: false,
    message: '',
  })
}

async function openPopupSafely() {
  try {
    await chrome.action.openPopup()
  } catch {
    // 팝업을 즉시 열 수 없는 경우는 무시합니다.
  }
}

async function sendNativeCodexMessage<T>(message: { type: string; [key: string]: unknown }) {
  let locale: 'ko' | 'en' = 'ko'

  try {
    const providerState = await getProviderState()
    locale = providerState.uiLocale === 'en' ? 'en' : 'ko'
  } catch {
    locale = 'ko'
  }

  let response: NativeCodexResponse<T>

  try {
    response = (await chrome.runtime.sendNativeMessage(
      'kr.k_warning_check.codex',
      message,
    )) as NativeCodexResponse<T>
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error)

    if (rawMessage.includes('Specified native messaging host not found')) {
      throw new Error(
        locale === 'en'
          ? 'The Codex local host is not installed. Run `npm run native:install` in this workspace, then reload the Chrome extension.'
          : 'Codex 로컬 호스트가 설치되지 않았습니다. 이 작업 폴더에서 `npm run native:install`을 실행한 뒤 Chrome 확장을 새로고침하세요.',
      )
    }

    if (rawMessage.includes('Access to native messaging host is forbidden')) {
      throw new Error(
        locale === 'en'
          ? 'The installed Codex local host does not allow this extension. Re-run `npm run native:install` and reload the extension.'
          : '설치된 Codex 로컬 호스트가 현재 확장을 허용하지 않습니다. `npm run native:install`을 다시 실행한 뒤 확장을 새로고침하세요.',
      )
    }

    throw error
  }

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Codex 네이티브 호스트 호출에 실패했습니다.')
  }

  return response.data as T
}

setCodexBridgeRestartHandler(async () => {
  await sendNativeCodexMessage({ type: 'start-codex-bridge', force: true })
})

async function loadGroqModelsFromSecureStore() {
  const providerState = await getProviderState()
  const groqApiKey = (await resolveProviderSecrets()).groqApiKey ?? ''

  if (!groqApiKey.trim()) {
    throw new Error('Groq API 키가 설정되지 않았습니다.')
  }

  const response = await fetch(`${providerState.groq.endpoint}/models`, {
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(8_000),
  })

  const data = (await response.json()) as {
    data?: Array<{ id?: string }>
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Groq 모델 목록 호출 실패: ${response.status}`)
  }

  return (data.data ?? []).map((model) => model.id).filter(Boolean) as string[]
}

async function analyzeSelectionFromActiveTab() {
  const tab = await getActiveTab()
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: () => window.getSelection()?.toString() ?? '',
  })

  const selectedText = String(result ?? '').trim()

  if (!selectedText) {
    throw new Error('현재 페이지에서 선택한 텍스트가 없습니다.')
  }

  return analyzeAndPersist({
    source: 'selection',
    rawText: selectedText,
    selectedText,
    pageUrl: tab.url,
    title: tab.title,
    createdAt: new Date().toISOString(),
  })
}

async function startCaptureOverlay() {
  const tab = await getActiveTab()

  await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    files: ['assets/content.js'],
  })

  await chrome.tabs.sendMessage(tab.id!, { type: 'start-capture-overlay' })
}

async function analyzeClipboardText() {
  return extensionAnalysisService.analyzeClipboard()
}

async function runShortcutTask(statusMessage: string, task: () => Promise<StoredAnalysisRecord | null>) {
  const statusPromise = setPopupStatus({
    loading: true,
    message: statusMessage,
  })
  const popupPromise = openPopupSafely()
  await Promise.all([statusPromise, popupPromise])
  await wait(120)

  try {
    const record = await task()
    await clearPopupStatus()
    return record
  } catch (error) {
    await setPopupStatus({
      loading: false,
      message: '',
      error: error instanceof Error ? error.message : '단축키 분석에 실패했습니다.',
    })
    throw error
  }
}

async function handleCaptureFinished(rect: {
  x: number
  y: number
  width: number
  height: number
  devicePixelRatio?: number
}) {
  await setPopupStatus({
    loading: true,
    message: '캡처 이미지를 분석 중입니다...',
  })

  await openPopupSafely()

  try {
    const record = await extensionAnalysisService.analyzeCapturedRegion({ rect })
    await clearPopupStatus()
    return record
  } catch (error) {
    await setPopupStatus({
      loading: false,
      message: '',
      error: error instanceof Error ? error.message : '영역 분석에 실패했습니다.',
    })
    throw error
  }
}

async function onMessage(message: RuntimeMessage) {
  switch (message.type) {
    case 'analyze-input':
      return extensionAnalysisService.analyzeAndPersist(message.input)
    case 'analyze-active-selection':
      return analyzeSelectionFromActiveTab()
    case 'capture-active-area':
      await startCaptureOverlay()
      return null
    case 'capture-finished':
      return handleCaptureFinished(message.rect)
    case 'analyze-clipboard':
      return extensionAnalysisService.analyzeClipboard()
    case 'get-latest-record':
      return extensionAnalysisService.getLatestRecord()
    case 'get-history':
      return extensionAnalysisService.getHistory()
    case 'delete-history-record':
      return extensionAnalysisService.deleteHistoryRecord(message.id)
    case 'clear-history':
      return extensionAnalysisService.clearHistory()
    case 'reanalyze-record':
      return extensionAnalysisService.reanalyzeRecord(message.id)
    case 'get-provider-state':
      return getProviderState()
    case 'save-provider-state':
      return saveProviderState(message.state)
    case 'save-provider-secret': {
      const currentState = await getProviderState()
      const providerStatus = await setProviderSecret(message.provider, message.secret, message.retention)
      return saveProviderState({
        ...currentState,
        [message.provider]: {
          ...currentState[message.provider],
          ...providerStatus,
        },
      })
    }
    case 'delete-provider-secret':
      {
        const currentState = await getProviderState()
        const providerStatus = await deleteProviderSecret(message.provider)
        return saveProviderState({
          ...currentState,
          [message.provider]: {
            ...currentState[message.provider],
            ...providerStatus,
          },
        })
      }
    case 'load-groq-models':
      return loadGroqModelsFromSecureStore()
    case 'get-popup-status':
      return getPopupStatus()
    case 'get-codex-status':
      return sendNativeCodexMessage({ type: 'codex-status' })
    case 'start-codex-login':
      return sendNativeCodexMessage({ type: 'start-codex-login' })
    case 'start-codex-bridge':
      return sendNativeCodexMessage({ type: 'start-codex-bridge', force: true })
    default:
      return null
  }
}

if (chrome.storage.local.setAccessLevel) {
  void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {
    // 지원되지 않는 브라우저는 무시합니다.
  })
}

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'kwc-analyze-selection',
      title: 'K-워닝체크로 선택 텍스트 분석',
      contexts: ['selection'],
    })

    chrome.contextMenus.create({
      id: 'kwc-capture-area',
      title: 'K-워닝체크로 화면 영역 캡처 분석',
      contexts: ['page', 'image'],
    })
  })
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenus()
})

createContextMenus()

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'kwc-analyze-selection' && info.selectionText) {
    void analyzeAndPersist({
      source: 'selection',
      rawText: info.selectionText,
      selectedText: info.selectionText,
      pageUrl: info.pageUrl,
      createdAt: new Date().toISOString(),
    })
  }

  if (info.menuItemId === 'kwc-capture-area') {
    void startCaptureOverlay()
  }
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'analyze-selection') {
    void runShortcutTask('선택한 텍스트를 분석 중입니다...', analyzeSelectionFromActiveTab)
  }

  if (command === 'analyze-clipboard') {
    void runShortcutTask('클립보드 텍스트를 분석 중입니다...', analyzeClipboardText)
  }

  if (command === 'capture-area') {
    void setPopupStatus({
      loading: true,
      message: '페이지에서 분석할 영역을 드래그하세요.',
    }).then(() => startCaptureOverlay())
  }
})

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _, sendResponse) => {
  if (message.type === 'read-clipboard' || message.type === 'run-ocr') {
    return undefined
  }

  void onMessage(message)
    .then((data) => {
      sendResponse({
        ok: true,
        data,
      } satisfies RuntimeResponse)
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : '요청 처리에 실패했습니다.',
      } satisfies RuntimeResponse)
    })

  return true
})
