import type {
  AnalysisInput,
  AnalysisResult,
  ProviderKind,
  ProviderSecrets,
  ProviderState,
} from '@/shared/types'

export interface ProviderRiskContext {
  input: AnalysisInput
  rawText?: string
  result?: AnalysisResult
  webSearchEnabled: boolean
}

export interface ProviderRiskAnalysis {
  summary: string
  responseText: string
  evidence: string[]
  freshnessNote?: string
  extractedText?: string
}

export interface AIProviderAdapter {
  kind: Exclude<ProviderKind, 'local'>
  isConfigured(): boolean
  analyzeRisk(context: ProviderRiskContext): Promise<ProviderRiskAnalysis>
  supportsWebFreshnessCheck(): boolean
}

export function extractJsonObject(text: string) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fencedMatch?.[1] ?? text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('JSON 응답을 찾지 못했습니다.')
  }

  return candidate.slice(start, end + 1)
}

export abstract class BaseProviderAdapter implements AIProviderAdapter {
  abstract kind: Exclude<ProviderKind, 'local'>
  protected readonly state: ProviderState
  protected readonly secrets: ProviderSecrets

  constructor(state: ProviderState, secrets: ProviderSecrets) {
    this.state = state
    this.secrets = secrets
  }

  abstract isConfigured(): boolean

  abstract analyzeRisk(context: ProviderRiskContext): Promise<ProviderRiskAnalysis>

  protected responseLanguageName() {
    return this.state.uiLocale === 'en' ? 'English' : '한국어'
  }

  supportsWebFreshnessCheck() {
    return false
  }

  protected buildRiskAnalysisRequest(context: ProviderRiskContext) {
    const rawText = (context.rawText ?? '').trim()
    const isImageOnly = !rawText && Boolean(context.input.imageDataUrl)
    const sourcePreview = rawText ? (rawText.length > 900 ? `${rawText.slice(0, 900)}...` : rawText) : ''
    const shouldUseWebSearch = context.webSearchEnabled && this.supportsWebFreshnessCheck()
    const result = context.result
    const localAnalysis = result
      ? [
          `${this.state.uiLocale === 'en' ? 'Score' : '점수'}: ${result.score}`,
          `${this.state.uiLocale === 'en' ? 'Grade' : '등급'}: ${result.grade}`,
          `${this.state.uiLocale === 'en' ? 'Primary type' : '주요 유형'}: ${result.primaryType}`,
          `${this.state.uiLocale === 'en' ? 'AI hook tags' : 'AI 후킹 태그'}: ${result.aiHookingChecklist.tags.slice(0, 3).join(', ') || '-'}`,
          `${this.state.uiLocale === 'en' ? 'Key signals' : '핵심 신호'}: ${result.signals.slice(0, 3).join(' | ') || '-'}`,
          `${this.state.uiLocale === 'en' ? 'Evidence sentences' : '근거 문장'}: ${result.evidenceSentences.slice(0, 2).join(' | ') || '-'}`,
        ].join('\n')
      : this.state.uiLocale === 'en'
        ? 'No local classification is available yet. Read the source faithfully and explain conservatively.'
        : '아직 로컬 판정이 없습니다. 원문을 충실히 읽고 보수적으로 설명하세요.'

    const prompt = [
      this.state.uiLocale === 'en'
        ? `You are K-WarningCheck's single-call LLM analysis assistant. Answer only in ${this.responseLanguageName()}.`
        : `당신은 K-워닝체크의 단일 호출 LLM 분석 보조기입니다. 반드시 ${this.responseLanguageName()}로만 답하세요.`,
      result
        ? this.state.uiLocale === 'en'
          ? 'The local regex/heuristic score, grade, and type are already fixed. Do not change or contradict them.'
          : '로컬 정규식/휴리스틱 점수, 등급, 유형은 이미 확정되었습니다. 이를 바꾸거나 반박하지 마세요.'
        : this.state.uiLocale === 'en'
          ? 'A local score is not available yet. First extract the source text faithfully, then explain the visible risk signals.'
          : '아직 로컬 점수가 없습니다. 먼저 원문 텍스트를 충실히 추출한 뒤, 보이는 위험 신호를 설명하세요.',
      shouldUseWebSearch
        ? this.state.uiLocale === 'en'
          ? 'Use web search only if you need to comment on AI model or version freshness. Prefer official sources.'
          : 'AI 모델 또는 버전 최신성 코멘트가 필요할 때만 웹 검색을 사용하고, 공식 출처를 우선하세요.'
        : this.state.uiLocale === 'en'
          ? 'Do not browse the web for this response.'
          : '이번 응답에서는 웹 검색을 사용하지 마세요.',
      isImageOnly
        ? this.state.uiLocale === 'en'
          ? 'This input is image-only. Read visible text first and put it in extractedText.'
          : '이번 입력은 이미지뿐입니다. 먼저 보이는 글자를 읽어서 extractedText에 넣으세요.'
        : this.state.uiLocale === 'en'
          ? 'Use the source text below as the primary evidence.'
          : '아래 원문 텍스트를 1차 근거로 사용하세요.',
      this.state.uiLocale === 'en'
        ? 'Return JSON only: {"summary":"one sentence","responseText":"max 3 sentences","evidence":["short evidence 1","short evidence 2"],"freshnessNote":"optional one sentence","extractedText":"optional source text"}'
        : '반드시 JSON만 반환하세요: {"summary":"1문장","responseText":"최대 3문장","evidence":["짧은 근거 1","짧은 근거 2"],"freshnessNote":"선택 1문장","extractedText":"선택 원문 텍스트"}',
      '',
      this.state.uiLocale === 'en' ? 'Local analysis' : '로컬 판정',
      localAnalysis,
      '',
      this.state.uiLocale === 'en' ? 'Source text' : '원문 텍스트',
      sourcePreview || (this.state.uiLocale === 'en' ? '(image-only input)' : '(이미지 전용 입력)'),
    ].join('\n')

    return {
      prompt,
      shouldUseWebSearch,
    }
  }

