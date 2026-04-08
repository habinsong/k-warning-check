import { analyzeText } from '@/modules/analyzer/analyzeText'
import type {
  AnalysisInput,
  AnalysisResult,
  ProviderState,
  ProviderUsage,
  StoredAnalysisRecord,
} from '@/shared/types'
import { createConfiguredProviders, createExplanationAssistant } from '@/modules/providers/factory'

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 제한 시간을 초과했습니다.`)), timeoutMs),
    ),
  ])
}

export async function analyzeInput(
  input: AnalysisInput,
  providerState: ProviderState,
): Promise<StoredAnalysisRecord> {
  let sourceText = input.rawText?.trim() ?? input.selectedText?.trim() ?? ''
  let ocrText = ''
  const providerUsage: ProviderUsage[] = []

  const assistant = createExplanationAssistant(providerState)
  const configuredProviders = createConfiguredProviders(providerState)

  if (input.source === 'url' && input.rawText) {
    sourceText = input.rawText
  }

  if (!sourceText && input.imageDataUrl) {
    if (configuredProviders.length === 0) {
      throw new Error(
        '이미지 분석에는 멀티모달 제공자가 필요합니다. Gemini 또는 Groq API 키를 입력하거나 Codex 브리지를 연결해 주세요.',
      )
    }

    const providerErrors: string[] = []

    for (const provider of configuredProviders) {
      try {
        sourceText = await withTimeout(
          provider.extractTextFromImage(input.imageDataUrl),
          provider.kind === 'codex' ? 35_000 : 22_000,
          `${provider.kind} 이미지 인식`,
        )
        ocrText = sourceText
        providerUsage.push({
          provider: provider.kind,
          operations: ['assistOcr'],
          success: true,
        })
        break
      } catch (error) {
        const message = error instanceof Error ? error.message : '이미지 인식 실패'
        providerErrors.push(`${provider.kind}: ${message}`)
        providerUsage.push({
          provider: provider.kind,
          operations: ['assistOcr'],
          success: false,
          error: message,
        })
      }
    }

    if (!sourceText.trim()) {
      throw new Error(
        `이미지 인식에 실패했습니다. ${providerErrors.join(' | ')}`.trim(),
      )
    }
  }

  if (!sourceText) {
    throw new Error('분석할 텍스트를 찾지 못했습니다.')
  }

  let result: AnalysisResult = analyzeText(sourceText)

  if (providerState.remoteExplanationEnabled && assistant) {
    try {
      const refinedSummary = await withTimeout(
        assistant.refineExplanation({
          input,
          rawText: sourceText,
          result,
        }),
        10_000,
        '설명 보조',
      )

      result = {
        ...result,
        summary: refinedSummary || result.summary,
      }

      providerUsage.push({
        provider: assistant.kind,
        operations: ['refineExplanation'],
        success: true,
      })
    } catch (error) {
      providerUsage.push({
        provider: assistant.kind,
        operations: ['refineExplanation'],
        success: false,
        error: error instanceof Error ? error.message : '설명 보조 실패',
      })
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
    providerUsage,
  }
}
