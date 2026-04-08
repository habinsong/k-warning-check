import { useEffect, useMemo, useState } from 'react'
import { GradeBadge } from '@/popup/components/GradeBadge'
import { PRIVACY_WARNING_TEXT } from '@/shared/constants'
import { formatDateTime, formatScore } from '@/shared/formatters'
import {
  API_KEY_RETENTION_OPTIONS,
  CODEX_MODEL_OPTIONS,
  CODEX_REASONING_OPTIONS,
  GEMINI_MODEL_OPTIONS,
  GROQ_MODEL_OPTIONS,
  GROQ_TOOL_OPTIONS,
} from '@/shared/providerOptions'
import { sendRuntimeMessage } from '@/shared/runtime'
import type { GroqToolId, ProviderState, StoredAnalysisRecord } from '@/shared/types'

type SettingsTab = 'general' | 'api' | 'codex' | 'history'

interface CodexStatus {
  status?: string
  message?: string
  command?: string
}

function useProviderForm() {
  const [state, setState] = useState<ProviderState | null>(null)

  function update<K extends keyof ProviderState>(key: K, value: ProviderState[K]) {
    setState((current) => (current ? { ...current, [key]: value } : current))
  }

  return { state, setState, update }
}

export function OptionsApp() {
  const { state, setState, update } = useProviderForm()
  const [history, setHistory] = useState<StoredAnalysisRecord[]>([])
  const [statusMessage, setStatusMessage] = useState('설정을 불러오는 중입니다.')
  const [saving, setSaving] = useState(false)
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null)
  const [codexLoginOutput, setCodexLoginOutput] = useState('')
  const [codexAuthUrl, setCodexAuthUrl] = useState('')
  const [expandedRecordIds, setExpandedRecordIds] = useState<Set<string>>(() => new Set())
  const [groqModels, setGroqModels] = useState<string[]>([])
  const [groqModelStatus, setGroqModelStatus] = useState('')
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('general')

  useEffect(() => {
    void (async () => {
      const [providerState, records] = await Promise.all([
        sendRuntimeMessage<ProviderState>({ type: 'get-provider-state' }),
        sendRuntimeMessage<StoredAnalysisRecord[]>({ type: 'get-history' }),
      ])
      setState(providerState)
      setHistory(records)
      setStatusMessage('설정을 불러왔습니다.')
    })()
  }, [setState])

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

  async function saveSettings() {
    if (!state) {
      return
    }

    setSaving(true)
    try {
      const nextState = await sendRuntimeMessage<ProviderState>({
        type: 'save-provider-state',
        state,
      })
      setState(nextState)
      setStatusMessage('설정을 저장했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function checkCodexStatus() {
    setStatusMessage('Codex 브리지와 로그인 상태를 확인하는 중입니다.')

    try {
      const result = await sendRuntimeMessage<CodexStatus>({ type: 'get-codex-status' })
      setCodexStatus(result)
      setStatusMessage(result.status ?? 'Codex 연결 상태를 확인했습니다.')
    } catch (error) {
      setCodexStatus(null)
      setStatusMessage(error instanceof Error ? error.message : 'Codex 상태 확인에 실패했습니다.')
    }
  }

  async function startCodexLogin() {
    setStatusMessage('Codex 로그인을 시작하는 중입니다.')

    try {
      const result = await sendRuntimeMessage<{
        output?: string
        authUrl?: string
        message?: string
        alreadyLoggedIn?: boolean
        logPath?: string
      }>({ type: 'start-codex-login' })

      setCodexLoginOutput(
        [result.message, result.logPath ? `로그: ${result.logPath}` : '', result.output]
          .filter(Boolean)
          .join('\n'),
      )
      setCodexAuthUrl(result.authUrl ?? '')
      setStatusMessage(result.message ?? 'Codex 로그인 요청을 보냈습니다.')

      if (result.authUrl?.startsWith('https://auth.openai.com/oauth/authorize')) {
        await chrome.tabs.create({ url: result.authUrl })
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Codex 로그인 시작에 실패했습니다.')
    }
  }

  async function startCodexBridge() {
    setStatusMessage('Codex 브리지를 시작하는 중입니다.')

    try {
      const result = await sendRuntimeMessage<{
        message?: string
        bridgeRunning?: boolean
      }>({ type: 'start-codex-bridge' })

      setStatusMessage(result.message ?? 'Codex 브리지 시작 요청을 보냈습니다.')
      await checkCodexStatus()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Codex 브리지 시작에 실패했습니다.')
    }
  }

  async function loadGroqModels() {
    if (!state?.groq.apiKey.trim()) {
      setGroqModelStatus('Groq API 키를 먼저 입력해 주세요.')
      return
    }

    setGroqModelStatus('Groq 모델 목록을 불러오는 중입니다.')

    try {
      const response = await fetch(`${state.groq.endpoint}/models`, {
        headers: {
          Authorization: `Bearer ${state.groq.apiKey}`,
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

      const models = (data.data ?? []).map((model) => model.id).filter(Boolean) as string[]
      setGroqModels(models)
      setGroqModelStatus(`${models.length}개 모델을 불러왔습니다.`)
    } catch (error) {
      setGroqModelStatus(error instanceof Error ? error.message : 'Groq 모델 목록을 불러오지 못했습니다.')
    }
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
    setStatusMessage('기록을 다시 분석했습니다.')
  }

  function toggleHistoryRecord(id: string) {
    setExpandedRecordIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (!state) {
    return <main className="p-6 text-sm text-slate-500">설정을 불러오는 중입니다.</main>
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-6 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">
              K-WarningCheck
            </div>
            <h1 className="mt-1 text-3xl font-semibold">설정 및 기록 관리</h1>
            <p className="mt-2 text-sm text-slate-500">
              Gemini API 키와 모델, Codex 연결, 상세 이력을 관리합니다.
            </p>
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium leading-5 text-white"
            onClick={() => void saveSettings()}
          >
            <span aria-hidden="true">💾</span>
            <span>{saving ? '저장 중...' : '설정 저장'}</span>
          </button>
        </header>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {PRIVACY_WARNING_TEXT}
        </div>

        <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          {[
            ['general', '기본'],
            ['api', 'API 제공자'],
            ['codex', 'Codex'],
            ['history', '분석 기록'],
          ].map(([tab, label]) => (
            <button
              key={tab}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                activeSettingsTab === tab
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-50 text-slate-600'
              }`}
              onClick={() => setActiveSettingsTab(tab as SettingsTab)}
            >
              {label}
            </button>
          ))}
        </nav>

        {activeSettingsTab !== 'history' ? (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="contents">
            <div className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${activeSettingsTab === 'general' ? '' : 'hidden'}`}>
              <h2 className="text-lg font-semibold">원격 보조 동작</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="font-medium">기본 제공자</div>
                  <select
                    value={state.preferredProvider}
                    onChange={(event) =>
                      update('preferredProvider', event.target.value as ProviderState['preferredProvider'])
                    }
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <option value="codex">Codex</option>
                    <option value="gemini">Gemini</option>
                    <option value="groq">Groq</option>
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={state.autoUseConfiguredProviders}
                    onChange={(event) => update('autoUseConfiguredProviders', event.target.checked)}
                  />
                  <span>설정 후 자동 사용</span>
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={state.remoteExplanationEnabled}
                    onChange={(event) => update('remoteExplanationEnabled', event.target.checked)}
                  />
                  <span>설명 다듬기 사용</span>
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={state.remoteOcrEnabled}
                    onChange={(event) => update('remoteOcrEnabled', event.target.checked)}
                  />
                  <span>OCR 보조 사용</span>
                </label>
              </div>
            </div>

            <div className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${activeSettingsTab === 'api' ? '' : 'hidden'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Gemini 설정</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    2026년 4월 8일 기준 Google AI 문서의 Gemini 3 계열 모델 선택지입니다.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  API 키만 사용
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                <input
                  type="password"
                  value={state.gemini.apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  onCopy={(event) => event.preventDefault()}
                  onCut={(event) => event.preventDefault()}
                  onDragStart={(event) => event.preventDefault()}
                  onChange={(event) =>
                    setState((current) =>
                      current
                        ? { ...current, gemini: { ...current.gemini, apiKey: event.target.value } }
                        : current,
                    )
                  }
                  placeholder="Gemini API 키"
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
                      {option.label} · {option.description}
                    </option>
                  ))}
                </select>
                <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  현재 선택: <span className="font-semibold text-slate-900">{selectedGeminiOption?.label}</span>
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
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
                  API 키는 WebCrypto AES-GCM으로 암호화해 저장하고, 선택한 보관 기간이 지나면 자동 초기화합니다.
                </div>
              </div>
            </div>

            <div className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${activeSettingsTab === 'api' ? '' : 'hidden'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Groq 설정</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    기본 모델은 Compound입니다. 권장 모델은 Compound와 Compound Mini입니다.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  API 키만 사용
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                <input
                  type="password"
                  value={state.groq.apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  onCopy={(event) => event.preventDefault()}
                  onCut={(event) => event.preventDefault()}
                  onDragStart={(event) => event.preventDefault()}
                  onChange={(event) =>
                    setState((current) =>
                      current
                        ? { ...current, groq: { ...current.groq, apiKey: event.target.value } }
                        : current,
                    )
                  }
                  placeholder="Groq API 키"
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
                          {option ? `${option.label} · ${option.description}` : model}
                        </option>
                      )
                    })}
                  </select>
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                    onClick={() => void loadGroqModels()}
                  >
                    모델 불러오기
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
                  placeholder="Groq 모델 ID 직접 입력"
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
                      {option.label}
                    </option>
                  ))}
                </select>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-sm font-medium text-slate-700">Groq 내장 도구</div>
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
                        <span>{tool.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 text-xs leading-5 text-slate-500">
                    Compound 계열은 웹검색, 코드 실행, 웹사이트 방문, 브라우저 자동화, Wolfram Alpha를 내장 도구로 사용할 수 있습니다.
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
                  {groqModelStatus || 'Groq 모델 목록은 API 키 입력 후 불러올 수 있습니다. 모델 ID 직접 입력도 가능합니다.'}
                </div>
              </div>
            </div>

            <div className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${activeSettingsTab === 'codex' ? '' : 'hidden'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Codex 연결</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    OpenAI 계열 보조는 로컬 Codex CLI의 OAuth 로그인 세션을 사용합니다.
                  </p>
                </div>
                <button
                  className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white"
                  onClick={() => void checkCodexStatus()}
                >
                  연결 확인
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                    onClick={() => void startCodexLogin()}
                  >
                    Codex OAuth 로그인
                  </button>
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!codexAuthUrl}
                    onClick={() =>
                      codexAuthUrl.startsWith('https://auth.openai.com/oauth/authorize') &&
                      chrome.tabs.create({ url: codexAuthUrl })
                    }
                  >
                    OAuth 페이지 열기
                  </button>
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                    onClick={() => void startCodexBridge()}
                  >
                    브리지 시작
                  </button>
                </div>

                <input
                  value={state.codex.bridgeUrl}
                  onChange={(event) =>
                    setState((current) =>
                      current
                        ? { ...current, codex: { ...current.codex, bridgeUrl: event.target.value } }
                        : current,
                    )
                  }
                  placeholder="Codex 브리지 URL"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                />

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
                  placeholder="Codex 실행 작업 디렉토리"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                    <div className="font-medium text-slate-700">Codex 모델</div>
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
                          {option.label} · {option.description}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs leading-4 text-slate-500">
                      현재 선택: {selectedCodexModelOption?.label ?? state.codex.model}
                    </div>
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                    <div className="font-medium text-slate-700">이성/추론 강도</div>
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
                          {option.label} · {option.description}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs leading-4 text-slate-500">
                      현재 선택: {selectedCodexReasoningOption?.label ?? state.codex.reasoningEffort}
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
                  {codexStatus?.status ?? 'Codex 상태를 아직 확인하지 않았습니다.'}
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
          </div>

          <aside className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${activeSettingsTab === 'general' || activeSettingsTab === 'codex' ? '' : 'hidden'}`}>
            <h2 className="text-lg font-semibold">현재 상태</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">기본 제공자</dt>
                <dd className="font-medium text-slate-900">{state.preferredProvider}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Gemini 모델</dt>
                <dd className="font-medium text-slate-900">{state.gemini.model}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Groq 모델</dt>
                <dd className="font-medium text-slate-900">{state.groq.model}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Codex 모델</dt>
                <dd className="font-medium text-slate-900">{state.codex.model}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Codex 추론</dt>
                <dd className="font-medium text-slate-900">{state.codex.reasoningEffort}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">설명 보조</dt>
                <dd className="font-medium text-slate-900">
                  {state.remoteExplanationEnabled ? '사용' : '미사용'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">OCR 보조</dt>
                <dd className="font-medium text-slate-900">
                  {state.remoteOcrEnabled ? '사용' : '미사용'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Codex 브리지</dt>
                <dd className="font-medium text-slate-900">
                  {codexStatus?.status ?? '미확인'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">저장 기록 수</dt>
                <dd className="font-medium text-slate-900">{history.length}건</dd>
              </div>
            </dl>
            <div className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {statusMessage}
            </div>
            <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
              공식 기준 참고:
              <br />
              Google AI Gemini 3 문서 기준 모델명 사용
              <br />
              OpenAI 계열 보조는 `codex login` 기준 로컬 OAuth 세션 사용
            </div>
          </aside>
        </section>
        ) : null}

        {activeSettingsTab === 'history' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">분석 기록</h2>
              <p className="mt-1 text-sm text-slate-500">
                최근 50건까지 입력 원문, OCR 결과, 분석 결과를 보관합니다.
              </p>
            </div>
            <button
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600"
              onClick={() => void clearAllHistory()}
            >
              전체 삭제
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {history.map((record) => {
              const isExpanded = expandedRecordIds.has(record.id)

              return (
                <article
                  key={record.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <button
                    className="flex w-full items-center justify-between gap-3 text-left"
                    onClick={() => toggleHistoryRecord(record.id)}
                  >
                    <div className="min-w-0">
                      <div className="break-words text-base font-semibold leading-6 text-slate-900">
                        {record.result.primaryType}
                      </div>
                      <div className="mt-1 text-xs leading-4 text-slate-500">
                        {formatDateTime(record.createdAt)}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-slate-500">
                      {isExpanded ? '접기' : '펼치기'}
                    </span>
                  </button>

                  {isExpanded ? (
                    <>
                      <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t border-slate-200 pt-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <GradeBadge grade={record.result.grade} />
                            <div className="text-sm font-semibold text-slate-900">
                              {formatScore(record.result.score)}
                            </div>
                          </div>
                          <div className="mt-2 break-words text-sm leading-6 text-slate-700">
                            {record.result.summary}
                          </div>
                          {record.result.dimensionScores ? (
                            <div className="mt-2 text-xs leading-5 text-slate-500">
                              사기성 {record.result.dimensionScores.scam}/100 · 바이럴성{' '}
                              {record.result.dimensionScores.virality}/100 · AI 냄새{' '}
                              {record.result.dimensionScores.aiSmell}/100 · 권위호소{' '}
                              {record.result.dimensionScores.authorityAppeal}/100
                            </div>
                          ) : null}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                            onClick={() => void reanalyzeRecord(record.id)}
                          >
                            재분석
                          </button>
                          <button
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                            onClick={() => void deleteHistoryRecord(record.id)}
                          >
                            삭제
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        <div className="rounded-lg bg-white px-3 py-3 text-sm text-slate-700">
                          <div className="text-xs font-semibold text-slate-500">입력 원문</div>
                          <div className="mt-2 whitespace-pre-wrap break-words">
                            {record.input.rawText || record.ocrText || '원문 없음'}
                          </div>
                        </div>
                        <div className="rounded-lg bg-white px-3 py-3 text-sm text-slate-700">
                          <div className="text-xs font-semibold text-slate-500">판별 기준점</div>
                          {(record.result.matchedBaselines ?? []).length > 0 ? (
                            <ul className="mt-2 space-y-2">
                              {(record.result.matchedBaselines ?? []).map((baseline) => (
                                <li key={baseline.id}>
                                  <div className="font-medium text-slate-900">{baseline.title}</div>
                                  <div className="text-xs text-slate-500">{baseline.sourceName}</div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="mt-2 text-slate-500">직접 매칭된 공식 기준점 없음</div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}
                </article>
              )
            })}

            {history.length === 0 ? (
              <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                저장된 기록이 없습니다.
              </div>
            ) : null}
          </div>
        </section>
        ) : null}
      </div>
    </main>
  )
}
