import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, ExternalLink, History, ImagePlus, Link2, Search, Settings2 } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { isProviderSelectable, isProviderWebSearchCapable } from '@/core/providerStateModel'
import { desktopAnalysisService, desktopProviderStateRepository } from '@/desktop/renderer/services'
import { tauriShortcutApi } from '@/desktop/renderer/tauri-bridge'
import {
  MAIN_NAVIGATION_EVENT,
  type DesktopNavigationEventPayload,
} from '@/desktop/renderer/windowEvents'
import { LocaleToggle } from '@/shared/LocaleToggle'
import { OnboardingFlow } from '@/shared/OnboardingFlow'
import { RecordCard } from '@/popup/components/RecordCard'
import { ScoreGauge } from '@/popup/components/ScoreGauge'
import { DEFAULT_PROVIDER_STATE } from '@/shared/defaults'
import {
  API_KEY_RETENTION_OPTIONS,
  CODEX_MODEL_OPTIONS,
  CODEX_REASONING_OPTIONS,
  GEMINI_MODEL_OPTIONS,
  GROQ_MODEL_OPTIONS,
} from '@/shared/providerOptions'
import {
  buildRecordTitle,
  isNeutralAnalysisResult,
  renderAnalysisSummary,
  getDisclaimerText,
  translateRetentionLabel,
  translateReasoningLabel,
} from '@/shared/localization'
import { getCodexUnsupportedMessage, getSupportedProviders } from '@/shared/runtimeCapabilities'
import type { ProviderState, RuntimeCapabilities, ShortcutConfig, StoredAnalysisRecord, ThemeMode } from '@/shared/types'

type DesktopTab = 'analyze' | 'settings' | 'history'
type AnalyzeInputTab = 'text' | 'url' | 'image' | 'clipboard'
type ShortcutActionName = 'openAnalyze' | 'analyzeSelection' | 'analyzeClipboard' | 'captureArea'
const DESKTOP_INITIAL_PROVIDER_STATE: ProviderState = {
  ...DEFAULT_PROVIDER_STATE,
}

const SHORTCUT_ACTION_ORDER: ShortcutActionName[] = ['openAnalyze', 'analyzeSelection', 'analyzeClipboard', 'captureArea']

const SHORTCUT_ACTION_LABELS: Record<ShortcutActionName, Record<'ko' | 'en', string>> = {
  openAnalyze: { ko: '직접 분석 열기', en: 'Open manual analysis' },
  analyzeSelection: { ko: '선택 텍스트 분석', en: 'Analyze selection' },
  analyzeClipboard: { ko: '클립보드 텍스트 분석', en: 'Analyze clipboard' },
  captureArea: { ko: '영역 캡처 분석', en: 'Capture area' },
}

const DEFAULT_SHORTCUT_CONFIG: ShortcutConfig = {
  openAnalyze: 'CommandOrControl+Shift+Y',
  analyzeSelection: 'CommandOrControl+Shift+S',
  analyzeClipboard: 'CommandOrControl+Shift+V',
  captureArea: 'CommandOrControl+Shift+X',
}

const SHORTCUT_TRIGGERED_EVENT = 'kwc:shortcut-triggered'

function shortcutToDisplayString(combo: string, isMac: boolean): string {
  return combo
    .replace(/CommandOrControl/g, isMac ? 'Cmd' : 'Ctrl')
    .replace(/Control/g, 'Ctrl')
    .replace(/Meta/g, isMac ? 'Cmd' : 'Win')
    .replace(/Super/g, isMac ? 'Cmd' : 'Win')
}

function keyboardEventToShortcutString(event: globalThis.KeyboardEvent): string | null {
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) {
    parts.push('CommandOrControl')
  }
  if (event.shiftKey) {
    parts.push('Shift')
  }
  if (event.altKey) {
    parts.push('Alt')
  }

  const code = event.code
  if (code.startsWith('Key')) {
    parts.push(code.slice(3))
  } else if (code.startsWith('Digit')) {
    parts.push(code.slice(5))
  } else if (code.startsWith('F') && /^F\d+$/.test(code)) {
    parts.push(code)
  } else if (code === 'Space') {
    parts.push('Space')
  } else if (code === 'Backspace') {
    parts.push('Backspace')
  } else if (code === 'Enter') {
    parts.push('Enter')
  } else if (code === 'Tab') {
    parts.push('Tab')
  } else {
    return null
  }

  if (parts.length < 2) {
    return null
  }

  return parts.join('+')
}

function fileToDataUrl(file: File, locale: 'ko' | 'en') {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(locale === 'en' ? 'Failed to read the image.' : '이미지를 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

function providerModelOptions(preferredProvider: ProviderState['preferredProvider']) {
  if (preferredProvider === 'gemini') {
    return GEMINI_MODEL_OPTIONS
  }

  if (preferredProvider === 'groq') {
    return GROQ_MODEL_OPTIONS
  }

  return CODEX_MODEL_OPTIONS
}

function toUiErrorMessage(error: unknown, englishMessage: string, koreanMessage: string) {
  return error instanceof Error ? error.message : navigator.language.toLowerCase().startsWith('en') ? englishMessage : koreanMessage
}

function applyTheme(mode: ThemeMode) {
  const resolved = mode === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    : mode
  document.documentElement.dataset.theme = resolved
  try { localStorage.setItem('kwc.theme', mode) } catch { /* noop */ }
}

function normalizeDesktopProviderState(state: ProviderState): ProviderState {
  return state
}

function readSelectedTextFromActiveElement() {
  const activeElement = document.activeElement

  if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
    const start = activeElement.selectionStart ?? 0
    const end = activeElement.selectionEnd ?? 0
    return start === end ? '' : activeElement.value.slice(start, end).trim()
  }

  if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
    return activeElement.ownerDocument.getSelection()?.toString().trim() ?? ''
  }

  return window.getSelection()?.toString().trim() ?? ''
}

