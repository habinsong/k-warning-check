import { BaseProviderAdapter } from '@/modules/providers/adapter'
import type { GroqToolId } from '@/shared/types'

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

interface GroqResponsesApiResponse {
  output_text?: string
  error?: {
    message?: string
  }
}

function isCompoundModel(model: string) {
  return model === 'groq/compound' || model === 'groq/compound-mini'
}

function isGptOssModel(model: string) {
  return model === 'openai/gpt-oss-120b' || model === 'openai/gpt-oss-20b'
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
    return Boolean(this.state.groq.apiKey.trim())
  }

  async summarize(prompt: string) {
    if (!this.isConfigured()) {
      throw new Error('Groq API 키가 설정되지 않았습니다.')
    }

    const model = this.state.groq.model.trim() || 'groq/compound'
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.state.groq.apiKey}`,
      'Content-Type': 'application/json',
    }
    const body: Record<string, unknown> = {
      model,
      messages: [
        {
          role: 'system',
          content:
            'K-워닝체크의 보조 요약기입니다. 판정 기준을 바꾸지 말고 한국어 1문장으로만 답하세요.',
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

    const model = this.state.groq.model.trim() || 'groq/compound'
    const response = await fetch(`${this.state.groq.endpoint}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.state.groq.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  '이 이미지를 OCR처럼 읽고 보이는 글자를 한국어로 그대로 추출해 주세요.',
                  '설명, 요약, 해설 없이 텍스트만 반환하세요.',
                  '줄바꿈은 원문 구조를 최대한 유지하세요.',
                ].join(' '),
              },
              {
                type: 'input_image',
                detail: 'auto',
                image_url: imageDataUrl,
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    })

    const data = (await response.json()) as GroqResponsesApiResponse

    if (!response.ok) {
      throw new Error(data.error?.message ?? `Groq 이미지 인식 실패: ${response.status}`)
    }

    if (!data.output_text?.trim()) {
      throw new Error('Groq 이미지 인식 응답이 비어 있습니다.')
    }

    return data.output_text.trim()
  }
}
