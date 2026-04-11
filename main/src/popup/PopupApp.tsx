import { useEffect, useMemo, useRef, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { isProviderSelectable } from '@/core/providerStateModel'
import { RecordCard } from '@/popup/components/RecordCard'
import { ScoreGauge } from '@/popup/components/ScoreGauge'
import { DEFAULT_PROVIDER_STATE } from '@/shared/defaults'
import {
  buildRecordTitle,
  formatDateTime,
  formatScore,
  getDisclaimerText,
  isNeutralAnalysisResult,
} from '@/shared/localization'
import {
  CODEX_MODEL_OPTIONS,
  GEMINI_MODEL_OPTIONS,
  GROQ_MODEL_OPTIONS,
} from '@/shared/providerOptions'
import { getSupportedProviders } from '@/shared/runtimeCapabilities'
import { sendRuntimeMessage } from '@/shared/runtime'
import type {
  AnalysisInput,
  PopupStatus,
  ProviderState,
  RuntimeCapabilities,
  RuntimeMessage,
  StoredAnalysisRecord,
  ThemeMode,
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

type PopupTab = 'text' | 'url' | 'image'

async function fileToDataUrl(file: File, locale: ProviderState['uiLocale']) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(locale === 'en' ? 'Failed to read the image.' : '이미지를 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

export function PopupApp() {
  const [activeTab, setActiveTab] = useState<PopupTab>('text')
  const [textValue, setTextValue] = useState('')
  const [urlValue, setUrlValue] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [latestRecord, setLatestRecord] = useState<StoredAnalysisRecord | null>(null)
  const [history, setHistory] = useState<StoredAnalysisRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [providerState, setProviderState] = useState<ProviderState>(DEFAULT_PROVIDER_STATE)
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<RuntimeCapabilities | null>(null)
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const providerStateRef = useRef(providerState)
  const locale = providerState.uiLocale
  const isEnglish = locale === 'en'
  const supportsCodex = runtimeCapabilities?.supportsCodex ?? false
  const visibleProviders = useMemo<ProviderState['preferredProvider'][]>(
    () => (runtimeCapabilities ? getSupportedProviders(runtimeCapabilities) : ['gemini', 'groq']),
    [runtimeCapabilities],
  )
  const effectivePreferredProvider =
    !supportsCodex && providerState.preferredProvider === 'codex' ? 'gemini' : providerState.preferredProvider

  useEffect(() => {
    providerStateRef.current = providerState
  }, [providerState])

  useEffect(() => {
    void (async () => {
      const [latest, records, loadedProviderState, loadedRuntimeCapabilities, popupStatus] = await Promise.all([
        sendRuntimeMessage<StoredAnalysisRecord | null>({ type: 'get-latest-record' }),
        sendRuntimeMessage<StoredAnalysisRecord[]>({ type: 'get-history' }),
        sendRuntimeMessage<ProviderState>({ type: 'get-provider-state' }),
        sendRuntimeMessage<RuntimeCapabilities>({ type: 'get-runtime-capabilities' }),
        sendRuntimeMessage<PopupStatus>({ type: 'get-popup-status' }),
      ])

      setLatestRecord(latest)
      setHistory(records)
      setProviderState(loadedProviderState)
      setRuntimeCapabilities(loadedRuntimeCapabilities)
      applyTheme(loadedProviderState.theme ?? 'system')
      setLoading(popupStatus.loading)
      setStatusMessage(popupStatus.message)
      setErrorMessage(popupStatus.error ?? '')
    })()
  }, [])

  useEffect(() => {
    const listener = (message: RuntimeMessage) => {
      if (message.type === 'analysis-ready') {
        setLatestRecord(message.record)
        setHistory((current) => [message.record, ...current.filter((item) => item.id !== message.record.id)].slice(0, 5))
        setLoading(false)
        setStatusMessage('')
        setErrorMessage('')
      }
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  const canAnalyze = useMemo(() => {
    if (activeTab === 'text') {
      return textValue.trim().length > 0
    }

    if (activeTab === 'url') {
      return urlValue.trim().length > 0
    }

    return Boolean(imageFile)
  }, [activeTab, imageFile, textValue, urlValue])

  const activeModelOptions = useMemo(() => {
    if (effectivePreferredProvider === 'gemini') {
      return GEMINI_MODEL_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
      }))
    }

    if (effectivePreferredProvider === 'groq') {
      return GROQ_MODEL_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
      }))
    }

    return CODEX_MODEL_OPTIONS.map((option) => ({
      id: option.id,
      label: option.label,
    }))
  }, [effectivePreferredProvider])

  const activeModelValue = useMemo(() => {
    if (effectivePreferredProvider === 'gemini') {
      return providerState.gemini.model
    }

    if (effectivePreferredProvider === 'groq') {
      return providerState.groq.model
    }

    return providerState.codex.model
  }, [effectivePreferredProvider, providerState])

  const mergedModelOptions = useMemo(() => {
    if (activeModelOptions.some((option) => option.id === activeModelValue)) {
      return activeModelOptions
    }

    return [
      {
        id: activeModelValue,
        label: activeModelValue,
      },
      ...activeModelOptions,
    ]
  }, [activeModelOptions, activeModelValue])

  async function persistProviderState(updater: (current: ProviderState) => ProviderState) {
    const nextState = updater(providerStateRef.current)
    providerStateRef.current = nextState
    setProviderState(nextState)

    try {
      const savedState = await sendRuntimeMessage<ProviderState>({
        type: 'save-provider-state',
        state: nextState,
      })
      providerStateRef.current = savedState
      setProviderState(savedState)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : locale === 'en' ? 'Failed to save provider settings.' : '제공자 설정 저장에 실패했습니다.')
    }
  }

  async function runAnalyze() {
    setLoading(true)
    setErrorMessage('')

    try {
      const syncedProviderState = await sendRuntimeMessage<ProviderState>({
        type: 'save-provider-state',
        state: providerStateRef.current,
      })
      providerStateRef.current = syncedProviderState
      setProviderState(syncedProviderState)

      let input: AnalysisInput

      if (activeTab === 'text') {
        input = {
          source: 'text',
          rawText: textValue,
          createdAt: new Date().toISOString(),
        }
      } else if (activeTab === 'url') {
        input = {
          source: 'url',
          rawText: urlValue,
          pageUrl: urlValue,
          createdAt: new Date().toISOString(),
        }
      } else {
        if (!imageFile) {
          throw new Error(isEnglish ? 'Choose an image first.' : '이미지를 선택해 주세요.')
        }

        input = {
          source: 'image',
          imageDataUrl: await fileToDataUrl(imageFile, locale),
          title: imageFile.name,
          createdAt: new Date().toISOString(),
        }
      }

      const record = await sendRuntimeMessage<StoredAnalysisRecord>({
        type: 'analyze-input',
        input,
      })

      setLatestRecord(record)
      setHistory((current) => [record, ...current.filter((item) => item.id !== record.id)].slice(0, 5))
      setStatusMessage('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : isEnglish ? 'Analysis failed.' : '분석에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function runQuickAction(message: RuntimeMessage, status: string) {
    setLoading(true)
    setErrorMessage('')
    setStatusMessage(status)

    try {
      const syncedProviderState = await sendRuntimeMessage<ProviderState>({
        type: 'save-provider-state',
        state: providerStateRef.current,
      })
      providerStateRef.current = syncedProviderState
      setProviderState(syncedProviderState)

      const record = await sendRuntimeMessage<StoredAnalysisRecord | null>(message)
      if (record) {
        setLatestRecord(record)
        setHistory((current) => [record, ...current.filter((item) => item.id !== record.id)].slice(0, 5))
        setStatusMessage('')
        setLoading(false)
      } else {
        setStatusMessage(status)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : isEnglish ? 'Action failed.' : '작업에 실패했습니다.')
      setLoading(false)
    }
  }

  async function changePreferredProvider(nextProvider: ProviderState['preferredProvider']) {
    if (!supportsCodex && nextProvider === 'codex') {
      return
    }

    const resolvedProvider =
      providerStateRef.current.webSearchEnabled && nextProvider === 'codex' ? 'gemini' : nextProvider

    if (
      !isProviderSelectable(
        providerStateRef.current,
        resolvedProvider,
        runtimeCapabilities ?? { os: 'unknown', supportsCodex: false },
      )
    ) {
      return
    }

    await persistProviderState((current) => ({
      ...current,
      preferredProvider: resolvedProvider,
    }))
  }

  async function changePreferredModel(nextModel: string) {
    const preferredProvider =
      !supportsCodex && providerStateRef.current.preferredProvider === 'codex'
        ? 'gemini'
        : providerStateRef.current.preferredProvider

    if (preferredProvider === 'gemini') {
      await persistProviderState((current) => ({
        ...current,
        gemini: {
          ...current.gemini,
          model: nextModel,
        },
      }))
      return
    }

    if (preferredProvider === 'groq') {
      await persistProviderState((current) => ({
        ...current,
        groq: {
          ...current.groq,
          model: nextModel,
        },
      }))
      return
    }

    await persistProviderState((current) => ({
      ...current,
      codex: {
        ...current.codex,
        model: nextModel,
      },
    }))
  }

  async function toggleWebSearchEnabled(nextChecked: boolean) {
    await persistProviderState((current) => ({
      ...current,
      webSearchEnabled: nextChecked,
      preferredProvider:
        nextChecked && current.preferredProvider === 'codex'
          ? current.gemini.hasSecret && current.gemini.storageBackend
            ? 'gemini'
            : current.groq.hasSecret && current.groq.storageBackend
              ? 'groq'
              : current.preferredProvider
          : current.preferredProvider,
    }))
  }

  function handleDroppedImage(fileList: FileList | null) {
    const file = fileList?.[0] ?? null

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setErrorMessage(isEnglish ? 'Only image files can be uploaded.' : '이미지 파일만 업로드할 수 있습니다.')
      return
    }

    setErrorMessage('')
    setImageFile(file)
    setActiveTab('image')
  }

  return (
    <main className="mx-auto h-full min-h-0 w-[420px] max-w-[420px] overflow-y-auto overflow-x-hidden bg-[#f4f5f8] px-3 py-3 text-[#27304d]">
      <header className="mb-3 flex items-center justify-between gap-3 border-b border-[#cfd4df] pb-2">
        <div className="min-w-0 pr-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6d78d6]">
            K-WarningCheck
          </div>
        </div>
        <button
          aria-label={isEnglish ? 'Settings' : '설정'}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#cfd4df] bg-white text-[#4e5971]"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          <Settings2 aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        </button>
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

      {!providerState.onboardingCompleted ? (
        <section className="mt-3 flex flex-col items-center rounded-lg border border-[#d6d9e2] bg-white p-5 text-center shadow-sm">
          <div className="text-lg font-semibold text-[#2c3470]">
            {isEnglish ? 'Finish setup before analyzing' : '분석 전에 초기 설정을 완료하세요'}
          </div>
          <p className="mt-2 text-sm leading-6 text-[#596278]">
            {isEnglish
              ? supportsCodex
                ? 'Open the settings page to complete the first-run introduction, choose Korean or English, and optionally connect Gemini, Groq, or Codex.'
                : 'Open the settings page to complete the first-run introduction, choose Korean or English, and optionally connect Gemini or Groq.'
              : supportsCodex
                ? '설정 페이지에서 첫 실행 소개, 한국어/영어 선택, Gemini·Groq·Codex 연결을 먼저 완료해 주세요.'
                : '설정 페이지에서 첫 실행 소개, 한국어/영어 선택, Gemini·Groq 연결을 먼저 완료해 주세요.'}
          </p>
          <button
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[#2c3470] px-4 py-3 text-sm font-semibold text-white"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            {isEnglish ? 'Open settings' : '설정 열기'}
          </button>
        </section>
      ) : (
      <section className="mt-3 rounded-lg border border-[#d6d9e2] bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center gap-2 pl-0">
          <label className="flex min-w-[144px] items-center gap-2 text-xs text-[#6c7488]">
            <span className="shrink-0">{isEnglish ? 'Provider' : '제공자'}</span>
            <select
              value={effectivePreferredProvider}
              onChange={(event) =>
                void changePreferredProvider(event.target.value as ProviderState['preferredProvider'])
              }
              className="min-w-0 flex-1 rounded-md border border-[#d6d9e2] bg-[#f8f9fb] px-2 py-1.5 text-xs font-medium text-[#27304d] outline-none"
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
          <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-[#6c7488]">
            <span className="shrink-0">{isEnglish ? 'Model' : '모델'}</span>
            <select
              value={activeModelValue}
              onChange={(event) => void changePreferredModel(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-[#d6d9e2] bg-[#f8f9fb] px-2 py-1.5 text-xs font-medium text-[#27304d] outline-none"
            >
              {mergedModelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
                ))}
              </select>
            </label>
        </div>

        <div className="mt-0 flex items-center gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
            {(['text', 'url', 'image'] as PopupTab[]).map((tab) => (
              <button
                key={tab}
                className={`rounded-md px-3 py-2 text-sm font-medium leading-5 ${
                  activeTab === tab
                    ? 'bg-[#2c3470] text-white'
                    : 'bg-[#edf1f7] text-[#596278]'
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'text' ? (isEnglish ? 'Text' : '텍스트') : tab === 'url' ? 'URL' : isEnglish ? 'Image' : '이미지'}
              </button>
            ))}
          </div>
          <label className="flex shrink-0 items-center gap-2 rounded-md border border-[#d6d9e2] bg-[#f8f9fb] px-2 py-2 text-[11px] font-medium text-[#4e5971]">
            <span className="shrink-0">{isEnglish ? 'Web' : '웹검색'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={providerState.webSearchEnabled}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                providerState.webSearchEnabled ? 'bg-[#2c3470]' : 'bg-[#cfd4df]'
              }`}
              onClick={() => void toggleWebSearchEnabled(!providerState.webSearchEnabled)}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  providerState.webSearchEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>

        <div className="mt-3">
          {activeTab === 'text' && (
            <textarea
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              rows={6}
              placeholder={
                isEnglish
                  ? 'Paste a suspicious message, ad copy, or DM.'
                  : '수상한 메시지, 광고 문구, DM 내용을 붙여넣으세요.'
              }
              className="scrollbar-none w-full resize-none overflow-y-auto rounded-md border border-[#d6d9e2] bg-[#f8f9fb] px-3 py-3 text-sm leading-5 text-[#27304d] outline-none ring-0 placeholder:text-[#8a91a3] focus:border-[#7d87e8]"
            />
          )}

          {activeTab === 'url' && (
            <input
              value={urlValue}
              onChange={(event) => setUrlValue(event.target.value)}
              placeholder={isEnglish ? 'Paste the link to inspect.' : '검사할 링크를 입력하세요.'}
              className="w-full rounded-md border border-[#d6d9e2] bg-[#f8f9fb] px-3 py-3 text-sm leading-5 text-[#27304d] outline-none placeholder:text-[#8a91a3] focus:border-[#7d87e8]"
            />
          )}

          {activeTab === 'image' && (
            <label
              className={`flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center text-sm leading-5 transition-colors ${
                isDraggingImage
                  ? 'border-[#7d87e8] bg-[#eef0ff] text-[#3e478f]'
                  : 'border-[#cfd4df] bg-[#f8f9fb] text-[#596278]'
              }`}
              onDragEnter={(event) => {
                event.preventDefault()
                setIsDraggingImage(true)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
                setIsDraggingImage(true)
              }}
              onDragLeave={(event) => {
                event.preventDefault()
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return
                }
                setIsDraggingImage(false)
              }}
              onDrop={(event) => {
                event.preventDefault()
                setIsDraggingImage(false)
                handleDroppedImage(event.dataTransfer.files)
              }}
            >
              <span className="max-w-full break-words font-medium text-[#4e5971]">
                {imageFile ? imageFile.name : isEnglish ? 'Choose a screenshot or image.' : '스크린샷이나 이미지를 선택하세요.'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleDroppedImage(event.target.files)}
              />
            </label>
          )}
        </div>

        <button
          className="mt-3 min-h-11 w-full rounded-md bg-[#f2a14a] px-4 py-3 text-sm font-semibold leading-5 text-[#2c3470] disabled:cursor-not-allowed disabled:bg-[#d6d9e2]"
          disabled={!canAnalyze || loading}
          onClick={() => void runAnalyze()}
        >
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#2c3470]/25 border-t-[#2c3470]" />
              <span>{isEnglish ? 'Analyzing...' : '분석 중...'}</span>
            </span>
          ) : (
            isEnglish ? 'Run analysis' : '분석 실행'
          )}
        </button>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            className="min-h-10 rounded-md border border-[#d6d9e2] bg-white px-2 py-2 text-xs font-medium leading-4 text-[#4e5971]"
            onClick={() =>
              void runQuickAction(
                { type: 'analyze-active-selection' },
                isEnglish ? 'Analyzing selected text.' : '선택 텍스트를 분석 중입니다.',
              )
            }
          >
            {isEnglish ? 'Selection' : '선택 분석'}
          </button>
          <button
            className="min-h-10 rounded-md border border-[#d6d9e2] bg-white px-2 py-2 text-xs font-medium leading-4 text-[#4e5971]"
            onClick={() =>
              void runQuickAction(
                { type: 'capture-active-area' },
                isEnglish ? 'Drag the area to analyze on the page.' : '페이지 위에서 분석할 영역을 드래그하세요.',
              )
            }
          >
            {isEnglish ? 'Capture' : '영역 캡처'}
          </button>
          <button
            className="min-h-10 rounded-md border border-[#d6d9e2] bg-white px-2 py-2 text-xs font-medium leading-4 text-[#4e5971]"
            onClick={() =>
              void runQuickAction(
                { type: 'analyze-clipboard' },
                isEnglish ? 'Analyzing clipboard text.' : '클립보드 텍스트를 분석 중입니다.',
              )
            }
          >
            {isEnglish ? 'Clipboard' : '클립보드'}
          </button>
        </div>

        {statusMessage ? (
          <div className="mt-3 break-words text-xs leading-4 text-[#6c7488]">{statusMessage}</div>
        ) : null}
        {errorMessage ? <div className="mt-2 break-words text-xs leading-4 text-[#c46d2a]">{errorMessage}</div> : null}
      </section>
      )}

      {latestRecord ? (
        <div className="mt-3">
          <RecordCard record={latestRecord} locale={locale} />
        </div>
      ) : null}

      <section className="mt-3 rounded-lg border border-[#d6d9e2] bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[#2c3470]">{isEnglish ? 'Recent History' : '최근 기록'}</div>
          <button
            className="text-xs font-medium text-[#6d78d6]"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            {isEnglish ? 'View all' : '전체 보기'}
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {history.slice(0, 3).map((record) => (
            <button
              key={record.id}
              className="w-full rounded-md border border-[#d6d9e2] bg-[#f8f9fb] px-3 py-2 text-left"
              onClick={() => setLatestRecord(record)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 break-words text-sm font-medium leading-5 text-[#27304d]">
                  {buildRecordTitle(
                    record.result.primaryType,
                    record.input.rawText || record.ocrText,
                    locale,
                    isNeutralAnalysisResult(record.result),
                  )}
                </div>
                <div className="shrink-0 text-xs font-semibold text-[#6d78d6]">
                  {formatScore(record.result.score)}
                </div>
              </div>
              <div className="mt-1 text-xs leading-4 text-[#6c7488]">
                {formatDateTime(record.createdAt, locale)}
              </div>
            </button>
          ))}
          {history.length === 0 ? (
            <div className="rounded-md bg-[#f8f9fb] px-3 py-3 text-sm text-[#6c7488]">
              {isEnglish ? 'No saved records yet.' : '저장된 기록이 없습니다.'}
            </div>
          ) : null}
        </div>
      </section>

      <div className="mt-3 break-words px-1 pb-2 text-[11px] leading-5 text-[#6c7488]">
        {getDisclaimerText(locale)}
      </div>
    </main>
  )
}
