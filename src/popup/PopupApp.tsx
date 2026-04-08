import { useEffect, useMemo, useState } from 'react'
import { RecordCard } from '@/popup/components/RecordCard'
import { ScoreGauge } from '@/popup/components/ScoreGauge'
import { DISCLAIMER_TEXT } from '@/shared/constants'
import { DEFAULT_PROVIDER_STATE } from '@/shared/defaults'
import { formatDateTime, formatScore } from '@/shared/formatters'
import { sendRuntimeMessage } from '@/shared/runtime'
import type { AnalysisInput, ProviderState, RuntimeMessage, StoredAnalysisRecord } from '@/shared/types'

type PopupTab = 'text' | 'url' | 'image'

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
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
  const [isDraggingImage, setIsDraggingImage] = useState(false)

  useEffect(() => {
    void (async () => {
      const [latest, records, loadedProviderState] = await Promise.all([
        sendRuntimeMessage<StoredAnalysisRecord | null>({ type: 'get-latest-record' }),
        sendRuntimeMessage<StoredAnalysisRecord[]>({ type: 'get-history' }),
        sendRuntimeMessage<ProviderState>({ type: 'get-provider-state' }),
      ])

      setLatestRecord(latest)
      setHistory(records)
      setProviderState(loadedProviderState)
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

  async function runAnalyze() {
    setLoading(true)
    setErrorMessage('')

    try {
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
          throw new Error('이미지를 선택해 주세요.')
        }

        input = {
          source: 'image',
          imageDataUrl: await fileToDataUrl(imageFile),
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
      setErrorMessage(error instanceof Error ? error.message : '분석에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function runQuickAction(message: RuntimeMessage, status: string) {
    setLoading(true)
    setErrorMessage('')
    setStatusMessage(status)

    try {
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
      setErrorMessage(error instanceof Error ? error.message : '작업에 실패했습니다.')
      setLoading(false)
    }
  }

  async function changePreferredProvider(nextProvider: ProviderState['preferredProvider']) {
    const nextState = {
      ...providerState,
      preferredProvider: nextProvider,
    }

    setProviderState(nextState)
    setStatusMessage(`기본 제공자를 ${nextProvider}로 바꿨습니다.`)

    try {
      setProviderState(
        await sendRuntimeMessage<ProviderState>({
          type: 'save-provider-state',
          state: nextState,
        }),
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '제공자 설정 저장에 실패했습니다.')
    }
  }

  function handleDroppedImage(fileList: FileList | null) {
    const file = fileList?.[0] ?? null

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setErrorMessage('이미지 파일만 업로드할 수 있습니다.')
      return
    }

    setErrorMessage('')
    setImageFile(file)
    setActiveTab('image')
  }

  return (
    <main className="mx-auto h-[960px] w-[420px] max-w-[420px] overflow-y-auto overflow-x-hidden bg-[#f4f5f8] px-3 py-3 text-[#27304d]">
      <header className="mb-3 flex items-center justify-between gap-3 border-b border-[#cfd4df] pb-2">
        <div className="min-w-0 pr-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6d78d6]">
            K-WarningCheck
          </div>
          <h1 className="mt-1 text-xl font-semibold text-[#2c3470]">K-워닝체크</h1>
        </div>
        <button
          aria-label="설정"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#cfd4df] bg-white text-[#4e5971]"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M19.4 15a8.2 8.2 0 0 0 .1-1.2V10.2a8.2 8.2 0 0 0-.1-1.2l-2.1-.8a6.6 6.6 0 0 0-.8-1.3l.3-2.2a8.5 8.5 0 0 0-3.1-1.8L12 4.3a6.9 6.9 0 0 0-1.6 0L8.7 2.9a8.5 8.5 0 0 0-3.1 1.8l.3 2.2c-.3.4-.6.8-.8 1.3L3 9a8.2 8.2 0 0 0-.1 1.2v3.6A8.2 8.2 0 0 0 3 15l2.1.8c.2.5.5.9.8 1.3l-.3 2.2a8.5 8.5 0 0 0 3.1 1.8l1.7-1.4a6.9 6.9 0 0 0 1.6 0l1.7 1.4a8.5 8.5 0 0 0 3.1-1.8l-.3-2.2c.3-.4.6-.8.8-1.3l2.1-.8Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      {latestRecord ? (
        <ScoreGauge
          score={latestRecord.result.score}
          grade={latestRecord.result.grade}
          primaryType={latestRecord.result.primaryType}
        />
      ) : null}

      <section className="mt-3 rounded-lg border border-[#d6d9e2] bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="shrink-0 text-sm font-semibold text-[#2c3470]">분석 입력</h2>
          <label className="min-w-0 flex flex-1 items-center justify-end gap-2 text-xs text-[#6c7488]">
            <span className="shrink-0">제공자</span>
            <select
              value={providerState.preferredProvider}
              onChange={(event) =>
                void changePreferredProvider(event.target.value as ProviderState['preferredProvider'])
              }
              className="min-w-0 rounded-md border border-[#d6d9e2] bg-[#f8f9fb] px-2 py-1.5 text-xs font-medium text-[#27304d] outline-none"
            >
              <option value="codex">Codex</option>
              <option value="gemini">Gemini</option>
              <option value="groq">Groq</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
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
              {tab === 'text' ? '텍스트' : tab === 'url' ? 'URL' : '이미지'}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {activeTab === 'text' && (
            <textarea
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              rows={6}
              placeholder="수상한 메시지, 광고 문구, DM 내용을 붙여넣으세요."
              className="w-full resize-none rounded-md border border-[#d6d9e2] bg-[#f8f9fb] px-3 py-3 text-sm leading-5 text-[#27304d] outline-none ring-0 placeholder:text-[#8a91a3] focus:border-[#7d87e8]"
            />
          )}

          {activeTab === 'url' && (
            <input
              value={urlValue}
              onChange={(event) => setUrlValue(event.target.value)}
              placeholder="검사할 링크를 입력하세요."
              className="w-full rounded-md border border-[#d6d9e2] bg-[#f8f9fb] px-3 py-3 text-sm leading-5 text-[#27304d] outline-none placeholder:text-[#8a91a3] focus:border-[#7d87e8]"
            />
          )}

          {activeTab === 'image' && (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#cfd4df] bg-[#f8f9fb] px-4 py-8 text-center text-sm leading-5 text-[#596278]">
              <div
                className={`flex w-full flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center text-sm leading-5 transition-colors ${
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
                {imageFile ? imageFile.name : '스크린샷을 선택하세요.'}
                </span>
                <span className="mt-1 break-keep">
                  이미지를 끌어다 놓거나 클릭해서 선택하세요. OCR 후 같은 분석 엔진으로 검사합니다.
                </span>
              </div>
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
          {loading ? '분석 중...' : '분석 실행'}
        </button>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            className="min-h-10 rounded-md border border-[#d6d9e2] bg-white px-2 py-2 text-xs font-medium leading-4 text-[#4e5971]"
            onClick={() => void runQuickAction({ type: 'analyze-active-selection' }, '선택 텍스트를 분석 중입니다.')}
          >
            선택 분석
          </button>
          <button
            className="min-h-10 rounded-md border border-[#d6d9e2] bg-white px-2 py-2 text-xs font-medium leading-4 text-[#4e5971]"
            onClick={() => void runQuickAction({ type: 'capture-active-area' }, '페이지 위에서 분석할 영역을 드래그하세요.')}
          >
            영역 캡처
          </button>
          <button
            className="min-h-10 rounded-md border border-[#d6d9e2] bg-white px-2 py-2 text-xs font-medium leading-4 text-[#4e5971]"
            onClick={() => void runQuickAction({ type: 'analyze-clipboard' }, '클립보드 텍스트를 분석 중입니다.')}
          >
            클립보드
          </button>
        </div>

        {statusMessage ? (
          <div className="mt-3 break-words text-xs leading-4 text-[#6c7488]">{statusMessage}</div>
        ) : null}
        {errorMessage ? <div className="mt-2 break-words text-xs leading-4 text-[#c46d2a]">{errorMessage}</div> : null}
      </section>

      {latestRecord ? (
        <div className="mt-3">
          <RecordCard record={latestRecord} />
        </div>
      ) : null}

      <section className="mt-3 rounded-lg border border-[#d6d9e2] bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[#2c3470]">최근 기록</div>
          <button
            className="text-xs font-medium text-[#6d78d6]"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            전체 보기
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
                  {record.result.primaryType}
                </div>
                <div className="shrink-0 text-xs font-semibold text-[#6d78d6]">
                  {formatScore(record.result.score)}
                </div>
              </div>
              <div className="mt-1 text-xs leading-4 text-[#6c7488]">
                {formatDateTime(record.createdAt)}
              </div>
            </button>
          ))}
          {history.length === 0 ? (
            <div className="rounded-md bg-[#f8f9fb] px-3 py-3 text-sm text-[#6c7488]">
              저장된 기록이 없습니다.
            </div>
          ) : null}
        </div>
      </section>

      <div className="mt-3 break-words px-1 pb-2 text-[11px] leading-5 text-[#6c7488]">
        {DISCLAIMER_TEXT}
      </div>
    </main>
  )
}
