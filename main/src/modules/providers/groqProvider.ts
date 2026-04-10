import { BaseProviderAdapter, extractJsonObject } from '@/modules/providers/adapter'
import type { GroqToolId, WebFreshnessVerification } from '@/shared/types'

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

function isCompoundModel(model: string) {
  return model === 'groq/compound' || model === 'groq/compound-mini'
}

function isGptOssModel(model: string) {
  return model === 'openai/gpt-oss-120b' || model === 'openai/gpt-oss-20b'
}

function supportsVision(model: string) {
  return (
    model === 'meta-llama/llama-4-maverick-17b-128e-instruct' ||
    model === 'meta-llama/llama-4-scout-17b-16e-instruct'
  )
}

function gptOssTools(enabledTools: GroqToolId[]) {
  const tools: Array<{ type: 'browser_search' | 'code_interpreter' }> = []

  if (enabledTools.includes('web_search')) {
    tools.push({ type: 'browser_search' })
  }

  if (enabledTools.includes('code_interpreter')) {
    tools.push({ type: 'code_interpreter' })
  }

  return tools
}

export class GroqProvider extends BaseProviderAdapter {
  kind = 'groq' as const

  isConfigured() {
    return Boolean(this.secrets.groqApiKey?.trim())
  }

  supportsWebFreshnessCheck() {
    const model = this.state.groq.model.trim() || 'groq/compound'
    return isCompoundModel(model) || isGptOssModel(model)
  }

