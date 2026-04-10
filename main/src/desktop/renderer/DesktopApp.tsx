import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, ExternalLink, History, ImagePlus, Link2, Search, Settings2 } from 'lucide-react'
import { desktopAnalysisService, desktopProviderStateRepository } from '@/desktop/renderer/services'
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
import type { ProviderState, StoredAnalysisRecord, ThemeMode } from '@/shared/types'

type DesktopTab = 'analyze' | 'settings' | 'history'
type AnalyzeInputTab = 'text' | 'url' | 'image' | 'clipboard'

function fileToDataUrl(file: File, locale: 'ko' | 'en') {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(locale === 'en' ? 'Failed to read the image.' : '이미지를 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

function providerModelOptions(state: ProviderState) {
  if (state.preferredProvider === 'gemini') {
    return GEMINI_MODEL_OPTIONS
  }

  if (state.preferredProvider === 'groq') {
    return GROQ_MODEL_OPTIONS
  }

  return CODEX_MODEL_OPTIONS
}

function isProviderAvailable(state: ProviderState, provider: ProviderState['preferredProvider']) {
  if (provider === 'codex') {
    return !state.webSearchEnabled
  }

  if (provider === 'gemini') {
    return state.gemini.hasSecret && Boolean(state.gemini.storageBackend)
  }

  return state.groq.hasSecret && Boolean(state.groq.storageBackend)
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

export function DesktopApp() {
  const [desktopTab, setDesktopTab] = useState<DesktopTab>('analyze')
  const [inputTab, setInputTab] = useState<AnalyzeInputTab>('text')
  const [textValue, setTextValue] = useState('')
  const [urlValue, setUrlValue] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [clipboardPreview, setClipboardPreview] = useState('')
  const [providerState, setProviderState] = useState<ProviderState>(DEFAULT_PROVIDER_STATE)
  const [history, setHistory] = useState<StoredAnalysisRecord[]>([])
  const [latestRecord, setLatestRecord] = useState<StoredAnalysisRecord | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [codexStatus, setCodexStatus] = useState('')
  const [geminiApiKeyDraft, setGeminiApiKeyDraft] = useState('')
  const [groqApiKeyDraft, setGroqApiKeyDraft] = useState('')
  const providerStateRef = useRef(providerState)
  const locale = providerState.uiLocale
  const isEnglish = locale === 'en'

  useEffect(() => {
    providerStateRef.current = providerState
  }, [providerState])

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
      const [bundle, nextProviderState, nextCodexStatus] = await Promise.all([
        window.kwcDesktop.history.getBundle(),
        window.kwcDesktop.providerState.get(),
        window.kwcDesktop.codex.getStatus().catch(() => ({ status: '' })),
      ])

      setHistory(bundle.history)
      setLatestRecord(bundle.latestRecord)
      setProviderState(nextProviderState)
      applyTheme(nextProviderState.theme ?? 'system')
      setCodexStatus(nextCodexStatus.status || (nextProviderState.uiLocale === 'en' ? 'Not checked' : '미확인'))
      setStatusMessage('')
    })().catch((error) => {
      const message = toUiErrorMessage(error, 'Initialization failed.', '초기화에 실패했습니다.')
      setErrorMessage(message)
      setStatusMessage(message)
    })
  }, [])

  const currentModelOptions = useMemo(() => providerModelOptions(providerState), [providerState])

  const currentModelValue = useMemo(() => {
    if (providerState.preferredProvider === 'gemini') {
      return providerState.gemini.model
    }

    if (providerState.preferredProvider === 'groq') {
      return providerState.groq.model
    }

    return providerState.codex.model
  }, [providerState])

  async function persistProviderState(nextState: ProviderState) {
    const savedState = await desktopProviderStateRepository.saveProviderState(nextState)
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

  async function completeOnboarding() {
    try {
      const savedState = await persistProviderState({
        ...providerStateRef.current,
        onboardingCompleted: true,
      })
      setStatusMessage(savedState.uiLocale === 'en' ? 'Setup completed.' : '초기 설정을 완료했습니다.')
    } catch (error) {
      setStatusMessage(toUiErrorMessage(error, 'Failed to complete setup.', '초기 설정 완료에 실패했습니다.'))
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
    try {
      const status = await window.kwcDesktop.codex.getStatus()
      setCodexStatus(status.status || (isEnglish ? 'Not checked' : '미확인'))
      setStatusMessage(isEnglish ? 'Codex status checked.' : 'Codex 상태를 확인했습니다.')
    } catch (error) {
      setStatusMessage(toUiErrorMessage(error, 'Failed to check Codex status.', 'Codex 상태 확인에 실패했습니다.'))
    }
  }

  async function startCodexBridge() {
    try {
      const status = await window.kwcDesktop.codex.startBridge(true)
      setCodexStatus(status.status || codexStatus || (isEnglish ? 'Not checked' : '미확인'))
      setStatusMessage(status.message || (isEnglish ? 'Codex connection started.' : 'Codex 연결을 시작했습니다.'))
    } catch (error) {
      setStatusMessage(toUiErrorMessage(error, 'Failed to start the Codex connection.', 'Codex 연결 시작에 실패했습니다.'))
    }
  }

  async function startCodexLogin() {
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
    const resolvedProvider =
      providerStateRef.current.webSearchEnabled && nextProvider === 'codex'
        ? providerStateRef.current.gemini.hasSecret && providerStateRef.current.gemini.storageBackend
          ? 'gemini'
          : providerStateRef.current.groq.hasSecret && providerStateRef.current.groq.storageBackend
            ? 'groq'
            : nextProvider
        : nextProvider

    if (!isProviderAvailable(providerStateRef.current, resolvedProvider)) {
      return
    }

    await persistProviderState({
      ...providerStateRef.current,
      preferredProvider: resolvedProvider,
    })
  }

  async function changePreferredModel(nextModel: string) {
    if (providerStateRef.current.preferredProvider === 'gemini') {
      await persistProviderState({
        ...providerStateRef.current,
        gemini: {
          ...providerStateRef.current.gemini,
          model: nextModel,
        },
      })
      return
    }

    if (providerStateRef.current.preferredProvider === 'groq') {
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

  if (!providerState.onboardingCompleted) {
    return (
      <OnboardingFlow
        locale={providerState.uiLocale}
        providerState={providerState}
        geminiApiKeyDraft={geminiApiKeyDraft}
        groqApiKeyDraft={groqApiKeyDraft}
        statusMessage={statusMessage}
        codexStatus={codexStatus}
        onLocaleChange={(nextLocale) => {
          const nextState = { ...providerStateRef.current, uiLocale: nextLocale }
          providerStateRef.current = nextState
          setProviderState(nextState)
        }}
        onGeminiApiKeyChange={setGeminiApiKeyDraft}
        onGroqApiKeyChange={setGroqApiKeyDraft}
        onSaveGemini={() => void saveProviderSecret('gemini')}
        onSaveGroq={() => void saveProviderSecret('groq')}
        onStartCodexLogin={() => void startCodexLogin()}
        onStartCodexBridge={() => void startCodexBridge()}
        onRefreshCodexStatus={() => void refreshCodexStatus()}
        onComplete={() => void completeOnboarding()}
      />
    )
  }

  return (
    <main className="min-h-screen bg-[#eef2f7] px-4 py-4 text-[#1f2940] sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 lg:gap-6">
        <header className="rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,#1e2854_0%,#2f3b7f_58%,#5767c6_100%)] px-5 py-5 text-white shadow-[0_24px_80px_rgba(31,41,64,0.16)] sm:px-6 lg:px-7 lg:py-6">
          <div className="max-w-[60rem]">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#ffd79b]">
              K-WarningCheck Desktop
            </div>
            <h1 className="mt-2 break-keep text-2xl font-semibold leading-tight sm:text-3xl">
              {isEnglish ? 'Shared Windows / macOS analysis workspace' : '윈도우·맥 공용 분석 워크스페이스'}
            </h1>
            <p className="mt-2 max-w-[56rem] break-keep text-sm leading-6 text-[#dbe3ff]">
              {isEnglish
                ? 'Uses the same analysis engine as the extension on desktop. Text, URLs, images, and clipboard content share one history store.'
                : '확장과 같은 분석 엔진을 데스크톱에서도 직접 사용합니다. 텍스트, URL, 이미지, 클립보드 내용을 같은 기록 저장소로 관리합니다.'}
            </p>
          </div>
        </header>

        {latestRecord ? (
          <ScoreGauge
            score={latestRecord.result.score}
            grade={latestRecord.result.grade}
            primaryType={latestRecord.result.primaryType}
            secondaryTypes={latestRecord.result.secondaryTypes}
            aiHookingTags={latestRecord.result.aiHookingChecklist.tags}
            locale={locale}
          />
        ) : null}

        <nav className="grid gap-2 rounded-2xl border border-[#d9e0ee] bg-white p-2 shadow-sm sm:grid-cols-3">
          {[
            ['analyze', isEnglish ? 'Analyze' : '분석'],
            ['settings', isEnglish ? 'Settings' : '설정'],
            ['history', isEnglish ? 'History' : '기록'],
          ].map(([tab, label]) => (
            <button
              key={tab}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                desktopTab === tab ? 'bg-[#253061] text-white' : 'bg-[#f5f7fb] text-[#55607a]'
              }`}
              onClick={() => setDesktopTab(tab as DesktopTab)}
            >
              {label}
            </button>
          ))}
        </nav>

        {errorMessage || statusMessage ? (
          <div className="rounded-2xl border border-[#d9e0ee] bg-white px-5 py-4 text-sm text-[#55607a] shadow-sm">
            {errorMessage ? <span className="font-medium text-[#b9382d]">{errorMessage}</span> : statusMessage}
          </div>
        ) : null}

        {desktopTab === 'analyze' ? (
          <div className="space-y-4">
            <section className="grid gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
              <div className="rounded-[28px] border border-[#d9e0ee] bg-white p-4 shadow-sm sm:p-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d78d6]">Analyze</div>
                  <h2 className="mt-1 break-keep text-2xl font-semibold text-[#1f2940]">{isEnglish ? 'Manual Analysis' : '직접 분석'}</h2>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                  <label className="flex min-w-0 items-center gap-2 text-sm text-[#55607a]">
                    <span className="shrink-0">{isEnglish ? 'Provider' : '제공자'}</span>
                    <select
                      value={providerState.preferredProvider}
                      onChange={(event) =>
                        void changePreferredProvider(event.target.value as ProviderState['preferredProvider'])
                      }
                      className="min-w-0 flex-1 rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-3 py-2"
                    >
                      <option value="codex" disabled={providerState.webSearchEnabled}>
                        Codex
                      </option>
                      <option value="gemini" disabled={!providerState.gemini.hasSecret || !providerState.gemini.storageBackend}>
                        Gemini
                      </option>
                      <option value="groq" disabled={!providerState.groq.hasSecret || !providerState.groq.storageBackend}>
                        Groq
                      </option>
                    </select>
                  </label>

                  <label className="flex min-w-0 items-center gap-2 text-sm text-[#55607a]">
                    <span className="shrink-0">{isEnglish ? 'Model' : '모델'}</span>
                    <select
                      value={currentModelValue}
                      onChange={(event) => void changePreferredModel(event.target.value)}
                      className="min-w-0 flex-1 rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-3 py-2"
                    >
                      {currentModelOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {([
                    ['text', isEnglish ? 'Text' : '텍스트', Bot],
                    ['url', 'URL', Link2],
                    ['image', isEnglish ? 'Image' : '이미지', ImagePlus],
                    ['clipboard', isEnglish ? 'Clipboard' : '클립보드', Search],
                  ] as const).map(([tab, label, Icon]) => (
                    <button
                      key={tab}
                      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold ${
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
                      rows={18}
                      value={textValue}
                      onChange={(event) => setTextValue(event.target.value)}
                      placeholder={isEnglish ? 'Paste suspicious copy, a DM, or an ad sentence.' : '수상한 문구, DM, 광고 문장을 붙여넣으세요.'}
                      className="min-h-[27rem] w-full resize-none rounded-3xl border border-[#d9e0ee] bg-[#f7f8fc] px-4 py-4 text-sm leading-6 outline-none focus:border-[#7d87e8]"
                    />
                  ) : null}

                  {inputTab === 'url' ? (
                    <input
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
                    value={providerState.preferredProvider}
                    onChange={(event) =>
                      void persistProviderState({
                        ...providerStateRef.current,
                        preferredProvider: event.target.value as ProviderState['preferredProvider'],
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-4 py-3"
                  >
                    <option value="codex" disabled={providerState.webSearchEnabled}>
                      Codex
                    </option>
                    <option value="gemini" disabled={!providerState.gemini.hasSecret || !providerState.gemini.storageBackend}>
                      Gemini
                    </option>
                    <option value="groq" disabled={!providerState.groq.hasSecret || !providerState.groq.storageBackend}>
                      Groq
                    </option>
                  </select>
                </label>

                <label className="flex items-center justify-between rounded-2xl border border-[#d9e0ee] bg-[#f7f8fc] px-4 py-3 text-sm font-medium text-[#44506c]">
                  <span>{isEnglish ? 'Web freshness verification' : '웹 검색 기반 최신성 검증'}</span>
                  <input
                    type="checkbox"
                    checked={providerState.webSearchEnabled}
                    onChange={(event) =>
                      void persistProviderState({
                        ...providerStateRef.current,
                        webSearchEnabled: event.target.checked,
                      })
                    }
                  />
                </label>

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
                      if (providerStateRef.current.preferredProvider === 'gemini') {
                        void persistProviderState({
                          ...providerStateRef.current,
                          gemini: {
                            ...providerStateRef.current.gemini,
                            model: nextValue,
                          },
                        })
                        return
                      }

                      if (providerStateRef.current.preferredProvider === 'groq') {
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
            </div>
          </section>
        ) : null}

        {desktopTab === 'history' ? (
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
        ) : null}
      </div>
    </main>
  )
}
