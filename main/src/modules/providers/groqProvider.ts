import { BaseProviderAdapter, type ProviderRiskContext } from '@/modules/providers/adapter'
import type { ProviderRiskAnalysis } from '@/modules/providers/adapter'
import type { ProviderState } from '@/shared/types'

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

const OFFICIAL_SOURCE_DOMAINS = [
  'openai.com',
  'platform.openai.com',
  'developers.openai.com',
  'anthropic.com',
  'docs.anthropic.com',
  'ai.google.dev',
  'blog.google',
  'developers.googleblog.com',
]

export function isCompoundModel(model: string) {
  return model === 'groq/compound' || model === 'groq/compound-mini'
}

export function isGptOssModel(model: string) {
  return model === 'openai/gpt-oss-120b' || model === 'openai/gpt-oss-20b'
}

function supportsVision(model: string) {
  return (
    model === 'meta-llama/llama-4-maverick-17b-128e-instruct' ||
    model === 'meta-llama/llama-4-scout-17b-16e-instruct'
  )
}

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

export function buildGroqRiskAnalysisRequest(
  state: ProviderState,
  context: ProviderRiskContext,
): {
  prompt: string
  shouldUseWebSearch: boolean
} {
  const rawText = (context.rawText ?? '').trim()
  const isImageOnly = !rawText && Boolean(context.input.imageDataUrl)
  const shouldUseWebSearch = context.webSearchEnabled && !context.input.imageDataUrl
  const result = context.result
  const evidenceCandidates = buildEvidenceCandidates(context)
  const responseShape = isImageOnly
    ? '{"summary":"1문장","responseText":"최대 2문장","evidence":["원문 인용 1","원문 인용 2"],"extractedText":"이미지에서 읽은 텍스트"}'
    : shouldUseWebSearch
      ? '{"summary":"1문장","responseText":"최대 2문장","evidence":["원문 인용 1","원문 인용 2"],"freshnessNote":"선택 1문장"}'
      : '{"summary":"1문장","responseText":"최대 2문장","evidence":["원문 인용 1","원문 인용 2"]}'
  const lines = [
    state.uiLocale === 'en'
      ? 'Return valid JSON only in English.'
      : '반드시 한국어 JSON만 반환하세요.',
    result
      ? state.uiLocale === 'en'
        ? `Local result is fixed: score ${result.score}, grade ${result.grade}, type ${result.primaryType}. Do not change it.`
        : `로컬 판정은 고정입니다: 점수 ${result.score}, 등급 ${result.grade}, 유형 ${result.primaryType}. 바꾸지 마세요.`
      : state.uiLocale === 'en'
        ? 'No local score is available yet. If this is an image, read visible text first.'
        : '아직 로컬 판정이 없습니다. 이미지라면 먼저 보이는 글자를 읽으세요.',
    state.uiLocale === 'en'
      ? 'Do not paraphrase the ad copy. Explain the risk signals critically.'
      : '광고 문구를 따라 쓰지 말고, 위험 신호를 비판적으로 설명하세요.',
    state.uiLocale === 'en'
      ? 'Keep responseText to 2 short critical sentences max. Evidence must be 2 short direct quotes from the source.'
      : 'responseText는 최대 2개의 짧은 비판 문장으로 쓰고, evidence는 원문에서 직접 발췌한 짧은 인용 2개만 쓰세요.',
    state.uiLocale === 'en'
      ? `Response format: ${responseShape}`
      : `반환 형식: ${responseShape}`,
    result?.signals?.length
      ? state.uiLocale === 'en'
        ? `Key signal: ${result.signals[0]}`
        : `핵심 신호: ${result.signals[0]}`
      : '',
    evidenceCandidates
      ? state.uiLocale === 'en'
        ? `Quote candidates: ${evidenceCandidates}`
        : `인용 후보: ${evidenceCandidates}`
      : '',
    isImageOnly
      ? state.uiLocale === 'en'
        ? 'This is an image-only input. Put the visible text into extractedText.'
        : '이미지 전용 입력입니다. 보이는 글자를 extractedText에 넣으세요.'
      : state.uiLocale === 'en'
        ? `Source: ${compactSourcePreview(rawText)}`
        : `원문: ${compactSourcePreview(rawText)}`,
  ].filter(Boolean)

  return {
    prompt: lines.join('\n'),
    shouldUseWebSearch,
  }
}

export class GroqProvider extends BaseProviderAdapter {
  kind = 'groq' as const

  isConfigured() {
    return Boolean(this.secrets.groqApiKey?.trim())
  }

  supportsWebFreshnessCheck() {
    const model = this.state.groq.model.trim() || 'groq/compound-mini'
    return isCompoundModel(model) || isGptOssModel(model)
  }

  async analyzeRisk(context: ProviderRiskContext) {
    if (!this.isConfigured()) {
      throw new Error('Groq API 키가 설정되지 않았습니다.')
    }

    const selectedModel = this.state.groq.model.trim() || 'groq/compound-mini'
    const request = buildGroqRiskAnalysisRequest(this.state, {
      ...context,
      webSearchEnabled: context.webSearchEnabled && !context.input.imageDataUrl,
    })
    const useVision = Boolean(context.input.imageDataUrl)
    const model = useVision
      ? supportsVision(selectedModel)
        ? selectedModel
        : 'meta-llama/llama-4-scout-17b-16e-instruct'
      : selectedModel
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secrets.groqApiKey!}`,
      'Content-Type': 'application/json',
    }
    const messageContent = useVision
      ? [
          {
            type: 'text',
            text: request.prompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: context.input.imageDataUrl,
            },
          },
        ]
      : request.prompt
    const body: Record<string, unknown> = {
      model,
      messages: [
        {
          role: 'user',
          content: messageContent,
        },
      ],
      temperature: 0.1,
      max_completion_tokens: request.shouldUseWebSearch || useVision ? 700 : 240,
      response_format: { type: 'json_object' },
    }

    if (isCompoundModel(model)) {
      body.compound_custom = {
        tools: {
          enabled_tools: request.shouldUseWebSearch ? ['web_search'] : [],
        },
      }
    }

    if (request.shouldUseWebSearch) {
      if (isCompoundModel(model)) {
        headers['Groq-Model-Version'] = 'latest'
        body.search_settings = {
          include_domains: OFFICIAL_SOURCE_DOMAINS,
        }
      } else if (isGptOssModel(model)) {
        body.tools = [{ type: 'browser_search' }]
        body.tool_choice = 'required'
        body.search_settings = {
          include_domains: OFFICIAL_SOURCE_DOMAINS,
        }
      }
    }

    const response = await fetch(`${this.state.groq.endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(request.shouldUseWebSearch ? 30_000 : 15_000),
    })

    const data = (await response.json()) as GroqChatResponse

    if (!response.ok) {
      throw new Error(data.error?.message ?? `Groq 분석 실패: ${response.status}`)
    }

    const text = data.choices?.[0]?.message?.content?.trim()

    if (!text) {
      throw new Error('Groq 분석 응답이 비어 있습니다.')
    }

    return this.parseRiskAnalysisResponse(text, context) satisfies ProviderRiskAnalysis
  }
}
