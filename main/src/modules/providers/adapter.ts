import type {
  AnalysisInput,
  AnalysisResult,
  ProviderKind,
  ProviderSecrets,
  ProviderState,
  WebFreshnessVerification,
} from '@/shared/types'

export interface ExplanationContext {
  input: AnalysisInput
  rawText: string
  result: AnalysisResult
}

export interface AIProviderAdapter {
  kind: ProviderKind
  isConfigured(): boolean
  summarize(prompt: string): Promise<string>
  refineExplanation(context: ExplanationContext): Promise<string>
  assistOcr(text: string): Promise<string>
  extractTextFromImage(imageDataUrl: string): Promise<string>
  supportsWebFreshnessCheck(): boolean
  verifyFreshness(text: string): Promise<WebFreshnessVerification>
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
  abstract kind: ProviderKind
  protected readonly state: ProviderState
  protected readonly secrets: ProviderSecrets

  constructor(state: ProviderState, secrets: ProviderSecrets) {
    this.state = state
    this.secrets = secrets
  }

  abstract isConfigured(): boolean

  abstract summarize(prompt: string): Promise<string>

  protected responseLanguageName() {
    return this.state.uiLocale === 'en' ? 'English' : '한국어'
  }

  supportsWebFreshnessCheck() {
    return false
  }

  async refineExplanation(context: ExplanationContext) {
    const sourcePreview =
      context.rawText.length > 900 ? `${context.rawText.slice(0, 900)}...` : context.rawText

    return this.summarize(
      [
        this.state.uiLocale === 'en'
          ? 'Refine the following analysis into exactly one English sentence.'
          : '다음 분석 결과를 한국어 1문장으로만 다듬어 주세요.',
        this.state.uiLocale === 'en'
          ? 'Do not use legal certainty language and do not change the underlying judgment.'
          : '법적 단정 표현은 쓰지 말고, 기존 판정 근거를 바꾸지 마세요.',
        '',
        `${this.state.uiLocale === 'en' ? 'Source excerpt' : '원문 일부'}: ${sourcePreview}`,
        `${this.state.uiLocale === 'en' ? 'Score' : '점수'}: ${context.result.score}`,
        `${this.state.uiLocale === 'en' ? 'Grade' : '등급'}: ${context.result.grade}`,
        `${this.state.uiLocale === 'en' ? 'Primary type' : '주요 유형'}: ${context.result.primaryType}`,
        `${this.state.uiLocale === 'en' ? 'Current summary' : '기존 요약'}: ${context.result.summary}`,
      ].join('\n'),
    )
  }

  async assistOcr(text: string) {
    return this.summarize(
      [
        this.state.uiLocale === 'en'
          ? 'Clean up the following OCR output into readable English or source text.'
          : '다음 OCR 결과를 한국어 문장으로 정리해 주세요.',
        this.state.uiLocale === 'en'
          ? 'Do not change the meaning. Only fix spacing and obvious OCR mistakes.'
          : '뜻을 바꾸지 말고 띄어쓰기와 명백한 오인식만 바로잡아 주세요.',
        '',
        text,
      ].join('\n'),
    )
  }

  extractTextFromImage(imageDataUrl: string): Promise<string> {
    void imageDataUrl
    return Promise.reject(new Error('이 제공자는 이미지 OCR을 지원하지 않습니다.'))
  }

  verifyFreshness(text: string): Promise<WebFreshnessVerification> {
    void text
    return Promise.reject(new Error('이 제공자는 웹 검색 기반 최신성 검증을 지원하지 않습니다.'))
  }
}