  protected parseRiskAnalysisResponse(
    rawResponse: string,
    context: ProviderRiskContext,
  ): ProviderRiskAnalysis {
    const fallbackSummary =
      context.result?.summary ??
      (this.state.uiLocale === 'en'
        ? 'The selected provider returned an analysis response.'
        : '선택한 제공자가 분석 응답을 반환했습니다.')

    try {
      const jsonText = extractJsonObject(rawResponse)
      const parsed = JSON.parse(jsonText) as Partial<ProviderRiskAnalysis>
      const responseText =
        typeof parsed.responseText === 'string' && parsed.responseText.trim()
          ? parsed.responseText.trim()
          : typeof parsed.summary === 'string' && parsed.summary.trim()
            ? parsed.summary.trim()
            : fallbackSummary

      return {
        summary:
          typeof parsed.summary === 'string' && parsed.summary.trim()
            ? parsed.summary.trim()
            : fallbackSummary,
        responseText,
        evidence: Array.isArray(parsed.evidence)
          ? parsed.evidence
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter(Boolean)
              .slice(0, 3)
          : [],
        freshnessNote:
          typeof parsed.freshnessNote === 'string' && parsed.freshnessNote.trim()
            ? parsed.freshnessNote.trim()
            : undefined,
        extractedText:
          typeof parsed.extractedText === 'string' && parsed.extractedText.trim()
            ? parsed.extractedText.trim()
            : undefined,
      }
    } catch {
      const responseText = rawResponse.trim() || fallbackSummary
      const summary =
        responseText.length > 140 ? `${responseText.slice(0, 140).trimEnd()}...` : responseText

      return {
        summary,
        responseText,
        evidence: [],
      }
    }
  }
}
