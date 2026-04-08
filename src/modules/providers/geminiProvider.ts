import { BaseProviderAdapter } from '@/modules/providers/adapter'

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
    return Boolean(this.state.gemini.apiKey.trim())
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
        'x-goog-api-key': this.state.gemini.apiKey,
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
        'x-goog-api-key': this.state.gemini.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  '이 이미지를 OCR처럼 읽고 보이는 글자를 한국어로 그대로 추출해 주세요.',
                  '설명, 요약, 해설 없이 텍스트만 반환하세요.',
                  '줄바꿈은 원문 구조를 최대한 유지하세요.',
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
}
