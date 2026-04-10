import { BaseProviderAdapter, extractJsonObject } from '@/modules/providers/adapter'
import type { WebFreshnessVerification } from '@/shared/types'

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

  async summarize(prompt: string) {
    if (!this.isConfigured()) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.')
    }

    const endpoint = `${this.state.gemini.endpoint}/${this.state.gemini.model}:generateContent`
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
            parts: [{ text: prompt }],
          },
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    })

    if (!response.ok) {
      throw new Error(`Gemini 호출 실패: ${response.status}`)
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
      }>
    }

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n')

    if (!text?.trim()) {
      throw new Error('Gemini 응답을 해석할 수 없습니다.')
    }

    return text.trim()
  }

  async extractTextFromImage(imageDataUrl: string) {
    if (!this.isConfigured()) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.')
    }

    const { mimeType, data } = parseDataUrl(imageDataUrl)
    const endpoint = `${this.state.gemini.endpoint}/${this.state.gemini.model}:generateContent`
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
            parts: [
              {
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
                inline_data: {
                  mime_type: mimeType,
                  data,
                },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      const errorText = await response.text()

      if (response.status === 429) {
        throw new Error('Gemini 할당량을 초과했습니다.')
      }

      throw new Error(`Gemini 이미지 인식 실패: ${response.status} ${errorText}`.trim())
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
      }>
    }

    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n')

    if (!text?.trim()) {
      throw new Error('Gemini 이미지 인식 응답이 비어 있습니다.')
    }

    return text.trim()
  }

  async verifyFreshness(text: string): Promise<WebFreshnessVerification> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.')
    }

    const endpoint = `${this.state.gemini.endpoint}/${this.state.gemini.model}:generateContent`
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
            parts: [
              {
                text: [
                  this.state.uiLocale === 'en'
                    ? 'Verify only claims about AI models, versions, deprecation status, or whether they are current flagship models.'
                    : '다음 문장에서 AI 모델, 버전, deprecated 여부, 현재 주력 모델 여부와 관련된 주장만 검증하세요.',
                  this.state.uiLocale === 'en'
                    ? 'You must use web search and prioritize official documentation, official release notes, and official product pages.'
                    : '반드시 웹 검색을 사용하고 공식 문서, 공식 릴리스 노트, 공식 제품 페이지를 우선하세요.',
                  this.state.uiLocale === 'en'
                    ? 'Use confirmed_outdated or confirmed_current only when the claim is clearly verified. Otherwise use inconclusive.'
                    : '확실히 확인된 경우에만 confirmed_outdated 또는 confirmed_current를 사용하고, 애매하면 inconclusive를 사용하세요.',
                  this.state.uiLocale === 'en'
                    ? 'Return only the JSON below.'
                    : '반드시 아래 JSON만 반환하세요.',
                  this.state.uiLocale === 'en'
                    ? '{"status":"confirmed_outdated|confirmed_current|inconclusive","summary":"one short English sentence","checkedClaims":["..."],"references":[{"title":"...","url":"https://..."}]}'
                    : '{"status":"confirmed_outdated|confirmed_current|inconclusive","summary":"짧은 한국어 1문장","checkedClaims":["..."],"references":[{"title":"...","url":"https://..."}]}',
                  '',
                  text.slice(0, 2400),
                ].join('\n'),
              },
            ],
          },
        ],
        tools: [{ google_search: {} }],
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      const errorText = await response.text()

      if (response.status === 429) {
        throw new Error('Gemini 할당량을 초과했습니다.')
      }

      throw new Error(`Gemini 최신성 검증 실패: ${response.status} ${errorText}`.trim())
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
      }>
    }

    const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n').trim()

    if (!content) {
      throw new Error('Gemini 최신성 검증 응답이 비어 있습니다.')
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
