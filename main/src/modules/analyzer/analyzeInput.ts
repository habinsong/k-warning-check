import { analyzeText } from '@/modules/analyzer/analyzeText'
import { createSelectedProvider } from '@/modules/providers/factory'
import type {
  AnalysisInput,
  AnalysisResult,
  LlmAnalysis,
  ProviderSecrets,
  ProviderState,
  ProviderUsage,
  StoredAnalysisRecord,
  WebFreshnessVerification,
} from '@/shared/types'

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 제한 시간을 초과했습니다.`)), timeoutMs),
    ),
  ])
}

const OUTDATED_RELATED_TAGS = new Set(['구식 정보 재탕', '모델 정보 최신성 낮음'])
const KNOWN_MODEL_TERM_PATTERN =
  /\b(?:Claude|GPT|Gemini|Gemma|GLM|Qwen|Llama|Sonnet|Opus|Haiku|DeepSeek|Mistral)\b/i
const QUOTED_MODEL_NAME_PATTERN = /['"`][A-Z][A-Za-z0-9.+-]{2,}['"`]/i
const PREVIEW_MODEL_NAME_PATTERN = /\b[A-Z][A-Za-z0-9.+-]{2,}\s+Preview\b/i

function shouldRunWebFreshnessCheck(text: string, result: AnalysisResult) {
  return (
    KNOWN_MODEL_TERM_PATTERN.test(text) ||
    QUOTED_MODEL_NAME_PATTERN.test(text) ||
    PREVIEW_MODEL_NAME_PATTERN.test(text) ||
    result.primaryType === '구식 모델/최신성 부족' ||
    result.aiHookingChecklist.tags.some((tag) => OUTDATED_RELATED_TAGS.has(tag)) ||
    result.dimensionScores.factualityRisk >= 35
  )
}

function responsePreview(text: string) {
  const trimmed = text.trim()
  return trimmed.length > 180 ? `${trimmed.slice(0, 180)}...` : trimmed
}

function providerTimeoutMs(
  kind: ProviderUsage['provider'],
  options: {
    useWebSearch: boolean
    hasImage: boolean
  },
) {
  if (kind === 'codex') {
    return options.hasImage ? 30_000 : 22_000
  }

  if (options.useWebSearch) {
    return kind === 'gemini' ? 35_000 : 30_000
  }

  return options.hasImage ? 24_000 : 20_000
}

function buildSkippedMessage(providerState: ProviderState) {
  if (providerState.uiLocale === 'en') {
    if (providerState.preferredProvider === 'codex') {
      return 'Codex is not configured, so the LLM analysis was skipped.'
    }

    if (providerState.preferredProvider === 'gemini') {
      return 'Gemini is not configured, so the LLM analysis was skipped.'
    }

    return 'Groq is not configured, so the LLM analysis was skipped.'
  }

  if (providerState.preferredProvider === 'codex') {
    return 'Codex 연결이 설정되지 않아 LLM 분석을 건너뛰었습니다.'
  }

  if (providerState.preferredProvider === 'gemini') {
    return 'Gemini API 키가 설정되지 않아 LLM 분석을 건너뛰었습니다.'
  }

  return 'Groq API 키가 설정되지 않아 LLM 분석을 건너뛰었습니다.'
}

function buildImageProviderRequiredMessage(providerState: ProviderState) {
  if (providerState.uiLocale === 'en') {
    if (providerState.preferredProvider === 'codex') {
      return 'Set up Codex before running image analysis.'
    }

    if (providerState.preferredProvider === 'gemini') {
      return 'Save the Gemini API key before running image analysis.'
    }

    return 'Save the Groq API key before running image analysis.'
  }

  if (providerState.preferredProvider === 'codex') {
    return '이미지 분석을 하려면 Codex 연결을 먼저 설정해 주세요.'
  }

  if (providerState.preferredProvider === 'gemini') {
    return '이미지 분석을 하려면 Gemini API 키를 먼저 저장해 주세요.'
  }

  return '이미지 분석을 하려면 Groq API 키를 먼저 저장해 주세요.'
}

function buildSkippedLlmAnalysis(providerState: ProviderState): LlmAnalysis {
  return {
    provider: providerState.preferredProvider,
    status: 'skipped',
    durationMs: 0,
    responseText: '',
    evidence: [],
    error: buildSkippedMessage(providerState),
  }
}

function applyLlmSummary(
  result: AnalysisResult,
  providerState: ProviderState,
  summary: string,
): AnalysisResult {
  const nextSummary = summary.trim()

  if (!nextSummary) {
    return result
  }

  return {
    ...result,
    summaryOverrideLocale: providerState.uiLocale,
    summaryOverrideText: nextSummary,
    summary: nextSummary,
  }
}

function applyWebFreshnessNote(
  result: AnalysisResult,
  providerState: ProviderState,
  note: string,
): AnalysisResult {
  const summary = note.trim()

  if (!summary) {
    return result
  }

  return {
    ...result,
    webFreshnessVerification: {
      status: 'inconclusive',
      messageKey: 'provider',
      providerSummaryLocale: providerState.uiLocale,
      providerSummaryText: summary,
      summary,
      checkedClaims: [],
      references: [],
    },
  }
}

function buildInconclusiveFreshness(
  summary: string,
  messageKey: 'provider' | 'skipped_no_provider' | 'failed',
  providerState: ProviderState,
): WebFreshnessVerification {
  return {
    status: 'inconclusive' as const,
    messageKey,
    providerSummaryLocale: messageKey === 'provider' ? providerState.uiLocale : undefined,
    providerSummaryText: messageKey === 'provider' ? summary : undefined,
    summary,
    checkedClaims: [],
    references: [],
  }
}

export async function analyzeInput(
  input: AnalysisInput,
  providerState: ProviderState,
  providerSecrets: ProviderSecrets,
): Promise<StoredAnalysisRecord> {
  let sourceText = input.rawText?.trim() ?? input.selectedText?.trim() ?? ''
  let ocrText = ''
  const providerUsage: ProviderUsage[] = []
  const selectedProvider = createSelectedProvider(providerState, providerSecrets)
  const isImageOnlyInput = !sourceText && Boolean(input.imageDataUrl)
  let llmAnalysis: LlmAnalysis | undefined
  let requestedWebFreshness = false

  if (input.source === 'url' && input.rawText) {
    sourceText = input.rawText
  }

  const missingFreshnessNoteMessage =
    providerState.uiLocale === 'en'
      ? 'The selected LLM did not return a freshness note.'
      : '선택한 LLM이 최신성 코멘트를 반환하지 않았습니다.'
  const groqFreshnessSkippedMessage =
    providerState.uiLocale === 'en'
      ? 'The selected Groq path does not run web freshness verification in this single-call mode, so it was skipped.'
      : '선택한 Groq 경로는 단일 호출 모드에서 웹 최신성 검증을 수행하지 않아 건너뛰었습니다.'
  const unsupportedFreshnessMessage =
    providerState.uiLocale === 'en'
      ? 'The selected provider does not support web freshness verification, so it was skipped.'
      : providerState.preferredProvider === 'codex'
        ? '선택한 Codex 제공자는 웹 검색 최신성 검증을 지원하지 않아 건너뛰었습니다.'
        : '선택한 제공자가 웹 검색 최신성 검증을 지원하지 않아 건너뛰었습니다.'

  if (isImageOnlyInput) {
    if (!selectedProvider) {
      throw new Error(buildImageProviderRequiredMessage(providerState))
    }

    const useWebSearch =
      providerState.webSearchEnabled &&
      selectedProvider.supportsWebFreshnessCheck() &&
      selectedProvider.kind === 'gemini'
    requestedWebFreshness = useWebSearch
    const durationStart = Date.now()

    try {
      const llmResult = await withTimeout(
        selectedProvider.analyzeRisk({
          input,
          webSearchEnabled: useWebSearch,
        }),
        providerTimeoutMs(selectedProvider.kind, {
          useWebSearch,
          hasImage: true,
        }),
        `${selectedProvider.kind} 분석`,
      )
      const durationMs = Date.now() - durationStart
      sourceText = llmResult.extractedText?.trim() ?? ''
      ocrText = sourceText

      if (!sourceText) {
        throw new Error('이미지에서 텍스트를 추출하지 못했습니다.')
      }

      providerUsage.push({
        provider: selectedProvider.kind,
        operations: ['analyzeRisk'],
        success: true,
        durationMs,
        responsePreview: responsePreview(llmResult.responseText),
      })
      llmAnalysis = {
        provider: selectedProvider.kind,
        status: 'success',
        durationMs,
        responseText: llmResult.responseText,
        evidence: llmResult.evidence,
        freshnessNote: llmResult.freshnessNote,
      }
    } catch (error) {
      const durationMs = Date.now() - durationStart
      const message = error instanceof Error ? error.message : 'LLM 이미지 분석에 실패했습니다.'
      providerUsage.push({
        provider: selectedProvider.kind,
        operations: ['analyzeRisk'],
        success: false,
        durationMs,
        error: message,
      })
      throw new Error(message)
    }
  }

  if (!sourceText) {
    throw new Error('분석할 텍스트를 찾지 못했습니다.')
  }

  let result = analyzeText(sourceText)
  const wantsWebFreshness =
    providerState.webSearchEnabled && shouldRunWebFreshnessCheck(sourceText, result)

  if (!llmAnalysis) {
    if (!selectedProvider) {
      llmAnalysis = buildSkippedLlmAnalysis(providerState)
      providerUsage.push({
        provider: providerState.preferredProvider,
        operations: ['analyzeRisk'],
        success: false,
        durationMs: 0,
        error: llmAnalysis.error,
      })
    } else {
      const useWebSearch =
        wantsWebFreshness &&
        selectedProvider.supportsWebFreshnessCheck() &&
        selectedProvider.kind === 'gemini'
      requestedWebFreshness = useWebSearch
      const durationStart = Date.now()

      try {
        const llmResult = await withTimeout(
          selectedProvider.analyzeRisk({
            input,
            rawText: sourceText,
            result,
            webSearchEnabled: useWebSearch,
          }),
          providerTimeoutMs(selectedProvider.kind, {
            useWebSearch,
            hasImage: Boolean(input.imageDataUrl),
          }),
          `${selectedProvider.kind} 분석`,
        )
        const durationMs = Date.now() - durationStart

        providerUsage.push({
          provider: selectedProvider.kind,
          operations: ['analyzeRisk'],
          success: true,
          durationMs,
          responsePreview: responsePreview(llmResult.responseText),
        })
        llmAnalysis = {
          provider: selectedProvider.kind,
          status: 'success',
          durationMs,
          responseText: llmResult.responseText,
          evidence: llmResult.evidence,
          freshnessNote: llmResult.freshnessNote,
        }
        result = applyLlmSummary(result, providerState, llmResult.summary)
      } catch (error) {
        const durationMs = Date.now() - durationStart
        const message = error instanceof Error ? error.message : 'LLM 분석에 실패했습니다.'

        providerUsage.push({
          provider: selectedProvider.kind,
          operations: ['analyzeRisk'],
          success: false,
          durationMs,
          error: message,
        })
        llmAnalysis = {
          provider: selectedProvider.kind,
          status: 'failed',
          durationMs,
          responseText: '',
          evidence: [],
          error: message,
        }
      }
    }
  }

  if (wantsWebFreshness) {
    if (llmAnalysis?.status === 'success' && llmAnalysis.freshnessNote?.trim()) {
      result = applyWebFreshnessNote(result, providerState, llmAnalysis.freshnessNote)
    } else if (llmAnalysis?.status === 'success' && selectedProvider?.kind === 'groq') {
      result = {
        ...result,
        webFreshnessVerification: buildInconclusiveFreshness(
          groqFreshnessSkippedMessage,
          'skipped_no_provider',
          providerState,
        ),
      }
    } else if (
      llmAnalysis?.status === 'success' &&
      selectedProvider?.supportsWebFreshnessCheck() &&
      requestedWebFreshness
    ) {
      result = {
        ...result,
        webFreshnessVerification: buildInconclusiveFreshness(
          missingFreshnessNoteMessage,
          'provider',
          providerState,
        ),
      }
    } else if (!selectedProvider || !selectedProvider.supportsWebFreshnessCheck()) {
      result = {
        ...result,
        webFreshnessVerification: buildInconclusiveFreshness(
          unsupportedFreshnessMessage,
          'skipped_no_provider',
          providerState,
        ),
      }
    } else if (llmAnalysis?.status === 'failed') {
      result = {
        ...result,
        webFreshnessVerification: buildInconclusiveFreshness(
          `웹 최신성 검증을 시도했지만 실패했습니다. ${llmAnalysis.error ?? 'LLM 분석 실패'}`,
          'failed',
          providerState,
        ),
      }
    }
  }

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    input: {
      ...input,
      rawText: sourceText,
    },
    result,
    ocrText: ocrText || undefined,
    llmAnalysis,
    providerUsage,
  }
}
