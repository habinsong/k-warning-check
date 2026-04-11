import { useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, Save } from 'lucide-react'
import { isProviderSelectable } from '@/core/providerStateModel'
import { RecordCard } from '@/popup/components/RecordCard'
import {
  buildRecordTitle,
  formatDateTime,
  getPrivacyWarningText,
  isNeutralAnalysisResult,
  renderAnalysisSummary,
  translateGroqToolLabel,
  translateModelDescription,
  translateReasoningLabel,
  translateRetentionLabel,
} from '@/shared/localization'
import {
  API_KEY_RETENTION_OPTIONS,
  CODEX_MODEL_OPTIONS,
  CODEX_REASONING_OPTIONS,
  GEMINI_MODEL_OPTIONS,
  GROQ_MODEL_OPTIONS,
  GROQ_TOOL_OPTIONS,
} from '@/shared/providerOptions'
import { LocaleToggle } from '@/shared/LocaleToggle'
import { OnboardingFlow } from '@/shared/OnboardingFlow'
import {
  getCodexUnsupportedMessage,
  getSupportedProviders,
} from '@/shared/runtimeCapabilities'
import { sendRuntimeMessage } from '@/shared/runtime'
import type {
  GroqToolId,
  ProviderState,
  RuntimeCapabilities,
  StoredAnalysisRecord,
  ThemeMode,
  UiLocale,
} from '@/shared/types'

function applyTheme(mode: ThemeMode) {
  const isDark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme:dark)').matches)
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  try {
    localStorage.setItem('kwc-theme', mode)
  } catch {
    return
  }
}

type SettingsTab = 'general' | 'api' | 'codex' | 'history'

interface CodexStatus {
  status?: string
  message?: string
  command?: string
}

interface ShortcutInfo {
  name: string
  shortcut: string
  description: string
}

const SHORTCUT_LABELS: Record<string, Record<UiLocale, string>> = {
  _execute_action: { ko: '확장 프로그램 활성화', en: 'Open extension' },
  'analyze-selection': { ko: '선택 분석', en: 'Analyze selection' },
  'analyze-clipboard': { ko: '클립보드 분석', en: 'Analyze clipboard' },
  'capture-area': { ko: '영역 캡처', en: 'Capture area' },
}

const SHORTCUT_ORDER = ['_execute_action', 'analyze-selection', 'analyze-clipboard', 'capture-area']

function formatShortcut(shortcut: string | undefined, locale: UiLocale) {
  if (!shortcut) {
    return locale === 'en' ? 'Unassigned' : '미설정'
  }

  return shortcut.replace(/Command/g, 'Cmd').replace(/MacCtrl/g, 'Ctrl')
}

function toUiErrorMessage(error: unknown, locale: UiLocale, englishMessage: string, koreanMessage: string) {
  return error instanceof Error ? error.message : locale === 'en' ? englishMessage : koreanMessage
}

function useProviderForm() {
  const [state, setState] = useState<ProviderState | null>(null)

  function update<K extends keyof ProviderState>(key: K, value: ProviderState[K]) {
    setState((current) => (current ? { ...current, [key]: value } : current))
  }

  return { state, setState, update }
}