export function DesktopApp() {
  const [initialized, setInitialized] = useState(false)
  const [desktopTab, setDesktopTab] = useState<DesktopTab>('analyze')
  const [inputTab, setInputTab] = useState<AnalyzeInputTab>('text')
  const [textValue, setTextValue] = useState('')
  const [urlValue, setUrlValue] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [clipboardPreview, setClipboardPreview] = useState('')
  const [providerState, setProviderState] = useState<ProviderState>(DESKTOP_INITIAL_PROVIDER_STATE)
  const [history, setHistory] = useState<StoredAnalysisRecord[]>([])
  const [latestRecord, setLatestRecord] = useState<StoredAnalysisRecord | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [codexStatus, setCodexStatus] = useState('')
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<RuntimeCapabilities | null>(null)
  const [screenPermissionSupported, setScreenPermissionSupported] = useState(false)
  const [screenPermissionGranted, setScreenPermissionGranted] = useState(false)
  const [geminiApiKeyDraft, setGeminiApiKeyDraft] = useState('')
  const [groqApiKeyDraft, setGroqApiKeyDraft] = useState('')
  const [shortcutConfig, setShortcutConfig] = useState<ShortcutConfig>(DEFAULT_SHORTCUT_CONFIG)
  const [recordingShortcut, setRecordingShortcut] = useState<ShortcutActionName | null>(null)
  const [recordedCombo, setRecordedCombo] = useState('')
  const providerStateRef = useRef(providerState)
  const loadingRef = useRef(loading)
  const textInputRef = useRef<HTMLTextAreaElement | null>(null)
  const urlInputRef = useRef<HTMLInputElement | null>(null)
  const shortcutHandlersRef = useRef<{
    openAnalyze: () => Promise<void>
    analyzeSelection: () => Promise<void>
    analyzeClipboard: () => Promise<void>
    captureArea: () => Promise<void>
  }>({
    openAnalyze: async () => {},
    analyzeSelection: async () => {},
    analyzeClipboard: async () => {},
    captureArea: async () => {},
  })
  const locale = providerState.uiLocale
  const isEnglish = locale === 'en'
  const isMacDesktop = navigator.userAgent.toLowerCase().includes('mac')
  const supportsCodex = runtimeCapabilities?.supportsCodex ?? false
  const effectivePreferredProvider =
    !supportsCodex && providerState.preferredProvider === 'codex' ? 'gemini' : providerState.preferredProvider
  const visibleProviders = useMemo<ProviderState['preferredProvider'][]>(
    () => (runtimeCapabilities ? getSupportedProviders(runtimeCapabilities) : ['gemini', 'groq']),
    [runtimeCapabilities],
  )

  useEffect(() => {
    providerStateRef.current = providerState
  }, [providerState])

  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  useEffect(() => {
    if (inputTab !== 'clipboard') {
      return
    }

    void (async () => {
      try {
        const rawText = (await window.kwcDesktop.system.readClipboardText()).trim()
        setClipboardPreview(rawText)
      } catch (error) {
        const message = toUiErrorMessage(
          error,
          'Failed to read clipboard text.',
          '클립보드 텍스트를 읽지 못했습니다.',
        )
        setErrorMessage(message)
        setStatusMessage(message)
      }
    })()
  }, [inputTab])

  useEffect(() => {
    void (async () => {
      const [bundle, nextProviderState, nextRuntimeCapabilities, nextScreenPermissionStatus] = await Promise.all([
        window.kwcDesktop.history.getBundle(),
        window.kwcDesktop.providerState.get(),
        window.kwcDesktop.system.getRuntimeCapabilities(),
        window.kwcDesktop.system.getScreenCapturePermissionStatus().catch(() => ({
          supported: false,
          granted: true,
          status: 'unsupported',
        })),
      ])
      const nextCodexStatus = nextRuntimeCapabilities.supportsCodex
        ? await window.kwcDesktop.codex.getStatus().catch(() => ({ status: '' }))
        : { status: '' }
      setHistory(bundle.history)
      setLatestRecord(bundle.latestRecord)
      setProviderState(nextProviderState)
      setRuntimeCapabilities(nextRuntimeCapabilities)
      applyTheme(nextProviderState.theme ?? 'system')
      setCodexStatus(nextCodexStatus.status || (nextProviderState.uiLocale === 'en' ? 'Not checked' : '미확인'))
      setScreenPermissionSupported(Boolean(nextScreenPermissionStatus.supported))
      setScreenPermissionGranted(Boolean(nextScreenPermissionStatus.granted))
      setStatusMessage('')
      setInitialized(true)
    })().catch((error) => {
      const message = toUiErrorMessage(error, 'Initialization failed.', '초기화에 실패했습니다.')
      setErrorMessage(message)
      setStatusMessage(message)
      setInitialized(true)
    })
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let active = true

    void getCurrentWindow()
      .listen<DesktopNavigationEventPayload>(MAIN_NAVIGATION_EVENT, ({ payload }) => {
        if (payload.tab) {
          setDesktopTab(payload.tab)
        }

        if (payload.inputTab) {
          setInputTab(payload.inputTab)
          setErrorMessage('')
        }

        if (typeof payload.text === 'string') {
          setTextValue(payload.text)
          if (payload.text) {
            setUrlValue('')
          }
        }

        if (typeof payload.url === 'string') {
          setUrlValue(payload.url)
          if (payload.url) {
            setTextValue('')
          }
        }

        if (payload.text?.trim() || payload.url?.trim()) {
          setStatusMessage(isEnglish ? 'Launcher input is ready.' : '런처 입력을 불러왔습니다.')
        }
      })
      .then((dispose) => {
        if (!active) {
          dispose()
          return
        }
        unlisten = dispose
      })
      .catch(() => {
        // Ignore desktop event listener failures and keep the main UI available.
      })

    return () => {
      active = false
      unlisten?.()
    }
  }, [isEnglish])

  const currentModelOptions = useMemo(
    () => providerModelOptions(effectivePreferredProvider),
    [effectivePreferredProvider],
  )

  const currentModelValue = useMemo(() => {
    if (effectivePreferredProvider === 'gemini') {
      return providerState.gemini.model
    }

    if (effectivePreferredProvider === 'groq') {
      return providerState.groq.model
    }

    return providerState.codex.model
  }, [effectivePreferredProvider, providerState])

  async function persistProviderState(nextState: ProviderState) {
    const savedState = await desktopProviderStateRepository.saveProviderState(normalizeDesktopProviderState(nextState))
    providerStateRef.current = savedState
    setProviderState(savedState)
    return savedState
  }

  async function refreshHistoryState(record?: StoredAnalysisRecord | null) {
    const bundle = await window.kwcDesktop.history.getBundle()
    setHistory(bundle.history)
    setLatestRecord(record ?? bundle.latestRecord)
  }

  async function saveDesktopSettings() {
    try {
      await persistProviderState(providerStateRef.current)
      setStatusMessage(isEnglish ? 'Settings saved.' : '설정을 저장했습니다.')
    } catch (error) {
      setStatusMessage(toUiErrorMessage(error, 'Failed to save settings.', '설정 저장에 실패했습니다.'))
    }
  }

  function updateLocale(nextLocale: 'ko' | 'en') {
    const nextState = { ...providerStateRef.current, uiLocale: nextLocale }
    providerStateRef.current = nextState
    setProviderState(nextState)
  }

  async function completeDesktopOnboarding() {
    try {
      const nextState = await persistProviderState({
        ...providerStateRef.current,
        onboardingCompleted: true,
        onboardingVersion: 2,
      })
      setProviderState(nextState)
      setStatusMessage(nextState.uiLocale === 'en' ? 'Setup completed.' : '초기 설정을 완료했습니다.')
    } catch (error) {
      setStatusMessage(toUiErrorMessage(error, 'Failed to complete setup.', '초기 설정 완료에 실패했습니다.'))
    }
  }

  async function requestScreenCapturePermission() {
    try {
      const status = await window.kwcDesktop.system.requestScreenCapturePermission()
      setScreenPermissionSupported(Boolean(status.supported))
      setScreenPermissionGranted(Boolean(status.granted))
      setStatusMessage(
        status.granted
          ? isEnglish ? 'Screen capture permission granted.' : '화면 캡처 권한이 허용되었습니다.'
          : isEnglish ? 'Screen capture permission was not granted.' : '화면 캡처 권한이 아직 허용되지 않았습니다.',
      )
    } catch (error) {
      setStatusMessage(toUiErrorMessage(error, 'Failed to request screen capture permission.', '화면 캡처 권한 요청에 실패했습니다.'))
    }
  }

  async function runAnalyze() {
    setLoading(true)
    setErrorMessage('')

    try {
      await persistProviderState(providerStateRef.current)

      let record: StoredAnalysisRecord
      if (inputTab === 'text') {
        record = await desktopAnalysisService.analyzeText(textValue)
      } else if (inputTab === 'url') {
        record = await desktopAnalysisService.analyzeUrl(urlValue)
      } else if (inputTab === 'clipboard') {
        const clipboardText = await loadClipboardPreview({ showLoadingState: true })

        if (!clipboardText) {
          throw new Error(isEnglish ? 'There is no text in the clipboard to analyze.' : '클립보드에 분석할 텍스트가 없습니다.')
        }

        setStatusMessage(isEnglish ? 'Analyzing clipboard text.' : '클립보드 텍스트를 분석 중입니다.')
        record = await desktopAnalysisService.analyzeClipboard(clipboardText)
      } else {
        if (!imageFile) {
          throw new Error(isEnglish ? 'Choose an image first.' : '이미지를 선택해 주세요.')
        }

        record = await desktopAnalysisService.analyzeImage(
          await fileToDataUrl(imageFile, locale),
          imageFile.name,
        )
      }

      await refreshHistoryState(record)
      setStatusMessage('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : isEnglish ? 'Analysis failed.' : '분석에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  function focusAnalyzeInput(nextInputTab: AnalyzeInputTab) {
    requestAnimationFrame(() => {
      if (nextInputTab === 'url') {
        urlInputRef.current?.focus()
        return
      }

      if (nextInputTab === 'text') {
        textInputRef.current?.focus()
      }
    })
  }

  async function openAnalyzeShortcut() {
    setDesktopTab('analyze')
    setInputTab('text')
    setErrorMessage('')
    setStatusMessage('')
    focusAnalyzeInput('text')
  }

  async function analyzeSelectionShortcut() {
    const selectedText = readSelectedTextFromActiveElement()

    if (!selectedText) {
      const message = isEnglish ? 'There is no selected text to analyze.' : '분석할 선택 텍스트가 없습니다.'
      setDesktopTab('analyze')
      setInputTab('text')
      setErrorMessage(message)
      setStatusMessage(message)
      focusAnalyzeInput('text')
      return
    }

    setDesktopTab('analyze')
    setInputTab('text')
    setTextValue(selectedText)
    setUrlValue('')
    setLoading(true)
    setErrorMessage('')
    setStatusMessage(isEnglish ? 'Analyzing selected text.' : '선택한 텍스트를 분석 중입니다.')
    focusAnalyzeInput('text')

    try {
      await persistProviderState(providerStateRef.current)
      const record = await desktopAnalysisService.analyzeAndPersist({
        source: 'selection',
        rawText: selectedText,
        selectedText,
        createdAt: new Date().toISOString(),
        metadata: { surface: 'desktop-shortcut', shortcut: 'analyze-selection' },
      })
      await refreshHistoryState(record)
      setStatusMessage('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : isEnglish ? 'Analysis failed.' : '분석에 실패했습니다.')
      setStatusMessage('')
    } finally {
      setLoading(false)
    }
  }

  async function analyzeClipboardShortcut() {
    setDesktopTab('analyze')
    setInputTab('clipboard')
    setLoading(true)
    setErrorMessage('')
    setStatusMessage(isEnglish ? 'Analyzing clipboard text.' : '클립보드 텍스트를 분석 중입니다.')

    try {
      await persistProviderState(providerStateRef.current)
      const clipboardText = await loadClipboardPreview({ showLoadingState: false })

      if (!clipboardText) {
        throw new Error(isEnglish ? 'There is no text in the clipboard to analyze.' : '클립보드에 분석할 텍스트가 없습니다.')
      }

      const record = await desktopAnalysisService.analyzeClipboard(clipboardText, {
        surface: 'desktop-shortcut',
        shortcut: 'analyze-clipboard',
      })
      await refreshHistoryState(record)
      setStatusMessage('')
    } catch (error) {
      const message = error instanceof Error ? error.message : isEnglish ? 'Analysis failed.' : '분석에 실패했습니다.'
      setErrorMessage(message)
      setStatusMessage(message)
    } finally {
      setLoading(false)
    }
  }

  async function captureAreaShortcut() {
    setDesktopTab('analyze')
    setInputTab('image')
    setLoading(true)
    setErrorMessage('')
    setStatusMessage(isEnglish ? 'Drag the screen area to analyze.' : '분석할 화면 영역을 드래그하세요.')

    try {
      await persistProviderState(providerStateRef.current)
      const capture = await window.kwcDesktop.system.captureScreenRegion()
      const record = await desktopAnalysisService.analyzeAndPersist({
        source: 'capture',
        imageDataUrl: capture.imageDataUrl,
        captureRect: capture.rect,
        title: capture.title,
        createdAt: new Date().toISOString(),
        metadata: { surface: 'desktop-shortcut', shortcut: 'capture-area' },
      })
      await refreshHistoryState(record)
      setStatusMessage('')
    } catch (error) {
      const message = error instanceof Error ? error.message : isEnglish ? 'Capture analysis failed.' : '영역 캡처 분석에 실패했습니다.'
      setErrorMessage(message)
      setStatusMessage(message)
    } finally {
      setLoading(false)
    }
  }

  async function loadClipboardPreview(options?: { showLoadingState?: boolean }) {
    const shouldShowLoadingState = options?.showLoadingState ?? true

    try {
      setErrorMessage('')
      if (shouldShowLoadingState) {
        setStatusMessage(isEnglish ? 'Loading clipboard text.' : '클립보드 내용을 불러오는 중입니다.')
      }
      const rawText = (await window.kwcDesktop.system.readClipboardText()).trim()
      setClipboardPreview(rawText)
      if (!rawText) {
        setStatusMessage(isEnglish ? 'Clipboard is empty.' : '클립보드에 텍스트가 없습니다.')
      } else {
        setStatusMessage('')
      }
      return rawText
    } catch (error) {
      const message = toUiErrorMessage(error, 'Failed to read clipboard text.', '클립보드 텍스트를 읽지 못했습니다.')
      setErrorMessage(message)
      setStatusMessage(message)
      return ''
    }
  }


  async function saveProviderSecret(provider: 'gemini' | 'groq') {
    const secret = provider === 'gemini' ? geminiApiKeyDraft : groqApiKeyDraft
    const retention =
      provider === 'gemini'
        ? providerStateRef.current.gemini.apiKeyRetention
        : providerStateRef.current.groq.apiKeyRetention

    if (!secret.trim()) {
      setStatusMessage(
        isEnglish
          ? `Enter the ${provider === 'gemini' ? 'Gemini' : 'Groq'} API key.`
          : `${provider === 'gemini' ? 'Gemini' : 'Groq'} API 키를 입력해 주세요.`,
      )
      return
    }

    try {
      const providerStatus = await window.kwcDesktop.secureStore.setSecret(provider, secret, retention)
      const nextState = {
        ...providerStateRef.current,
        [provider]: {
          ...providerStateRef.current[provider],
          ...providerStatus,
        },
      } satisfies ProviderState
      await persistProviderState(nextState)
      if (provider === 'gemini') {
        setGeminiApiKeyDraft('')
      } else {
        setGroqApiKeyDraft('')
      }
      setStatusMessage(
        isEnglish
          ? `${provider === 'gemini' ? 'Gemini' : 'Groq'} API key saved.`
          : `${provider === 'gemini' ? 'Gemini' : 'Groq'} API 키를 저장했습니다.`,
      )
    } catch (error) {
      setStatusMessage(
        toUiErrorMessage(
          error,
          `Failed to save the ${provider === 'gemini' ? 'Gemini' : 'Groq'} API key.`,
          `${provider === 'gemini' ? 'Gemini' : 'Groq'} API 키 저장에 실패했습니다.`,
        ),
      )
    }
  }

  async function deleteProviderSecret(provider: 'gemini' | 'groq') {
    try {
      const providerStatus = await window.kwcDesktop.secureStore.deleteSecret(provider)
      const nextState = {
        ...providerStateRef.current,
        [provider]: {
          ...providerStateRef.current[provider],
          ...providerStatus,
        },
      } satisfies ProviderState
      await persistProviderState(nextState)
      setStatusMessage(
        isEnglish
          ? `${provider === 'gemini' ? 'Gemini' : 'Groq'} API key removed.`
          : `${provider === 'gemini' ? 'Gemini' : 'Groq'} API 키를 삭제했습니다.`,
      )
    } catch (error) {
      setStatusMessage(
        toUiErrorMessage(
          error,
          `Failed to remove the ${provider === 'gemini' ? 'Gemini' : 'Groq'} API key.`,
          `${provider === 'gemini' ? 'Gemini' : 'Groq'} API 키 삭제에 실패했습니다.`,
        ),
      )
    }
  }

  async function refreshCodexStatus() {
    if (!supportsCodex) {
      setStatusMessage(getCodexUnsupportedMessage(locale))
      return
    }

    try {
      const status = await window.kwcDesktop.codex.getStatus()
      setCodexStatus(status.status || (isEnglish ? 'Not checked' : '미확인'))
      setStatusMessage(isEnglish ? 'Codex status checked.' : 'Codex 상태를 확인했습니다.')
    } catch (error) {
      setStatusMessage(toUiErrorMessage(error, 'Failed to check Codex status.', 'Codex 상태 확인에 실패했습니다.'))
    }
  }

  async function startCodexBridge() {
    if (!supportsCodex) {
      setStatusMessage(getCodexUnsupportedMessage(locale))
      return
    }

    try {
      const status = await window.kwcDesktop.codex.startBridge(true)
      setCodexStatus(status.status || codexStatus || (isEnglish ? 'Not checked' : '미확인'))
      setStatusMessage(status.message || (isEnglish ? 'Codex connection started.' : 'Codex 연결을 시작했습니다.'))
    } catch (error) {
      setStatusMessage(toUiErrorMessage(error, 'Failed to start the Codex connection.', 'Codex 연결 시작에 실패했습니다.'))
    }
  }

  async function startCodexLogin() {
    if (!supportsCodex) {
      setStatusMessage(getCodexUnsupportedMessage(locale))
      return
    }

    try {
      const result = await window.kwcDesktop.codex.startLogin()
      setStatusMessage(
        result.alreadyLoggedIn
          ? isEnglish
            ? 'Codex is already logged in.'
            : 'Codex는 이미 로그인되어 있습니다.'
          : isEnglish
            ? 'Started Codex OAuth login.'
            : 'Codex OAuth 로그인을 시작했습니다.',
      )
      if (result.authUrl) {
        await window.kwcDesktop.system.openExternal(result.authUrl)
      }
    } catch (error) {
      setStatusMessage(toUiErrorMessage(error, 'Failed to start Codex login.', 'Codex 로그인 시작에 실패했습니다.'))
    }
  }

  async function deleteHistoryRecord(id: string) {
    await desktopAnalysisService.deleteHistoryRecord(id)
    await refreshHistoryState()
  }

  async function clearHistory() {
    await desktopAnalysisService.clearHistory()
    await refreshHistoryState(null)
    setStatusMessage(isEnglish ? 'Cleared all analysis history.' : '분석 기록을 모두 삭제했습니다.')
  }

  async function reanalyzeRecord(id: string) {
    const record = await desktopAnalysisService.reanalyzeRecord(id)
    await refreshHistoryState(record)
    setStatusMessage(isEnglish ? 'Selected record reanalyzed.' : '선택한 기록을 다시 분석했습니다.')
  }

  async function changePreferredProvider(nextProvider: ProviderState['preferredProvider']) {
    if (!supportsCodex && nextProvider === 'codex') {
      return
    }

    if (
      !isProviderSelectable(
        providerStateRef.current,
        nextProvider,
        runtimeCapabilities ?? { os: 'unknown', supportsCodex: false },
      )
    ) {
      return
    }

    await persistProviderState({
      ...providerStateRef.current,
      preferredProvider: nextProvider,
      webSearchEnabled:
        providerStateRef.current.webSearchEnabled &&
        isProviderWebSearchCapable(
          {
            ...providerStateRef.current,
            preferredProvider: nextProvider,
          },
          nextProvider,
          runtimeCapabilities ?? { os: 'unknown', supportsCodex: false },
        ),
    })
  }

  async function changePreferredModel(nextModel: string) {
    if (effectivePreferredProvider === 'gemini') {
      await persistProviderState({
        ...providerStateRef.current,
        gemini: {
          ...providerStateRef.current.gemini,
          model: nextModel,
        },
      })
      return
    }

    if (effectivePreferredProvider === 'groq') {
      await persistProviderState({
        ...providerStateRef.current,
        groq: {
          ...providerStateRef.current.groq,
          model: nextModel,
        },
      })
      return
    }

    await persistProviderState({
      ...providerStateRef.current,
      codex: {
        ...providerStateRef.current.codex,
        model: nextModel,
      },
    })
  }

  async function toggleWebSearchEnabled(nextChecked: boolean) {
    const currentState = providerStateRef.current

    const savedState = await persistProviderState({
      ...currentState,
      webSearchEnabled:
        nextChecked &&
        isProviderWebSearchCapable(
          currentState,
          currentState.preferredProvider,
          runtimeCapabilities ?? { os: 'unknown', supportsCodex: false },
        ),
    })

    if (nextChecked && !savedState.webSearchEnabled) {
      setStatusMessage(
        isEnglish
          ? 'Web freshness verification requires the selected provider to support search.'
          : '웹 최신성 검증은 현재 선택한 제공자가 검색을 지원할 때만 사용할 수 있습니다.',
      )
      return
    }

    setStatusMessage('')
  }

  shortcutHandlersRef.current = {
    openAnalyze: openAnalyzeShortcut,
    analyzeSelection: analyzeSelectionShortcut,
    analyzeClipboard: analyzeClipboardShortcut,
    captureArea: captureAreaShortcut,
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let active = true

    void listen<{ action: string }>(SHORTCUT_TRIGGERED_EVENT, ({ payload }) => {
      if (loadingRef.current) {
        return
      }

      const action = payload.action as ShortcutActionName
      const handler = shortcutHandlersRef.current[action]
      if (handler) {
        void handler()
      }
    }).then((dispose) => {
      if (!active) {
        dispose()
        return
      }
      unlisten = dispose
    }).catch(() => {
      // 글로벌 단축키 이벤트를 수신하지 못해도 기본 동작은 유지한다.
    })

    return () => {
      active = false
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    void tauriShortcutApi.getConfig().then(setShortcutConfig).catch(() => {})
  }, [])

  async function saveShortcutConfig(nextConfig: ShortcutConfig) {
    try {
      const saved = await tauriShortcutApi.saveConfig(nextConfig)
      setShortcutConfig(saved)
      setStatusMessage(isEnglish ? 'Shortcut saved.' : '단축키를 저장했습니다.')
    } catch {
      setStatusMessage(isEnglish ? 'Failed to save shortcut.' : '단축키 저장에 실패했습니다.')
    }
  }

  function renderWebSearchToggle(options?: { compact?: boolean }) {
    const compact = options?.compact ?? false

    return (
      <label
        className={`min-w-0 ${compact ? 'text-[11px] font-semibold text-[#55607a]' : 'text-sm font-medium text-[#44506c]'}`}
      >
        <span className="mb-1 block">
          {compact
            ? isEnglish ? 'Web Search' : '웹검색'
            : isEnglish ? 'Web freshness verification' : '웹 검색 기반 최신성 검증'}
        </span>
        <div className="flex h-11 w-full items-center justify-between rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-3">
          <span className="truncate text-sm font-medium text-[#55607a]">
            {providerState.webSearchEnabled
              ? isEnglish ? 'Enabled' : '켜짐'
              : isEnglish ? 'Disabled' : '꺼짐'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={providerState.webSearchEnabled}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              providerState.webSearchEnabled ? 'bg-[#253061]' : 'bg-[#cfd4df]'
            }`}
            onClick={() => void toggleWebSearchEnabled(!providerState.webSearchEnabled)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                providerState.webSearchEnabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </label>
    )
  }

  function renderDesktopTabs(options?: { stretch?: boolean }) {
    const stretch = options?.stretch ?? false
    const desktopTabs = [
      ['analyze', isEnglish ? 'Analyze' : '분석'],
      ['settings', isEnglish ? 'Settings' : '설정'],
      ['history', isEnglish ? 'History' : '기록'],
    ] as const

    return (
      <nav className={`${stretch ? 'grid w-full grid-cols-3' : 'inline-grid grid-cols-3'} gap-1 rounded-[20px] border border-[#d9e0ee] bg-white p-1 shadow-sm`}>
        {desktopTabs.map(([tab, label]) => (
          <button
            key={tab}
            className={`${stretch ? 'w-full' : ''} inline-flex min-h-10 items-center justify-center rounded-2xl px-3 py-2 text-[13px] font-semibold sm:px-4 sm:text-sm ${
              desktopTab === tab ? 'bg-[#253061] text-white' : 'text-[#55607a]'
            }`}
            onClick={() => setDesktopTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>
    )
  }

  function renderDesktopShortcutCards() {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {SHORTCUT_ACTION_ORDER.map((action) => {
          const isRecording = recordingShortcut === action
          const currentCombo = shortcutConfig[action]

          return (
            <div
              key={action}
              className={`rounded-3xl border px-4 py-4 ${isRecording ? 'border-[#6d78d6] bg-[#eef0ff]' : 'border-[#e5e9f2] bg-[#f8fafc]'}`}
            >
              <div className="text-sm font-semibold text-[#253061]">
                {SHORTCUT_ACTION_LABELS[action][locale]}
              </div>
              {isRecording ? (
                <div className="mt-2">
                  <div
                    tabIndex={0}
                    className="flex h-10 items-center rounded-2xl border border-[#6d78d6] bg-white px-3 text-sm font-semibold text-[#253061] outline-none"
                    onKeyDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      if (event.key === 'Escape') {
                        setRecordingShortcut(null)
                        setRecordedCombo('')
                        return
                      }
                      const combo = keyboardEventToShortcutString(event.nativeEvent)
                      if (combo) {
                        setRecordedCombo(combo)
                      }
                    }}
                    ref={(el) => {
                      if (el && isRecording) {
                        el.focus()
                      }
                    }}
                  >
                    {recordedCombo
                      ? shortcutToDisplayString(recordedCombo, isMacDesktop)
                      : isEnglish ? 'Press a key combination...' : '키 조합을 누르세요...'}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-xl bg-[#253061] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={!recordedCombo}
                      onClick={() => {
                        if (recordedCombo) {
                          void saveShortcutConfig({ ...shortcutConfig, [action]: recordedCombo })
                        }
                        setRecordingShortcut(null)
                        setRecordedCombo('')
                      }}
                    >
                      {isEnglish ? 'Save' : '저장'}
                    </button>
                    <button
                      className="rounded-xl border border-[#d9e0ee] bg-white px-3 py-1.5 text-xs font-semibold text-[#44506c]"
                      onClick={() => {
                        setRecordingShortcut(null)
                        setRecordedCombo('')
                      }}
                    >
                      {isEnglish ? 'Cancel' : '취소'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-base font-semibold text-[#44506c]">
                    {shortcutToDisplayString(currentCombo, isMacDesktop)}
                  </div>
                  <button
                    className="shrink-0 rounded-xl border border-[#d9e0ee] bg-white px-3 py-1.5 text-xs font-semibold text-[#44506c]"
                    onClick={() => {
                      setRecordingShortcut(action)
                      setRecordedCombo('')
                    }}
                  >
                    {isEnglish ? 'Change' : '변경'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const canAnalyze =
    inputTab === 'text'
      ? Boolean(textValue.trim())
      : inputTab === 'url'
        ? Boolean(urlValue.trim())
        : inputTab === 'image'
          ? Boolean(imageFile)
        : inputTab === 'clipboard'
            ? Boolean(clipboardPreview.trim())
            : true

  if (!initialized) {
    return <main className="min-h-screen bg-[#eef2f7]" />
  }

  if (!providerState.onboardingCompleted) {
    return (
      <OnboardingFlow
        locale={providerState.uiLocale}
        providerState={providerState}
        runtimeCapabilities={runtimeCapabilities ?? { os: 'unknown', supportsCodex: false }}
        geminiApiKeyDraft={geminiApiKeyDraft}
        groqApiKeyDraft={groqApiKeyDraft}
        statusMessage={statusMessage}
        codexStatus={codexStatus}
        screenPermissionSupported={screenPermissionSupported}
        screenPermissionGranted={screenPermissionGranted}
        onLocaleChange={updateLocale}
        onGeminiApiKeyChange={setGeminiApiKeyDraft}
        onGroqApiKeyChange={setGroqApiKeyDraft}
        onSaveGemini={() => void saveProviderSecret('gemini')}
        onSaveGroq={() => void saveProviderSecret('groq')}
        onRequestScreenPermission={() => void requestScreenCapturePermission()}
        onStartCodexLogin={() => void startCodexLogin()}
        onStartCodexBridge={() => void startCodexBridge()}
        onRefreshCodexStatus={() => void refreshCodexStatus()}
        onComplete={() => void completeDesktopOnboarding()}
      />
    )
  }

  return (
    <main className={`min-h-screen bg-[#eef2f7] px-3 pb-3 text-[#1f2940] sm:px-4 sm:pb-4 lg:px-5 lg:pb-5 ${isMacDesktop ? 'pt-8 sm:pt-9 lg:pt-10' : 'pt-3 sm:pt-4 lg:pt-5'}`}>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 lg:gap-4">
        <ScoreGauge
          score={latestRecord?.result.score ?? 0}
          grade={latestRecord?.result.grade ?? '낮음'}
          primaryType={latestRecord?.result.primaryType ?? '일반 수상 제안'}
          secondaryTypes={latestRecord?.result.secondaryTypes ?? []}
          aiHookingTags={latestRecord?.result.aiHookingChecklist.tags ?? []}
          locale={locale}
        />

        {errorMessage || statusMessage ? (
          <div className="rounded-2xl border border-[#d9e0ee] bg-white px-5 py-4 text-sm text-[#55607a] shadow-sm">
            {errorMessage ? <span className="font-medium text-[#b9382d]">{errorMessage}</span> : statusMessage}
          </div>
        ) : null}

        {desktopTab === 'analyze' ? (
          <div className="space-y-4">
            <section className="grid gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
              <div className="rounded-[28px] border border-[#d9e0ee] bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 pr-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d78d6]">Analyze</div>
                    <h2 className="mt-1 break-keep text-xl font-semibold text-[#1f2940] sm:text-2xl">{isEnglish ? 'Manual Analysis' : '직접 분석'}</h2>
                  </div>
                  <div className="shrink-0">
                    {renderDesktopTabs()}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)_minmax(128px,0.82fr)] gap-2">
                  <label className="min-w-0 text-[11px] font-semibold text-[#55607a]">
                    <span className="mb-1 block">{isEnglish ? 'Provider' : '제공자'}</span>
                    <select
                      value={effectivePreferredProvider}
                      onChange={(event) =>
                        void changePreferredProvider(event.target.value as ProviderState['preferredProvider'])
                      }
                      className="h-11 w-full min-w-0 rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-3 py-2 text-sm"
                    >
                      {visibleProviders.map((provider) => (
                        <option
                          key={provider}
                          value={provider}
                          disabled={!isProviderSelectable(providerState, provider, runtimeCapabilities ?? { os: 'unknown', supportsCodex: false })}
                        >
                          {provider === 'codex' ? 'Codex' : provider === 'gemini' ? 'Gemini' : 'Groq'}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="min-w-0 text-[11px] font-semibold text-[#55607a]">
                    <span className="mb-1 block">{isEnglish ? 'Model' : '모델'}</span>
                    <select
                      value={currentModelValue}
                      onChange={(event) => void changePreferredModel(event.target.value)}
                      className="h-11 w-full min-w-0 rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-3 py-2 text-sm"
                    >
                      {currentModelOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {renderWebSearchToggle({ compact: true })}
                </div>

                <div className="mt-5 grid grid-cols-4 gap-2">
                  {([
                    ['text', isEnglish ? 'Text' : '텍스트', Bot],
                    ['url', 'URL', Link2],
                    ['image', isEnglish ? 'Image' : '이미지', ImagePlus],
                    ['clipboard', isEnglish ? 'Clipboard' : '클립보드', Search],
                  ] as const).map(([tab, label, Icon]) => (
                    <button
                      key={tab}
                      className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[12px] font-semibold sm:gap-2 sm:px-4 sm:text-sm ${
                        inputTab === tab ? 'bg-[#253061] text-white' : 'bg-[#edf1f7] text-[#55607a]'
                      }`}
                      onClick={() => {
                        setInputTab(tab)
                        setErrorMessage('')
                        if (tab === 'clipboard') {
                          void loadClipboardPreview()
                        }
                      }}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>

                <div className="mt-3">
                  <button
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-3xl bg-[#f2a14a] px-5 py-3 text-sm font-semibold text-[#253061] disabled:cursor-not-allowed disabled:bg-[#d9e0ee]"
                    disabled={!canAnalyze || loading}
                    onClick={() => void runAnalyze()}
                  >
                    {loading ? (isEnglish ? 'Analyzing...' : '분석 중...') : isEnglish ? 'Run analysis' : '분석 실행'}
                  </button>
                </div>

                <div className="mt-4 grid gap-4">
                  {inputTab === 'text' ? (
                    <textarea
                      ref={textInputRef}
                      rows={12}
                      value={textValue}
                      onChange={(event) => setTextValue(event.target.value)}
                      placeholder={isEnglish ? 'Paste suspicious copy, a DM, or an ad sentence.' : '수상한 문구, DM, 광고 문장을 붙여넣으세요.'}
                      className="min-h-[14rem] w-full resize-none rounded-3xl border border-[#d9e0ee] bg-[#f7f8fc] px-4 py-4 text-sm leading-6 outline-none focus:border-[#7d87e8] sm:min-h-[18rem] lg:min-h-[20rem]"
                    />
                  ) : null}

                  {inputTab === 'url' ? (
                    <input
                      ref={urlInputRef}
                      value={urlValue}
                      onChange={(event) => setUrlValue(event.target.value)}
                      placeholder={isEnglish ? 'Enter the link to inspect.' : '검사할 링크를 입력하세요.'}
                      className="w-full rounded-3xl border border-[#d9e0ee] bg-[#f7f8fc] px-4 py-4 text-sm outline-none focus:border-[#7d87e8]"
                    />
                  ) : null}

                  {inputTab === 'image' ? (
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-[#cfd4df] bg-[#f7f8fc] px-6 py-14 text-center text-sm text-[#55607a]">
                      <span className="font-semibold text-[#253061]">
                        {imageFile ? imageFile.name : isEnglish ? 'Choose a screenshot or image.' : '스크린샷이나 이미지를 선택하세요.'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                      />
                    </label>
                  ) : null}

                  {inputTab === 'clipboard' ? (
                    <div className="rounded-3xl border border-[#d9e0ee] bg-[#f7f8fc] px-4 py-4">
                      <div className="text-sm font-semibold text-[#253061]">
                        {isEnglish ? 'Clipboard preview' : '클립보드 미리보기'}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap break-words rounded-2xl border border-[#e3e7f1] bg-white px-4 py-4 text-sm leading-6 text-[#44506c]">
                        {clipboardPreview ||
                          (isEnglish
                            ? 'Select this source to load the current clipboard text, then run analysis.'
                            : '이 소스를 선택하면 현재 클립보드 텍스트를 불러옵니다. 그 다음 분석 실행을 누르세요.')}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <aside className="rounded-[28px] border border-[#d9e0ee] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d78d6]">Latest</div>
                    <h2 className="mt-1 text-2xl font-semibold text-[#1f2940]">{isEnglish ? 'Latest Result' : '최근 결과'}</h2>
                  </div>
                  <button
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-3 py-2 text-sm font-medium text-[#44506c]"
                    onClick={() => setDesktopTab('history')}
                  >
                    <History className="h-4 w-4" />
                    {isEnglish ? 'View history' : '전체 기록'}
                  </button>
                </div>
                <div className="mt-4">
                  {latestRecord ? (
                    <RecordCard record={latestRecord} locale={locale} />
                  ) : (
                    <div className="rounded-3xl border border-dashed border-[#d9e0ee] bg-[#f8fafc] px-6 py-12 text-center text-sm text-[#66748b]">
                      {isEnglish ? 'No analysis history yet.' : '아직 분석 기록이 없습니다.'}
                    </div>
                  )}
                </div>
              </aside>
            </section>
            <div className="rounded-2xl border border-[#e5e9f2] bg-[#f8fafc] px-4 py-3 text-xs leading-5 text-[#66748b]">
              {getDisclaimerText(locale)}
            </div>
          </div>
        ) : null}

        {desktopTab === 'settings' ? (
          <div className="space-y-4">
            {renderDesktopTabs({ stretch: true })}
            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-[28px] border border-[#d9e0ee] bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5 text-[#6d78d6]" />
                    <h2 className="text-2xl font-semibold text-[#1f2940]">{isEnglish ? 'Core Settings' : '기본 설정'}</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <LocaleToggle
                      locale={providerState.uiLocale}
                      onChange={(nextLocale) => {
                        const nextState = { ...providerStateRef.current, uiLocale: nextLocale }
                        providerStateRef.current = nextState
                        setProviderState(nextState)
                      }}
                    />
                    <button
                      className="rounded-2xl bg-[#253061] px-4 py-2 text-sm font-semibold text-white"
                      onClick={() => void saveDesktopSettings()}
                    >
                      {isEnglish ? 'Save settings' : '설정 저장'}
                    </button>
                  </div>
                </div>
                <div className="mt-5 grid gap-4">
                  <label className="text-sm font-medium text-[#44506c]">
                    {isEnglish ? 'Preferred provider' : '기본 제공자'}
                    <select
                      value={effectivePreferredProvider}
                      onChange={(event) =>
                        void persistProviderState({
                          ...providerStateRef.current,
                          preferredProvider: event.target.value as ProviderState['preferredProvider'],
                        })
                      }
                      className="mt-2 w-full rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-4 py-3"
                    >
                      {visibleProviders.map((provider) => (
                        <option
                          key={provider}
                          value={provider}
                          disabled={!isProviderSelectable(providerState, provider, runtimeCapabilities ?? { os: 'unknown', supportsCodex: false })}
                        >
                          {provider === 'codex' ? 'Codex' : provider === 'gemini' ? 'Gemini' : 'Groq'}
                        </option>
                      ))}
                    </select>
                  </label>

                  {renderWebSearchToggle()}

                  <div className="text-sm font-medium text-[#44506c]">
                    <div className="mb-2">{isEnglish ? 'Theme' : 'UI 색상'}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {([['light', isEnglish ? 'Light' : '라이트'], ['dark', isEnglish ? 'Dark' : '다크'], ['system', isEnglish ? 'System' : '시스템']] as const).map(([value, label]) => (
                        <button
                          key={value}
                          className={`rounded-2xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                            providerState.theme === value
                              ? 'border-[#253061] bg-[#253061] text-white'
                              : 'border-[#d9e0ee] bg-[#f7f8fc] text-[#44506c]'
                          }`}
                          onClick={() => {
                            const nextState = { ...providerStateRef.current, theme: value as ThemeMode }
                            providerStateRef.current = nextState
                            setProviderState(nextState)
                            applyTheme(value as ThemeMode)
                            void persistProviderState(nextState)
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="text-sm font-medium text-[#44506c]">
                    {isEnglish ? 'Current provider model' : '현재 제공자 모델'}
                    <select
                      value={currentModelValue}
                      onChange={(event) => {
                        const nextValue = event.target.value
                        if (effectivePreferredProvider === 'gemini') {
                          void persistProviderState({
                            ...providerStateRef.current,
                            gemini: {
                              ...providerStateRef.current.gemini,
                              model: nextValue,
                            },
                          })
                          return
                        }

                        if (effectivePreferredProvider === 'groq') {
                          void persistProviderState({
                            ...providerStateRef.current,
                            groq: {
                              ...providerStateRef.current.groq,
                              model: nextValue,
                            },
                          })
                          return
                        }

                        void persistProviderState({
                          ...providerStateRef.current,
                          codex: {
                            ...providerStateRef.current.codex,
                            model: nextValue,
                          },
                        })
                      }}
                      className="mt-2 w-full rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-4 py-3"
                    >
                      {currentModelOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {supportsCodex ? (
                    <>
                      <label className="text-sm font-medium text-[#44506c]">
                        {isEnglish ? 'Codex workspace path' : 'Codex 워크스페이스 경로'}
                        <input
                          value={providerState.codex.workspaceRoot}
                          onChange={(event) => {
                            const nextState = {
                              ...providerStateRef.current,
                              codex: {
                                ...providerStateRef.current.codex,
                                workspaceRoot: event.target.value,
                              },
                            }
                            providerStateRef.current = nextState
                            setProviderState(nextState)
                          }}
                          onBlur={() => void persistProviderState(providerStateRef.current)}
                          className="mt-2 w-full rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-4 py-3"
                        />
                      </label>

                      <label className="text-sm font-medium text-[#44506c]">
                        {isEnglish ? 'Codex reasoning effort' : 'Codex 추론 강도'}
                        <select
                          value={providerState.codex.reasoningEffort}
                          onChange={(event) =>
                            void persistProviderState({
                              ...providerStateRef.current,
                              codex: {
                                ...providerStateRef.current.codex,
                                reasoningEffort: event.target.value as ProviderState['codex']['reasoningEffort'],
                              },
                            })
                          }
                          className="mt-2 w-full rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-4 py-3"
                        >
                          {CODEX_REASONING_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {translateReasoningLabel(option.id, locale)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-6">
                <section className="rounded-[28px] border border-[#d9e0ee] bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold text-[#1f2940]">{isEnglish ? 'API Key Secure Store' : 'API 키 보안 저장소'}</h2>
                    <span className="text-sm text-[#66748b]">{isEnglish ? 'Connected to the OS secure store' : 'OS 보안 저장소와 연동'}</span>
                  </div>
                  <div className="mt-4 grid gap-5">
                    <div className="rounded-3xl border border-[#e5e9f2] bg-[#f8fafc] p-4">
                    <div className="text-sm font-semibold text-[#253061]">Gemini</div>
                    <input
                      type="password"
                      value={geminiApiKeyDraft}
                      onChange={(event) => setGeminiApiKeyDraft(event.target.value)}
                      placeholder={
                        providerState.gemini.hasSecret
                          ? isEnglish
                            ? 'A saved API key already exists.'
                            : '저장된 API 키가 있습니다.'
                          : 'Gemini API 키'
                      }
                      className="mt-3 w-full rounded-2xl border border-[#d9e0ee] bg-white px-4 py-3 text-sm"
                    />
                    <select
                      value={providerState.gemini.apiKeyRetention}
                      onChange={(event) =>
                        void persistProviderState({
                          ...providerStateRef.current,
                          gemini: {
                            ...providerStateRef.current.gemini,
                            apiKeyRetention: event.target.value as ProviderState['gemini']['apiKeyRetention'],
                          },
                        })
                      }
                      className="mt-3 w-full rounded-2xl border border-[#d9e0ee] bg-white px-4 py-3 text-sm"
                    >
                      {API_KEY_RETENTION_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {translateRetentionLabel(option.id, locale)}
                        </option>
                      ))}
                    </select>
                    <div className="mt-3 flex gap-2">
                      <button
                        className="rounded-2xl bg-[#253061] px-4 py-2 text-sm font-semibold text-white"
                        onClick={() => void saveProviderSecret('gemini')}
                      >
                        {isEnglish ? 'Save' : '저장'}
                      </button>
                      <button
                        className="rounded-2xl border border-[#d9e0ee] bg-white px-4 py-2 text-sm font-semibold text-[#44506c]"
                        onClick={() => void deleteProviderSecret('gemini')}
                      >
                        {isEnglish ? 'Delete' : '삭제'}
                      </button>
                    </div>
                  </div>

                    <div className="rounded-3xl border border-[#e5e9f2] bg-[#f8fafc] p-4">
                    <div className="text-sm font-semibold text-[#253061]">Groq</div>
                    <input
                      type="password"
                      value={groqApiKeyDraft}
                      onChange={(event) => setGroqApiKeyDraft(event.target.value)}
                      placeholder={
                        providerState.groq.hasSecret
                          ? isEnglish
                            ? 'A saved API key already exists.'
                            : '저장된 API 키가 있습니다.'
                          : 'Groq API 키'
                      }
                      className="mt-3 w-full rounded-2xl border border-[#d9e0ee] bg-white px-4 py-3 text-sm"
                    />
                    <select
                      value={providerState.groq.apiKeyRetention}
                      onChange={(event) =>
                        void persistProviderState({
                          ...providerStateRef.current,
                          groq: {
                            ...providerStateRef.current.groq,
                            apiKeyRetention: event.target.value as ProviderState['groq']['apiKeyRetention'],
                          },
                        })
                      }
                      className="mt-3 w-full rounded-2xl border border-[#d9e0ee] bg-white px-4 py-3 text-sm"
                    >
                      {API_KEY_RETENTION_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {translateRetentionLabel(option.id, locale)}
                        </option>
                      ))}
                    </select>
                    <div className="mt-3 flex gap-2">
                      <button
                        className="rounded-2xl bg-[#253061] px-4 py-2 text-sm font-semibold text-white"
                        onClick={() => void saveProviderSecret('groq')}
                      >
                        {isEnglish ? 'Save' : '저장'}
                      </button>
                      <button
                        className="rounded-2xl border border-[#d9e0ee] bg-white px-4 py-2 text-sm font-semibold text-[#44506c]"
                        onClick={() => void deleteProviderSecret('groq')}
                      >
                        {isEnglish ? 'Delete' : '삭제'}
                      </button>
                    </div>
                    </div>
                  </div>
                </section>

                {supportsCodex ? (
                  <section className="rounded-[28px] border border-[#d9e0ee] bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold text-[#1f2940]">{isEnglish ? 'Codex Connection' : 'Codex 연결'}</h2>
                        <div className="mt-1 text-sm text-[#66748b]">
                          {isEnglish ? 'Current status' : '현재 상태'}: {codexStatus}
                        </div>
                      </div>
                      <button
                        className="inline-flex items-center gap-2 rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-4 py-2 text-sm font-medium text-[#44506c]"
                        onClick={() => void refreshCodexStatus()}
                      >
                        <Search className="h-4 w-4" />
                        {isEnglish ? 'Check status' : '상태 확인'}
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        className="rounded-2xl bg-[#253061] px-4 py-2 text-sm font-semibold text-white"
                        onClick={() => void startCodexBridge()}
                      >
                        {isEnglish ? 'Start connection' : '연결 시작'}
                      </button>
                      <button
                        className="inline-flex items-center gap-2 rounded-2xl border border-[#d9e0ee] bg-white px-4 py-2 text-sm font-semibold text-[#44506c]"
                        onClick={() => void startCodexLogin()}
                      >
                        <ExternalLink className="h-4 w-4" />
                        {isEnglish ? 'OAuth login' : 'OAuth 로그인'}
                      </button>
                    </div>
                  </section>
                ) : null}

                <section className="rounded-[28px] border border-[#d9e0ee] bg-white p-5 shadow-sm">
                  <div>
                    <h2 className="text-xl font-semibold text-[#1f2940]">{isEnglish ? 'Global Shortcuts' : '글로벌 단축키'}</h2>
                    <p className="mt-1 text-sm text-[#66748b]">
                      {isEnglish
                        ? 'Shortcuts work from any application. Click "Change" to set a new key combination.'
                        : '어떤 앱에서든 단축키가 작동합니다. "변경"을 눌러 새 키 조합을 설정하세요.'}
                    </p>
                  </div>
                  <div className="mt-4">
                    {renderDesktopShortcutCards()}
                  </div>
                </section>
              </div>
            </section>
          </div>
        ) : null}

        {desktopTab === 'history' ? (
          <div className="space-y-4">
            {renderDesktopTabs({ stretch: true })}
            <section className="rounded-[28px] border border-[#d9e0ee] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d78d6]">History</div>
                  <h2 className="mt-1 text-2xl font-semibold text-[#1f2940]">
                    {isEnglish ? `Analysis History ${history.length}` : `분석 기록 ${history.length}건`}
                  </h2>
                </div>
                <button
                  className="rounded-2xl border border-[#d9e0ee] bg-white px-4 py-2 text-sm font-semibold text-[#44506c]"
                  onClick={() => void clearHistory()}
                >
                  {isEnglish ? 'Clear all' : '전체 삭제'}
                </button>
              </div>

              <div className="mt-5 grid gap-5">
                {history.map((record) => {
                  const neutralResult = isNeutralAnalysisResult(record.result)
                  const summary = renderAnalysisSummary(record.result, locale)

                  return (
                    <details key={record.id} className="rounded-3xl border border-[#e5e9f2] bg-[#f8fafc] p-4">
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="break-words text-base font-semibold text-[#1f2940]">
                              {buildRecordTitle(
                                record.result.primaryType,
                                record.input.rawText || record.ocrText,
                                locale,
                                neutralResult,
                              )}
                            </div>
                            {summary ? (
                              <div className="mt-1 break-words text-sm leading-6 text-[#55607a]">
                                ({summary})
                              </div>
                            ) : null}
                          </div>
                          <div className="shrink-0 rounded-full bg-[#eef0ff] px-3 py-1 text-xs font-semibold text-[#5f68c7]">
                            {record.result.score}
                          </div>
                        </div>
                      </summary>
                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        <button
                          className="rounded-2xl border border-[#d9e0ee] bg-white px-3 py-2 text-sm font-semibold text-[#44506c]"
                          onClick={() => void reanalyzeRecord(record.id)}
                        >
                          {isEnglish ? 'Reanalyze' : '다시 분석'}
                        </button>
                        <button
                          className="rounded-2xl border border-[#e6c1bc] bg-white px-3 py-2 text-sm font-semibold text-[#b9382d]"
                          onClick={() => void deleteHistoryRecord(record.id)}
                        >
                          {isEnglish ? 'Delete' : '삭제'}
                        </button>
                      </div>
                      <div className="mt-4">
                        <RecordCard record={record} locale={locale} />
                      </div>
                    </details>
                  )
                })}

                {history.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-[#d9e0ee] bg-[#f8fafc] px-6 py-14 text-center text-sm text-[#66748b]">
                    {isEnglish ? 'No saved records yet.' : '저장된 기록이 없습니다.'}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  )
}
