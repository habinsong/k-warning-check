import { analyzeInput } from '@/modules/analyzer/analyzeInput'
import { cropVisibleArea } from '@/modules/image/cropVisibleArea'
import {
  clearHistory,
  deleteRecord,
  getHistory,
  getRecordById,
  saveRecord,
} from '@/modules/storage/history'
import { getProviderState, saveProviderState } from '@/modules/storage/providerState'
import { getActiveTab } from '@/shared/chrome'
import type {
  AnalysisInput,
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

async function analyzeAndPersist(input: AnalysisInput) {
  const providerState = await getProviderState()
  const record = await analyzeInput(input, providerState)
  await saveRecord(record)
  await broadcastAnalysisReady(record)
  return record
}

async function sendNativeCodexMessage<T>(message: { type: string }) {
  const response = (await chrome.runtime.sendNativeMessage(
    'kr.k_warning_check.codex',
    message,
  )) as NativeCodexResponse<T>

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Codex 네이티브 호스트 호출에 실패했습니다.')
  }

  return response.data as T
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
  await ensureOffscreenDocument()
  const response = (await chrome.runtime.sendMessage({
    type: 'read-clipboard',
  } satisfies RuntimeMessage)) as RuntimeResponse<string>

  if (!response.ok || !response.data?.trim()) {
    throw new Error(response.error ?? '클립보드에 분석할 텍스트가 없습니다.')
  }

  return analyzeAndPersist({
    source: 'clipboard',
    rawText: response.data,
    createdAt: new Date().toISOString(),
  })
}

async function handleCaptureFinished(rect: {
  x: number
  y: number
  width: number
  height: number
  devicePixelRatio?: number
}) {
  const tab = await getActiveTab()
  const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
  const cropped = await cropVisibleArea(screenshot, rect)

  return analyzeAndPersist({
    source: 'capture',
    imageDataUrl: cropped,
    captureRect: rect,
    pageUrl: tab.url,
    title: tab.title,
    createdAt: new Date().toISOString(),
  })
}

async function onMessage(message: RuntimeMessage) {
  switch (message.type) {
    case 'analyze-input':
      return analyzeAndPersist(message.input)
    case 'analyze-active-selection':
      return analyzeSelectionFromActiveTab()
    case 'capture-active-area':
      await startCaptureOverlay()
      return null
    case 'capture-finished':
      return handleCaptureFinished(message.rect)
    case 'analyze-clipboard':
      return analyzeClipboardText()
    case 'get-latest-record':
      return (await getHistory()).latestRecord ?? null
    case 'get-history':
      return (await getHistory()).history
    case 'delete-history-record':
      return deleteRecord(message.id)
    case 'clear-history':
      await clearHistory()
      return []
    case 'reanalyze-record': {
      const record = await getRecordById(message.id)

      if (!record) {
        throw new Error('기록을 찾을 수 없습니다.')
      }

      return analyzeAndPersist({
        ...record.input,
        createdAt: new Date().toISOString(),
      })
    }
    case 'get-provider-state':
      return getProviderState()
    case 'save-provider-state':
      return saveProviderState(message.state)
    case 'get-codex-status':
      return sendNativeCodexMessage({ type: 'codex-status' })
    case 'start-codex-login':
      return sendNativeCodexMessage({ type: 'start-codex-login' })
    case 'start-codex-bridge':
      return sendNativeCodexMessage({ type: 'start-codex-bridge' })
    default:
      return null
  }
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
    void analyzeSelectionFromActiveTab()
  }

  if (command === 'analyze-clipboard') {
    void analyzeClipboardText()
  }

  if (command === 'capture-area') {
    void startCaptureOverlay()
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