export function OptionsApp() {
  const HISTORY_PAGE_SIZE = 10
  const { state, setState, update } = useProviderForm()
  const [geminiApiKeyDraft, setGeminiApiKeyDraft] = useState('')
  const [groqApiKeyDraft, setGroqApiKeyDraft] = useState('')
  const [history, setHistory] = useState<StoredAnalysisRecord[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null)
  const [codexLoginOutput, setCodexLoginOutput] = useState('')
  const [codexAuthUrl, setCodexAuthUrl] = useState('')
  const [groqModels, setGroqModels] = useState<string[]>([])
  const [groqModelStatus, setGroqModelStatus] = useState('')
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('general')
  const [historyPage, setHistoryPage] = useState(1)
  const [shortcuts, setShortcuts] = useState<ShortcutInfo[]>([])
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<RuntimeCapabilities | null>(null)
  const stateRef = useRef<ProviderState | null>(null)
  const stateWriteVersionRef = useRef(0)

  const locale = state?.uiLocale ?? 'ko'
  const isEnglish = locale === 'en'
  const supportsCodex = runtimeCapabilities?.supportsCodex ?? false
  const visibleProviders = useMemo<ProviderState['preferredProvider'][]>(
    () => (runtimeCapabilities ? getSupportedProviders(runtimeCapabilities) : ['gemini', 'groq']),
    [runtimeCapabilities],
  )
  const effectivePreferredProvider =
    !supportsCodex && state?.preferredProvider === 'codex' ? 'gemini' : state?.preferredProvider ?? 'gemini'
  const supportedSettingsTabs = useMemo<SettingsTab[]>(
    () => (supportsCodex ? ['general', 'api', 'codex', 'history'] : ['general', 'api', 'history']),
    [supportsCodex],
  )
  const savedLabel = isEnglish ? 'Saved' : '저장됨'
  const unsavedLabel = isEnglish ? 'Not saved' : '미저장'
  const unavailableLabel = isEnglish ? 'Unavailable' : '사용 불가'
  const osStoreUnavailableLabel = isEnglish ? 'OS secure store unavailable' : 'OS 보안 저장소 사용 불가'
  const notCheckedLabel = isEnglish ? 'Not checked' : '미확인'

  useEffect(() => {
    stateRef.current = state
  }, [state])

  function setLocalProviderState(nextState: ProviderState) {
    stateRef.current = nextState
    setState(nextState)
  }

  async function persistProviderState(nextState: ProviderState) {
    const requestVersion = ++stateWriteVersionRef.current
    const savedState = await sendRuntimeMessage<ProviderState>({
      type: 'save-provider-state',
      state: nextState,
    })

    if (requestVersion !== stateWriteVersionRef.current) {
      return stateRef.current ?? savedState
    }

    setLocalProviderState(savedState)
    return savedState
  }

  useEffect(() => {
    void (async () => {
      const [providerState, records, loadedRuntimeCapabilities] = await Promise.all([
        sendRuntimeMessage<ProviderState>({ type: 'get-provider-state' }),
        sendRuntimeMessage<StoredAnalysisRecord[]>({ type: 'get-history' }),
        sendRuntimeMessage<RuntimeCapabilities>({ type: 'get-runtime-capabilities' }),
      ])
      setState(providerState)
      setRuntimeCapabilities(loadedRuntimeCapabilities)
      applyTheme(providerState.theme ?? 'system')
      setHistory(records)
      setStatusMessage(providerState.onboardingCompleted ? (providerState.uiLocale === 'en' ? 'Settings loaded.' : '설정을 불러왔습니다.') : '')
      setGeminiApiKeyDraft('')
      setGroqApiKeyDraft('')
    })().catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : '설정을 불러오지 못했습니다.')
    })
  }, [setState])

  useEffect(() => {
    async function loadShortcuts() {
      const commandList = await chrome.commands.getAll()
      const nextShortcuts = commandList
        .filter((command) => command.name && SHORTCUT_LABELS[command.name])
        .map((command) => ({
          name: command.name!,
          shortcut: formatShortcut(command.shortcut, locale),
          description: SHORTCUT_LABELS[command.name!][locale],
        }))
        .sort((left, right) => SHORTCUT_ORDER.indexOf(left.name) - SHORTCUT_ORDER.indexOf(right.name))

      setShortcuts(nextShortcuts)
    }

    void loadShortcuts()
    window.addEventListener('focus', loadShortcuts)

    return () => window.removeEventListener('focus', loadShortcuts)
  }, [locale])

  const selectedGeminiOption = useMemo(
    () => GEMINI_MODEL_OPTIONS.find((option) => option.id === state?.gemini.model),
    [state?.gemini.model],
  )
  const selectedCodexModelOption = useMemo(
    () => CODEX_MODEL_OPTIONS.find((option) => option.id === state?.codex.model),
    [state?.codex.model],
  )
  const selectedCodexReasoningOption = useMemo(
    () => CODEX_REASONING_OPTIONS.find((option) => option.id === state?.codex.reasoningEffort),
    [state?.codex.reasoningEffort],
  )
  const groqModelOptions = useMemo(
    () => [...new Set([...GROQ_MODEL_OPTIONS.map((option) => option.id), ...groqModels])],
    [groqModels],
  )
  const totalHistoryPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE))
  const pagedHistory = useMemo(
    () => history.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE),
    [history, historyPage],
  )

  useEffect(() => {
    setHistoryPage((current) => Math.min(current, totalHistoryPages))
  }, [totalHistoryPages])

  useEffect(() => {
    if (!supportsCodex && activeSettingsTab === 'codex') {
      setActiveSettingsTab('general')
    }
  }, [activeSettingsTab, supportsCodex])

  async function saveSettings() {
    const currentState = stateRef.current
    if (!currentState) {
      return
    }

    setSaving(true)
    try {
      await persistProviderState(currentState)
      setStatusMessage(locale === 'en' ? 'Settings saved.' : '설정을 저장했습니다.')
    } catch (error) {
      setStatusMessage(toUiErrorMessage(error, locale, 'Failed to save settings.', '설정 저장에 실패했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  function updateLocale(nextLocale: UiLocale) {
    const currentState = stateRef.current
    if (!currentState || currentState.uiLocale === nextLocale) {
      return
    }

    const previousState = currentState
    const optimisticState: ProviderState = {
      ...currentState,
      uiLocale: nextLocale,
    }

    setLocalProviderState(optimisticState)

    void (async () => {
      try {
        await persistProviderState(optimisticState)
        setStatusMessage(nextLocale === 'en' ? 'Language updated.' : '언어 설정을 저장했습니다.')
      } catch (error) {
        setLocalProviderState(previousState)
        setStatusMessage(
          toUiErrorMessage(error, nextLocale, 'Failed to save language setting.', '언어 설정 저장에 실패했습니다.'),
        )
      }
    })()
  }

  async function completeOnboarding() {
    const currentState = stateRef.current
    if (!currentState) {
      return
    }

    try {
      const nextState = await persistProviderState({
        ...currentState,
        onboardingCompleted: true,
        onboardingVersion: 2,
      })
      setStatusMessage(nextState.uiLocale === 'en' ? 'Setup completed.' : '초기 설정을 완료했습니다.')
    } catch (error) {
      setStatusMessage(toUiErrorMessage(error, locale, 'Failed to complete setup.', '초기 설정 완료에 실패했습니다.'))
    }
  }

  async function checkCodexStatus() {
    if (!supportsCodex) {
      setStatusMessage(getCodexUnsupportedMessage(locale))
      return
    }

    setStatusMessage(locale === 'en' ? 'Checking Codex connection and login status.' : 'Codex 연결과 로그인 상태를 확인하는 중입니다.')

    try {
      const result = await sendRuntimeMessage<CodexStatus>({ type: 'get-codex-status' })
      setCodexStatus({
        ...result,
        status: result.status === '미확인' ? notCheckedLabel : result.status,
      })
      setStatusMessage(locale === 'en' ? 'Codex status checked.' : 'Codex 연결 상태를 확인했습니다.')
    } catch (error) {
      setCodexStatus(null)
      setStatusMessage(error instanceof Error ? error.message : locale === 'en' ? 'Failed to check Codex status.' : 'Codex 상태 확인에 실패했습니다.')
    }
  }

  async function startCodexLogin() {
    if (!supportsCodex) {
      setStatusMessage(getCodexUnsupportedMessage(locale))
      return
    }

    setStatusMessage(locale === 'en' ? 'Starting Codex login.' : 'Codex 로그인을 시작하는 중입니다.')

    try {
      const result = await sendRuntimeMessage<{
        output?: string
        authUrl?: string
        message?: string
        alreadyLoggedIn?: boolean
        logPath?: string
      }>({ type: 'start-codex-login' })

      setCodexLoginOutput(
        [
          result.alreadyLoggedIn
            ? locale === 'en'
              ? 'Codex is already logged in.'
              : 'Codex는 이미 로그인되어 있습니다.'
            : locale === 'en'
              ? 'Started Codex OAuth login.'
              : 'Codex OAuth 로그인을 시작했습니다.',
          result.logPath ? `${locale === 'en' ? 'Log' : '로그'}: ${result.logPath}` : '',
          result.output,
        ]
          .filter(Boolean)
          .join('\n'),
      )
      setCodexAuthUrl(result.authUrl ?? '')
      setStatusMessage(
        result.alreadyLoggedIn
          ? locale === 'en'
            ? 'Codex is already logged in.'
            : 'Codex는 이미 로그인되어 있습니다.'
          : locale === 'en'
            ? 'Started Codex OAuth login.'
            : 'Codex OAuth 로그인을 시작했습니다.',
      )

      if (result.authUrl?.startsWith('https://auth.openai.com/')) {
        await chrome.tabs.create({ url: result.authUrl })
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : locale === 'en' ? 'Failed to start Codex login.' : 'Codex 로그인 시작에 실패했습니다.')
    }
  }

  async function startCodexBridge() {
    if (!supportsCodex) {
      setStatusMessage(getCodexUnsupportedMessage(locale))
      return
    }

    setStatusMessage(locale === 'en' ? 'Starting Codex connection.' : 'Codex 연결을 시작하는 중입니다.')

    try {
      const result = await sendRuntimeMessage<{
        message?: string
        bridgeRunning?: boolean
      }>({ type: 'start-codex-bridge' })

      setStatusMessage(
        result.bridgeRunning
          ? locale === 'en'
            ? 'Codex connection started.'
            : 'Codex 연결을 시작했습니다.'
          : locale === 'en'
            ? 'Codex connection start requested.'
            : 'Codex 연결 시작 요청을 보냈습니다.',
      )
      await checkCodexStatus()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : locale === 'en' ? 'Failed to start Codex connection.' : 'Codex 연결 시작에 실패했습니다.')
    }
  }

  async function loadGroqModels() {
    setGroqModelStatus(locale === 'en' ? 'Loading Groq models.' : 'Groq 모델 목록을 불러오는 중입니다.')

    try {
      const models = await sendRuntimeMessage<string[]>({ type: 'load-groq-models' })
      setGroqModels(models)
      setGroqModelStatus(locale === 'en' ? `Loaded ${models.length} models.` : `${models.length}개 모델을 불러왔습니다.`)
    } catch (error) {
      setGroqModelStatus(error instanceof Error ? error.message : locale === 'en' ? 'Failed to load Groq models.' : 'Groq 모델 목록을 불러오지 못했습니다.')
    }
  }

  async function saveProviderSecret(provider: 'gemini' | 'groq') {
    const currentState = stateRef.current
    if (!currentState) {
      return
    }

    const secret = provider === 'gemini' ? geminiApiKeyDraft : groqApiKeyDraft
    const retention = provider === 'gemini' ? currentState.gemini.apiKeyRetention : currentState.groq.apiKeyRetention

    if (!secret.trim()) {
      setStatusMessage(
        locale === 'en'
          ? `Enter the ${provider === 'gemini' ? 'Gemini' : 'Groq'} API key.`
          : `${provider === 'gemini' ? 'Gemini' : 'Groq'} API 키를 입력해 주세요.`,
      )
      return
    }

    try {
      await persistProviderState(currentState)

      const nextState = await sendRuntimeMessage<ProviderState>({
        type: 'save-provider-secret',
        provider,
        secret,
        retention,
      })

      setLocalProviderState(nextState)
      if (provider === 'gemini') {
        setGeminiApiKeyDraft('')
      } else {
        setGroqApiKeyDraft('')
      }
      setStatusMessage(
        locale === 'en'
          ? `${provider === 'gemini' ? 'Gemini' : 'Groq'} API key saved to the OS secure store.`
          : `${provider === 'gemini' ? 'Gemini' : 'Groq'} API 키를 OS 보안 저장소에 저장했습니다.`,
      )
    } catch (error) {
      setStatusMessage(
        toUiErrorMessage(
          error,
          locale,
          `Failed to save the ${provider === 'gemini' ? 'Gemini' : 'Groq'} API key.`,
          `${provider === 'gemini' ? 'Gemini' : 'Groq'} API 키 저장에 실패했습니다.`,
        ),
      )
    }
  }

  async function removeProviderSecret(provider: 'gemini' | 'groq') {
    const nextState = await sendRuntimeMessage<ProviderState>({
      type: 'delete-provider-secret',
      provider,
    })

    setLocalProviderState(nextState)
    if (provider === 'gemini') {
      setGeminiApiKeyDraft('')
    } else {
      setGroqApiKeyDraft('')
    }
    setStatusMessage(
      locale === 'en'
        ? `${provider === 'gemini' ? 'Gemini' : 'Groq'} API key removed.`
        : `${provider === 'gemini' ? 'Gemini' : 'Groq'} API 키를 삭제했습니다.`,
    )
  }

  async function deleteHistoryRecord(id: string) {
    const nextHistory = await sendRuntimeMessage<StoredAnalysisRecord[]>({
      type: 'delete-history-record',
      id,
    })
    setHistory(nextHistory)
  }

  async function clearAllHistory() {
    await sendRuntimeMessage<StoredAnalysisRecord[]>({ type: 'clear-history' })
    setHistory([])
  }

  async function reanalyzeRecord(id: string) {
    const record = await sendRuntimeMessage<StoredAnalysisRecord>({
      type: 'reanalyze-record',
      id,
    })
    setHistory((current) => [record, ...current.filter((item) => item.id !== record.id)])
    setStatusMessage(locale === 'en' ? 'Record reanalyzed.' : '기록을 다시 분석했습니다.')
  }

  async function openShortcutSettings() {
    try {
      await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
      setStatusMessage(locale === 'en' ? 'Opened the Chrome shortcuts page.' : 'Chrome 단축키 설정 페이지를 열었습니다.')
    } catch {
      setStatusMessage(
        locale === 'en'
          ? 'Could not open the Chrome shortcuts page. Open chrome://extensions/shortcuts manually.'
          : 'Chrome 단축키 설정 페이지를 열지 못했습니다. chrome://extensions/shortcuts 에서 직접 변경해 주세요.',
      )
    }
  }

  if (!state || !runtimeCapabilities) {
    return <main className="p-6 text-sm text-slate-500">{isEnglish ? 'Loading settings.' : '설정을 불러오는 중입니다.'}</main>
  }

  if (!state.onboardingCompleted) {
    return (
      <OnboardingFlow
        locale={state.uiLocale}
        providerState={state}
        runtimeCapabilities={runtimeCapabilities}
        geminiApiKeyDraft={geminiApiKeyDraft}
        groqApiKeyDraft={groqApiKeyDraft}
        statusMessage={statusMessage}
        codexStatus={codexStatus?.status}
        onLocaleChange={updateLocale}
        onGeminiApiKeyChange={setGeminiApiKeyDraft}
        onGroqApiKeyChange={setGroqApiKeyDraft}
        onSaveGemini={() => void saveProviderSecret('gemini')}
        onSaveGroq={() => void saveProviderSecret('groq')}
        onStartCodexLogin={() => void startCodexLogin()}
        onStartCodexBridge={() => void startCodexBridge()}
        onRefreshCodexStatus={() => void checkCodexStatus()}
        onComplete={() => void completeOnboarding()}
      />
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-6 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">
              K-WarningCheck
            </div>
            <h1 className="mt-1 text-3xl font-semibold">{isEnglish ? 'Settings and History' : '설정 및 기록 관리'}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {isEnglish
                ? supportsCodex
                  ? 'Manage Gemini and Groq keys, model choices, Codex connection, and saved analysis history.'
                  : 'Manage Gemini and Groq keys, model choices, and saved analysis history.'
                : supportsCodex
                  ? 'Gemini·Groq API 키와 모델, Codex 연결, 상세 이력을 관리합니다.'
                  : 'Gemini·Groq API 키와 모델, 상세 이력을 관리합니다.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LocaleToggle locale={state.uiLocale} onChange={updateLocale} />
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium leading-5 text-white"
              onClick={() => void saveSettings()}
            >
              <Save aria-hidden="true" className="h-4 w-4" />
              <span>{saving ? (isEnglish ? 'Saving...' : '저장 중...') : isEnglish ? 'Save settings' : '설정 저장'}</span>
            </button>
          </div>
        </header>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {getPrivacyWarningText(locale)}
        </div>

        <nav className={`grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm ${supportsCodex ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          {supportedSettingsTabs.map((tab) => (
            <button
              key={tab}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                activeSettingsTab === tab
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-50 text-slate-600'
              }`}
              onClick={() => setActiveSettingsTab(tab as SettingsTab)}
            >
              {tab === 'general'
                ? isEnglish
                  ? 'General'
                  : '기본'
                : tab === 'api'
                  ? isEnglish
                  ? 'Providers'
                  : 'API 제공자'
                  : tab === 'codex'
                    ? 'Codex'
                    : isEnglish
                      ? 'History'
                      : '분석 기록'}
            </button>
          ))}
        </nav>

        {activeSettingsTab === 'general' ? (
          <section className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">{isEnglish ? 'UI Color' : 'UI 색상'}</h2>
              <div className="mt-3 flex gap-2">
                {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`rounded-md px-4 py-2 text-sm font-medium ${
                      (state?.theme ?? 'system') === mode
                        ? 'bg-[#2c3470] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                    onClick={() => {
                      update('theme', mode)
                      applyTheme(mode)
                    }}
                  >
                    {mode === 'light' ? (isEnglish ? 'Light' : '라이트') : mode === 'dark' ? (isEnglish ? 'Dark' : '다크') : (isEnglish ? 'System' : '시스템')}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid items-stretch gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">{isEnglish ? 'Remote Assist Settings' : '원격 보조 동작'}</h2>
              <div className="mt-4">
                <label className="block rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="font-medium">{isEnglish ? 'Preferred provider' : '기본 제공자'}</div>
                  <select
                    value={effectivePreferredProvider}
                    onChange={(event) =>
                      update('preferredProvider', event.target.value as ProviderState['preferredProvider'])
                    }
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    {visibleProviders.map((provider) => (
                      <option
                        key={provider}
                        value={provider}
                        disabled={!isProviderSelectable(state, provider, runtimeCapabilities)}
                      >
                        {provider === 'codex' ? 'Codex' : provider === 'gemini' ? 'Gemini' : 'Groq'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">{isEnglish ? 'Current Status' : '현재 상태'}</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{isEnglish ? 'Preferred provider' : '기본 제공자'}</dt>
                  <dd className="font-medium text-slate-900">{effectivePreferredProvider}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{isEnglish ? 'Gemini model' : 'Gemini 모델'}</dt>
                  <dd className="font-medium text-slate-900">{state.gemini.model}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{isEnglish ? 'Gemini secure store' : 'Gemini 보안 저장소'}</dt>
                  <dd className="font-medium text-slate-900">
                    {state.gemini.storageBackend
                      ? `${state.gemini.storageBackend} · ${state.gemini.hasSecret ? savedLabel : unsavedLabel}`
                      : unavailableLabel}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{isEnglish ? 'Groq model' : 'Groq 모델'}</dt>
                  <dd className="font-medium text-slate-900">{state.groq.model}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{isEnglish ? 'Groq secure store' : 'Groq 보안 저장소'}</dt>
                  <dd className="font-medium text-slate-900">
                    {state.groq.storageBackend
                      ? `${state.groq.storageBackend} · ${state.groq.hasSecret ? savedLabel : unsavedLabel}`
                      : unavailableLabel}
                  </dd>
                </div>
                {supportsCodex ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">{isEnglish ? 'Codex model' : 'Codex 모델'}</dt>
                      <dd className="font-medium text-slate-900">{state.codex.model}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">{isEnglish ? 'Codex reasoning' : 'Codex 추론'}</dt>
                      <dd className="font-medium text-slate-900">{state.codex.reasoningEffort}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">{isEnglish ? 'Codex connection' : 'Codex 연결'}</dt>
                      <dd className="font-medium text-slate-900">{codexStatus?.status ?? notCheckedLabel}</dd>
                    </div>
                  </>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{isEnglish ? 'Saved records' : '저장 기록 수'}</dt>
                  <dd className="font-medium text-slate-900">{isEnglish ? `${history.length} records` : `${history.length}건`}</dd>
                </div>
              </dl>
              <div className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {statusMessage}
              </div>
              <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                {isEnglish ? 'Reference notes:' : '공식 기준 참고:'}
                <br />
                {isEnglish ? 'Uses Gemini 3 naming based on Google AI docs' : 'Google AI Gemini 3 문서 기준 모델명 사용'}
                {supportsCodex ? (
                  <>
                    <br />
                    {isEnglish ? 'OpenAI-side assistance uses the local OAuth session from `codex login`' : 'OpenAI 계열 보조는 `codex login` 기준 로컬 OAuth 세션 사용'}
                  </>
                ) : null}
              </div>
            </aside>
            </div>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{isEnglish ? 'Shortcuts' : '단축키'}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {isEnglish
                      ? 'Review the current shortcuts and change them from the Chrome shortcuts page.'
                      : '현재 등록된 단축키를 확인하고 Chrome 설정 화면에서 변경할 수 있습니다.'}
                  </p>
                </div>
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                  onClick={() => void openShortcutSettings()}
                >
                  <Keyboard aria-hidden="true" className="h-4 w-4" />
                  <span>{isEnglish ? 'Open shortcuts' : '단축키 변경'}</span>
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.name}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="text-sm font-medium text-slate-900">{shortcut.description}</div>
                    <div className="mt-2 text-base font-semibold text-slate-700">{shortcut.shortcut}</div>
                  </div>
                ))}
              </div>
            </section>
          </section>
        ) : null}

        {activeSettingsTab === 'api' ? (
          <section className="grid items-stretch gap-4 xl:grid-cols-2">
            <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{isEnglish ? 'Gemini Settings' : 'Gemini 설정'}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {isEnglish
                      ? 'Gemini 3-series choices based on Google AI documentation as of April 8, 2026.'
                      : '2026년 4월 8일 기준 Google AI 문서의 Gemini 3 계열 모델 선택지입니다.'}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-sm text-slate-600">
                    {state.gemini.storageBackend
                      ? `${state.gemini.storageBackend} · ${state.gemini.hasSecret ? savedLabel : unsavedLabel}`
                      : osStoreUnavailableLabel}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                      onClick={() => void saveProviderSecret('gemini')}
                    >
                      {isEnglish ? 'Save key' : '키 저장'}
                    </button>
                    <button
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                      onClick={() => void removeProviderSecret('gemini')}
                    >
                      {isEnglish ? 'Delete key' : '키 삭제'}
                    </button>
                  </div>
                </div>
                <input
                  type="password"
                  value={geminiApiKeyDraft}
                  autoComplete="off"
                  spellCheck={false}
                  onCopy={(event) => event.preventDefault()}
                  onCut={(event) => event.preventDefault()}
                  onDragStart={(event) => event.preventDefault()}
                  onChange={(event) => setGeminiApiKeyDraft(event.target.value)}
                  placeholder={state.gemini.hasSecret ? (isEnglish ? 'A saved API key already exists.' : '저장된 API 키가 있습니다.') : 'Gemini API 키'}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                />
                <select
                  value={state.gemini.model}
                  onChange={(event) =>
                    setState((current) =>
                      current
                        ? { ...current, gemini: { ...current.gemini, model: event.target.value } }
                        : current,
                    )
                  }
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                >
                      {GEMINI_MODEL_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} · {translateModelDescription(option.description, locale)}
                    </option>
                  ))}
                </select>
                <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  {isEnglish ? 'Current selection:' : '현재 선택:'}{' '}
                  <span className="font-semibold text-slate-900">{selectedGeminiOption?.label}</span>
                </div>
                <select
                  value={state.gemini.apiKeyRetention}
                  onChange={(event) =>
                    setState((current) =>
                      current
                        ? {
                            ...current,
                            gemini: {
                              ...current.gemini,
                              apiKeyRetention: event.target.value as ProviderState['gemini']['apiKeyRetention'],
                            },
                          }
                        : current,
                    )
                  }
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                >
                  {API_KEY_RETENTION_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {translateRetentionLabel(option.id, locale)}
                    </option>
                  ))}
                </select>
                <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
                  {isEnglish
                    ? 'API keys are stored only in the OS secure store and expire automatically after the selected retention period.'
                    : 'API 키는 OS 보안 저장소에만 저장되며, 선택한 보관 기간이 지나면 자동으로 무효화됩니다.'}
                </div>
              </div>
            </div>

            <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{isEnglish ? 'Groq Settings' : 'Groq 설정'}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {isEnglish
                      ? 'The default model is Compound. Recommended models are Compound and Compound Mini.'
                      : '기본 모델은 Compound입니다. 권장 모델은 Compound와 Compound Mini입니다.'}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-sm text-slate-600">
                    {state.groq.storageBackend
                      ? `${state.groq.storageBackend} · ${state.groq.hasSecret ? savedLabel : unsavedLabel}`
                      : osStoreUnavailableLabel}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                      onClick={() => void saveProviderSecret('groq')}
                    >
                      {isEnglish ? 'Save key' : '키 저장'}
                    </button>
                    <button
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                      onClick={() => void removeProviderSecret('groq')}
                    >
                      {isEnglish ? 'Delete key' : '키 삭제'}
                    </button>
                  </div>
                </div>
                <input
                  type="password"
                  value={groqApiKeyDraft}
                  autoComplete="off"
                  spellCheck={false}
                  onCopy={(event) => event.preventDefault()}
                  onCut={(event) => event.preventDefault()}
                  onDragStart={(event) => event.preventDefault()}
                  onChange={(event) => setGroqApiKeyDraft(event.target.value)}
                  placeholder={state.groq.hasSecret ? (isEnglish ? 'A saved API key already exists.' : '저장된 API 키가 있습니다.') : 'Groq API 키'}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                />
                <div className="grid gap-3 sm:grid-cols-[1fr,auto]">
                  <select
                    value={state.groq.model}
                    onChange={(event) =>
                      setState((current) =>
                        current
                          ? { ...current, groq: { ...current.groq, model: event.target.value } }
                          : current,
                      )
                    }
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                  >
                    {groqModelOptions.map((model) => {
                      const option = GROQ_MODEL_OPTIONS.find((item) => item.id === model)
                      return (
                        <option key={model} value={model}>
                          {option
                            ? `${option.label} · ${translateModelDescription(option.description, locale)}`
                            : model}
                        </option>
                      )
                    })}
                  </select>
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                    onClick={() => void loadGroqModels()}
                  >
                    {isEnglish ? 'Load models' : '모델 불러오기'}
                  </button>
                </div>
                <input
                  value={state.groq.model}
                  onChange={(event) =>
                    setState((current) =>
                      current
                        ? { ...current, groq: { ...current.groq, model: event.target.value } }
                        : current,
                    )
                  }
                  placeholder={isEnglish ? 'Enter a Groq model ID manually' : 'Groq 모델 ID 직접 입력'}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                />
                <select
                  value={state.groq.apiKeyRetention}
                  onChange={(event) =>
                    setState((current) =>
                      current
                        ? {
                            ...current,
                            groq: {
                              ...current.groq,
                              apiKeyRetention: event.target.value as ProviderState['groq']['apiKeyRetention'],
                            },
                          }
                        : current,
                    )
                  }
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                >
                  {API_KEY_RETENTION_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {translateRetentionLabel(option.id, locale)}
                    </option>
                  ))}
                </select>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-sm font-medium text-slate-700">{isEnglish ? 'Groq built-in tools' : 'Groq 내장 도구'}</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {GROQ_TOOL_OPTIONS.map((tool) => (
                      <label key={tool.id} className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={state.groq.enabledTools.includes(tool.id)}
                          onChange={(event) =>
                            setState((current) => {
                              if (!current) {
                                return current
                              }

                              const enabledTools = event.target.checked
                                ? [...new Set([...current.groq.enabledTools, tool.id])]
                                : current.groq.enabledTools.filter((item: GroqToolId) => item !== tool.id)

                              return {
                                ...current,
                                groq: { ...current.groq, enabledTools },
                              }
                            })
                          }
                        />
                        <span>{translateGroqToolLabel(tool.id, locale)}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 text-xs leading-5 text-slate-500">
                    {isEnglish
                      ? 'Compound models can use built-in web search, code execution, website visit, browser automation, and Wolfram Alpha tools.'
                      : 'Compound 계열은 웹검색, 코드 실행, 웹사이트 방문, 브라우저 자동화, Wolfram Alpha를 내장 도구로 사용할 수 있습니다.'}
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
                  {groqModelStatus ||
                    (isEnglish
                      ? 'Groq model lists are loaded with the saved API key. You can also enter a model ID manually.'
                      : 'Groq 모델 목록은 저장된 API 키로 불러옵니다. 모델 ID 직접 입력도 가능합니다.')}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {supportsCodex && activeSettingsTab === 'codex' ? (
          <section className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{isEnglish ? 'Codex Connection' : 'Codex 연결'}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {isEnglish
                        ? 'OpenAI-side assistance uses the local OAuth login session from the Codex CLI.'
                        : 'OpenAI 계열 보조는 로컬 Codex CLI의 OAuth 로그인 세션을 사용합니다.'}
                    </p>
                  </div>
                <button
                  className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white"
                  onClick={() => void checkCodexStatus()}
                >
                    {isEnglish ? 'Check status' : '연결 확인'}
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                    onClick={() => void startCodexLogin()}
                  >
                    {isEnglish ? 'Codex OAuth login' : 'Codex OAuth 로그인'}
                  </button>
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!codexAuthUrl}
                    onClick={() =>
                      codexAuthUrl.startsWith('https://auth.openai.com/') &&
                      chrome.tabs.create({ url: codexAuthUrl })
                    }
                  >
                    {isEnglish ? 'Open OAuth page' : 'OAuth 페이지 열기'}
                  </button>
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                    onClick={() => void startCodexBridge()}
                  >
                    {isEnglish ? 'Start connection' : '연결 시작'}
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                    <div className="font-medium text-slate-700">{isEnglish ? 'Codex connection URL' : 'Codex 연결 URL'}</div>
                    <input
                      value={state.codex.bridgeUrl}
                      onChange={(event) =>
                        setState((current) =>
                          current
                            ? { ...current, codex: { ...current.codex, bridgeUrl: event.target.value } }
                            : current,
                        )
                      }
                      placeholder="http://127.0.0.1:4317"
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                    <div className="font-medium text-slate-700">{isEnglish ? 'Codex workspace path' : 'Codex 작업 디렉토리'}</div>
                    <input
                      value={state.codex.workspaceRoot}
                      onChange={(event) =>
                        setState((current) =>
                          current
                            ? {
                                ...current,
                                codex: { ...current.codex, workspaceRoot: event.target.value },
                              }
                            : current,
                        )
                      }
                      placeholder={isEnglish ? 'Use the current workspace automatically' : '현재 작업 디렉토리를 자동으로 사용'}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                    <div className="font-medium text-slate-700">{isEnglish ? 'Codex model' : 'Codex 모델'}</div>
                    <select
                      value={state.codex.model}
                      onChange={(event) =>
                        setState((current) =>
                          current
                            ? { ...current, codex: { ...current.codex, model: event.target.value } }
                            : current,
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      {CODEX_MODEL_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label} · {translateModelDescription(option.description, locale)}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs leading-4 text-slate-500">
                      {isEnglish ? 'Current selection:' : '현재 선택:'} {selectedCodexModelOption?.label ?? state.codex.model}
                    </div>
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                    <div className="font-medium text-slate-700">{isEnglish ? 'Reasoning effort' : '이성/추론 강도'}</div>
                    <select
                      value={state.codex.reasoningEffort}
                      onChange={(event) =>
                        setState((current) =>
                          current
                            ? {
                                ...current,
                                codex: {
                                  ...current.codex,
                                  reasoningEffort: event.target.value as ProviderState['codex']['reasoningEffort'],
                                },
                              }
                            : current,
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      {CODEX_REASONING_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {translateReasoningLabel(option.id, locale)} · {translateReasoningLabel(option.description, locale)}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs leading-4 text-slate-500">
                      {isEnglish ? 'Current selection:' : '현재 선택:'}{' '}
                      {selectedCodexReasoningOption
                        ? translateReasoningLabel(selectedCodexReasoningOption.id, locale)
                        : state.codex.reasoningEffort}
                    </div>
                  </label>
                </div>

                <div
                  className={`rounded-lg px-4 py-3 text-sm ${
                    codexStatus?.status?.includes('Logged in')
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-slate-50 text-slate-600'
                  }`}
                >
                  {codexStatus?.status ?? (isEnglish ? 'Codex status has not been checked yet.' : 'Codex 상태를 아직 확인하지 않았습니다.')}
                  {codexStatus?.message ? (
                    <div className="mt-1 text-xs">{codexStatus.message}</div>
                  ) : null}
                </div>
                {codexLoginOutput ? (
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 px-3 py-3 text-xs text-white">
                    {codexLoginOutput}
                  </pre>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {activeSettingsTab === 'history' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{isEnglish ? 'Analysis History' : '분석 기록'}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {isEnglish
                  ? 'Stores up to the latest 50 inputs, OCR text, and analysis results.'
                  : '최근 50건까지 입력 원문, OCR 결과, 분석 결과를 보관합니다.'}
              </p>
            </div>
            <button
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600"
              onClick={() => void clearAllHistory()}
            >
              {isEnglish ? 'Clear all' : '전체 삭제'}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {pagedHistory.map((record) => {
              const neutralResult = isNeutralAnalysisResult(record.result)
              const summary = renderAnalysisSummary(record.result, locale)

              return (
                <details
                  key={record.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-base font-semibold leading-6 text-slate-900">
                          {buildRecordTitle(
                            record.result.primaryType,
                            record.input.rawText || record.ocrText,
                            locale,
                            neutralResult,
                          )}
                        </div>
                        <div className="mt-1 text-xs leading-4 text-slate-500">
                          {formatDateTime(record.createdAt, locale)}
                        </div>
                        {summary ? (
                          <div className="mt-2 break-words text-sm leading-6 text-slate-600">
                            {summary}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                        {record.result.score}
                      </div>
                    </div>
                  </summary>

                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                    <button
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                      onClick={() => void reanalyzeRecord(record.id)}
                    >
                      {isEnglish ? 'Reanalyze' : '재분석'}
                    </button>
                    <button
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
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
              <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                {isEnglish ? 'No saved records yet.' : '저장된 기록이 없습니다.'}
              </div>
            ) : null}
          </div>

          {history.length > 0 ? (
            <div className="mt-5 flex items-center justify-center gap-3 border-t border-slate-200 pt-4">
              <button
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={historyPage === 1}
                onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
              >
                &lt;
              </button>
              <div className="min-w-[72px] text-center text-sm font-semibold text-slate-700">
                {historyPage} / {totalHistoryPages}
              </div>
              <button
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={historyPage === totalHistoryPages}
                onClick={() =>
                  setHistoryPage((current) => Math.min(totalHistoryPages, current + 1))
                }
              >
                &gt;
              </button>
            </div>
          ) : null}
        </section>
        ) : null}
      </div>
    </main>
  )
}
