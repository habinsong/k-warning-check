import type { AnalysisInput, AnalysisResult, ProviderKind, ProviderState } from '@/shared/types'

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
}

export abstract class BaseProviderAdapter implements AIProviderAdapter {
  abstract kind: ProviderKind
  protected readonly state: ProviderState

  constructor(state: ProviderState) {
    this.state = state
  }

  abstract isConfigured(): boolean

  abstract summarize(prompt: string): Promise<string>

  async refineExplanation(context: ExplanationContext) {
    const sourcePreview =
      context.rawText.length > 900 ? `${context.rawText.slice(0, 900)}...` : context.rawText

    return this.summarize(
      [
        '다음 분석 결과를 한국어 1문장으로만 다듬어 주세요.',
        '법적 단정 표현은 쓰지 말고, 기존 판정 근거를 바꾸지 마세요.',
        '',
        `원문 일부: ${sourcePreview}`,
        `점수: ${context.result.score}`,
        `등급: ${context.result.grade}`,
        `주요 유형: ${context.result.primaryType}`,
        `기존 요약: ${context.result.summary}`,
      ].join('\n'),
    )
  }

  async assistOcr(text: string) {
    return this.summarize(
      [
        '다음 OCR 결과를 한국어 문장으로 정리해 주세요.',
        '뜻을 바꾸지 말고 띄어쓰기와 명백한 오인식만 바로잡아 주세요.',
        '',
        text,
      ].join('\n'),
    )
  }

  extractTextFromImage(imageDataUrl: string): Promise<string> {
    void imageDataUrl
    return Promise.reject(new Error('이 제공자는 이미지 OCR을 지원하지 않습니다.'))
  }
}
