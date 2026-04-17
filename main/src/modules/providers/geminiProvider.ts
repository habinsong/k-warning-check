import { BaseProviderAdapter, type ProviderRiskContext } from '@/modules/providers/adapter'
import type { ProviderState } from '@/shared/types'

function compactSourcePreview(rawText: string) {
  const normalized = rawText.replace(/\s+/g, ' ').trim()
  return normalized.length > 125 ? `${normalized.slice(0, 125)}...` : normalized
}

function compactEvidenceCandidate(rawText: string) {
  const normalized = rawText.replace(/\s+/g, ' ').trim()
  return normalized.length > 44 ? `${normalized.slice(0, 44)}...` : normalized
}

function buildEvidenceCandidates(context: ProviderRiskContext) {
  const candidates = context.result?.evidenceSentences?.slice(0, 2) ?? []
  return candidates
    .map((candidate) => `"${compactEvidenceCandidate(candidate)}"`)
    .join(' | ')
}

function buildGeminiRiskAnalysisRequest(
  state: ProviderState,
  context: ProviderRiskContext,
): {
  prompt: string
  schema: Record<string, unknown>
  maxOutputTokens: number
} {
  const model = state.gemini.model.trim()
  const rawText = (context.rawText ?? '').trim()
  const isImageOnly = !rawText && Boolean(context.input.imageDataUrl)
  const includesFreshness = context.webSearchEnabled
  const includesExtractedText = isImageOnly
  const evidenceCandidates = buildEvidenceCandidates(context)
  const schema: Record<string, unknown> = {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: state.uiLocale === 'en' ? 'One short sentence.' : '짧은 1문장.',
      },
      responseText: {
        type: 'string',
        description: state.uiLocale === 'en' ? 'At most 2 short sentences.' : '최대 2개의 짧은 문장.',
      },
      evidence: {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        items: {
          type: 'string',
          description: state.uiLocale === 'en' ? 'A short direct quote from the source.' : '원문에서 직접 발췌한 짧은 인용.',
        },
      },
    },
    required: ['summary', 'responseText', 'evidence'],
  }
  const properties = schema.properties as Record<string, unknown>
  const required = schema.required as string[]

  if (includesFreshness) {
    properties.freshnessNote = { type: ['string', 'null'] }
  }

  if (includesExtractedText) {
    properties.extractedText = { type: ['string', 'null'] }
  }

  const lines = [
    state.uiLocale === 'en' ? 'Return English JSON only.' : '반드시 한국어 JSON만 반환하세요.',
    context.result
      ? state.uiLocale === 'en'
        ? `Local result is fixed: score ${context.result.score}, grade ${context.result.grade}, type ${context.result.primaryType}. Do not change it.`
        : `로컬 판정은 고정입니다: 점수 ${context.result.score}, 등급 ${context.result.grade}, 유형 ${context.result.primaryType}. 바꾸지 마세요.`
      : state.uiLocale === 'en'
        ? 'If this is an image, read visible text first.'
        : '이미지라면 먼저 보이는 글자를 읽으세요.',
    state.uiLocale === 'en'
      ? 'Do not repeat ad copy. Explain the risk signals critically.'
      : '광고 문구를 따라 쓰지 말고, 위험 신호를 비판적으로 설명하세요.',
    state.uiLocale === 'en'
      ? 'Keep summary short, keep responseText to 2 short critical sentences max, and keep evidence to 2 short direct source quotes.'
      : 'summary는 짧게, responseText는 최대 2개의 짧은 비판 문장으로, evidence는 원문에서 직접 발췌한 짧은 인용 2개만 쓰세요.',
    state.uiLocale === 'en'
      ? `Return keys: ${required.join(', ')}${includesFreshness ? ', freshnessNote' : ''}${includesExtractedText ? ', extractedText' : ''}`
      : `반환 키: ${required.join(', ')}${includesFreshness ? ', freshnessNote' : ''}${includesExtractedText ? ', extractedText' : ''}`,
    context.result?.signals?.[0]
      ? state.uiLocale === 'en'
        ? `Key signal: ${context.result.signals[0]}`
        : `핵심 신호: ${context.result.signals[0]}`
      : '',
    evidenceCandidates
      ? state.uiLocale === 'en'
        ? `Quote candidates: ${evidenceCandidates}`
        : `인용 후보: ${evidenceCandidates}`
      : '',
    isImageOnly
      ? state.uiLocale === 'en'
        ? 'Image-only input. Put visible text into extractedText.'
        : '이미지 전용 입력입니다. 보이는 글자를 extractedText에 넣으세요.'
      : state.uiLocale === 'en'
        ? `Source: ${compactSourcePreview(rawText)}`
        : `원문: ${compactSourcePreview(rawText)}`,
  ].filter(Boolean)

  return {
    prompt: lines.join('\n'),
    schema,
    maxOutputTokens:
      includesFreshness || includesExtractedText
        ? 420
        : model.includes('pro')
          ? 420
          : 320,
  }
}

function buildGeminiThinkingConfig(model: string) {
  const normalized = model.trim()

  if (normalized.startsWith('gemini-3')) {
    if (normalized.includes('flash-lite') || normalized.includes('flash')) {
      return {
        thinkingLevel: 'minimal',
      }
    }

    return {
      thinkingLevel: 'low',
    }
  }

  if (normalized.startsWith('gemini-2.5')) {
    return {
      thinkingBudget: 0,
    }
  }

  return undefined
}

function parseDataUrl(imageDataUrl: string) {
  const match = imageDataUrl.match(/^data:(.+?);base64,(.+)$/)

  if (!match) {
    throw new Error('Gemini 이미지 형식을 해석할 수 없습니다.')
  }

  return {
    mimeType: match[1],
    data: match[2],
  }
}

export class GeminiProvider extends BaseProviderAdapter {
  kind = 'gemini' as const

  isConfigured() {
    return Boolean(this.secrets.geminiApiKey?.trim())
  }

  supportsWebFreshnessCheck() {
    return true
  }

  async analyzeRisk(context: ProviderRiskContext) {
    if (!this.isConfigured()) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.')
    }

    const endpoint = `${this.state.gemini.endpoint}/${this.state.gemini.model}:generateContent`
    const request = buildGeminiRiskAnalysisRequest(this.state, context)
    const parts: Array<Record<string, unknown>> = [{ text: request.prompt }]
    const thinkingConfig = buildGeminiThinkingConfig(this.state.gemini.model)

    if (context.input.imageDataUrl) {
      const { mimeType, data } = parseDataUrl(context.input.imageDataUrl)
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data,
        },
      })
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.secrets.geminiApiKey!,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        ...(context.webSearchEnabled ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: request.maxOutputTokens,
          responseMimeType: 'application/json',
          responseJsonSchema: request.schema,
          ...(thinkingConfig ? { thinkingConfig } : {}),
        },
      }),
      signal: AbortSignal.timeout(context.webSearchEnabled ? 35_000 : 15_000),
    })

    if (!response.ok) {
      const errorText = await response.text()

      if (response.status === 429) {
        throw new Error('Gemini 할당량을 초과했습니다.')
      }

      throw new Error(`Gemini 분석 실패: ${response.status} ${errorText}`.trim())
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
      }>
    }

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n').trim()

    if (!text) {
      throw new Error('Gemini 분석 응답이 비어 있습니다.')
    }

    return this.parseRiskAnalysisResponse(text, context)
  }
}