  async summarize(prompt: string) {
    if (!this.isConfigured()) {
      throw new Error('Groq API 키가 설정되지 않았습니다.')
    }

    const model = this.state.groq.model.trim() || 'groq/compound'
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secrets.groqApiKey!}`,
      'Content-Type': 'application/json',
    }
    const body: Record<string, unknown> = {
      model,
      messages: [
        {
          role: 'system',
          content:
            this.state.uiLocale === 'en'
              ? 'You are K-WarningCheck’s explanation assistant. Keep the judgment intact and answer in exactly one English sentence.'
              : 'K-워닝체크의 보조 요약기입니다. 판정 기준을 바꾸지 말고 한국어 1문장으로만 답하세요.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
    }

    if (isCompoundModel(model)) {
      headers['Groq-Model-Version'] = 'latest'
      body.compound_custom = {
        tools: {
          enabled_tools: this.state.groq.enabledTools,
        },
      }
    } else if (isGptOssModel(model)) {
      const tools = gptOssTools(this.state.groq.enabledTools)
      if (tools.length > 0) {
        body.tools = tools
      }
    }

    const response = await fetch(`${this.state.groq.endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    })

    const data = (await response.json()) as GroqChatResponse

    if (!response.ok) {
      throw new Error(data.error?.message ?? `Groq 호출 실패: ${response.status}`)
    }

    const text = data.choices?.[0]?.message?.content

    if (!text?.trim()) {
      throw new Error('Groq 응답을 해석할 수 없습니다.')
    }

    return text.trim()
  }

  async extractTextFromImage(imageDataUrl: string) {
    if (!this.isConfigured()) {
      throw new Error('Groq API 키가 설정되지 않았습니다.')
    }

    const selectedModel = this.state.groq.model.trim() || 'groq/compound'
    const model = supportsVision(selectedModel)
      ? selectedModel
      : 'meta-llama/llama-4-scout-17b-16e-instruct'
    const response = await fetch(`${this.state.groq.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secrets.groqApiKey!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: [
                  this.state.uiLocale === 'en'
                    ? 'Read this image like OCR and extract the visible text as faithfully as possible.'
                    : '이 이미지를 OCR처럼 읽고 보이는 글자를 한국어로 그대로 추출해 주세요.',
                  this.state.uiLocale === 'en'
                    ? 'Return text only, with no explanation or summary.'
                    : '설명, 요약, 해설 없이 텍스트만 반환하세요.',
                  this.state.uiLocale === 'en'
                    ? 'Preserve the original line breaks as much as possible.'
                    : '줄바꿈은 원문 구조를 최대한 유지하세요.',
                ].join(' '),
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_completion_tokens: 2048,
      }),
      signal: AbortSignal.timeout(20_000),
    })

    const data = (await response.json()) as GroqChatResponse

    if (!response.ok) {
      throw new Error(
        data.error?.message ??
          `Groq 이미지 인식 실패: ${response.status}${model !== selectedModel ? ` (${model} 사용)` : ''}`,
      )
    }

    const text = data.choices?.[0]?.message?.content

    if (!text?.trim()) {
      throw new Error('Groq 이미지 인식 응답이 비어 있습니다.')
    }

    return text.trim()
  }

  async verifyFreshness(text: string): Promise<WebFreshnessVerification> {
    if (!this.isConfigured()) {
      throw new Error('Groq API 키가 설정되지 않았습니다.')
    }

    const model = this.state.groq.model.trim() || 'groq/compound'

    if (!this.supportsWebFreshnessCheck()) {
      throw new Error('현재 선택한 Groq 모델은 웹 검색 최신성 검증을 지원하지 않습니다.')
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secrets.groqApiKey!}`,
      'Content-Type': 'application/json',
    }
    const body: Record<string, unknown> = {
      model,
      messages: [
        {
          role: 'system',
          content: [
            this.state.uiLocale === 'en'
              ? 'You verify freshness claims about AI models and services.'
              : '당신은 AI 모델·서비스 최신성 검증기입니다.',
            this.state.uiLocale === 'en'
              ? 'You must use web search and prioritize official documentation, official release notes, and official product pages.'
              : '반드시 웹 검색을 사용해 공식 문서, 공식 릴리스 노트, 공식 제품 페이지를 우선 확인하세요.',
            this.state.uiLocale === 'en' ? 'Return JSON only.' : '반드시 JSON만 반환하세요.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            this.state.uiLocale === 'en'
              ? 'Verify only claims about AI model names, versions, support status, deprecation, or whether they are currently flagship models.'
              : '다음 문장에서 AI 모델, 버전, 지원 상태, deprecated 여부, 현재 주력 모델 여부와 관련된 주장만 검증하세요.',
            this.state.uiLocale === 'en'
              ? 'Use confirmed_outdated or confirmed_current only when the claim is clearly verified. Otherwise use inconclusive.'
              : '확실히 확인된 경우에만 confirmed_outdated 또는 confirmed_current를 사용하고, 애매하면 inconclusive를 사용하세요.',
            this.state.uiLocale === 'en'
              ? 'Return only the JSON schema below.'
              : '반드시 아래 JSON 스키마만 반환하세요.',
            this.state.uiLocale === 'en'
              ? '{"status":"confirmed_outdated|confirmed_current|inconclusive","summary":"one short English sentence","checkedClaims":["..."],"references":[{"title":"...","url":"https://..."}]}'
              : '{"status":"confirmed_outdated|confirmed_current|inconclusive","summary":"짧은 한국어 1문장","checkedClaims":["..."],"references":[{"title":"...","url":"https://..."}]}',
            '',
            text.slice(0, 2400),
          ].join('\n'),
        },
      ],
      temperature: 0,
    }

    if (isCompoundModel(model)) {
      headers['Groq-Model-Version'] = 'latest'
      body.compound_custom = {
        tools: {
          enabled_tools: ['web_search'],
        },
      }
      body.search_settings = {
        include_domains: OFFICIAL_SOURCE_DOMAINS,
      }
    } else {
      body.tools = [{ type: 'browser_search' }]
      body.tool_choice = 'required'
      body.search_settings = {
        include_domains: OFFICIAL_SOURCE_DOMAINS,
      }
    }

    const response = await fetch(`${this.state.groq.endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })

    const data = (await response.json()) as GroqChatResponse

    if (!response.ok) {
      throw new Error(data.error?.message ?? `Groq 최신성 검증 실패: ${response.status}`)
    }

    const content = data.choices?.[0]?.message?.content?.trim()

    if (!content) {
      throw new Error('Groq 최신성 검증 응답이 비어 있습니다.')
    }

    const parsed = JSON.parse(extractJsonObject(content)) as WebFreshnessVerification

    return {
      status: parsed.status ?? 'inconclusive',
      messageKey: 'provider',
      providerSummaryLocale: this.state.uiLocale,
      providerSummaryText:
        parsed.summary?.trim() ||
        (this.state.uiLocale === 'en'
          ? 'The web freshness result could not be interpreted.'
          : '웹 검색 기반 최신성 검증 결과를 해석하지 못했습니다.'),
      summary: parsed.summary?.trim() || '웹 검색 기반 최신성 검증 결과를 해석하지 못했습니다.',
      checkedClaims: Array.isArray(parsed.checkedClaims) ? parsed.checkedClaims.slice(0, 5) : [],
      references: Array.isArray(parsed.references) ? parsed.references.slice(0, 3) : [],
    }
  }
}
