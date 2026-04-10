import { getSecureStoreSecret } from './codex-services.mjs'

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

function extractJsonObject(text) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fencedMatch?.[1] ?? text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('JSON 응답을 찾지 못했습니다.')
  }

  return candidate.slice(start, end + 1)
}

function parseGeminiImageDataUrl(imageDataUrl) {
  const match = String(imageDataUrl).match(/^data:(.+?);base64,(.+)$/)

  if (!match) {
    throw new Error('Gemini 이미지 형식을 해석할 수 없습니다.')
  }

  return {
    mimeType: match[1],
    data: match[2],
  }
}

function readRequiredString(payload, key, errorMessage) {
  const value = payload?.[key]

  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(errorMessage)
  }

  return value
}

function isCompoundModel(model) {
  return model === 'groq/compound' || model === 'groq/compound-mini'
}

function isGptOssModel(model) {
  return model === 'openai/gpt-oss-120b' || model === 'openai/gpt-oss-20b'
}

function supportsVision(model) {
  return (
    model === 'meta-llama/llama-4-maverick-17b-128e-instruct' ||
    model === 'meta-llama/llama-4-scout-17b-16e-instruct'
  )
}

function gptOssTools(enabledTools) {
  const tools = []

  if (enabledTools.includes('web_search')) {
    tools.push({ type: 'browser_search' })
  }

  if (enabledTools.includes('code_interpreter')) {
    tools.push({ type: 'code_interpreter' })
  }

  return tools
}

async function invokeGeminiOperation(state, operation, payload) {
  const apiKey = await getSecureStoreSecret('gemini')
  const endpoint = `${state.gemini.endpoint}/${state.gemini.model}:generateContent`

  if (operation === 'summarize') {
    const prompt = readRequiredString(payload, 'prompt', '요약 프롬프트가 없습니다.')
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
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

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n')

    if (!text?.trim()) {
      throw new Error('Gemini 응답을 해석할 수 없습니다.')
    }

    return text.trim()
  }

  if (operation === 'extractTextFromImage') {
    const imageDataUrl = readRequiredString(payload, 'imageDataUrl', '이미지 데이터가 없습니다.')
    const { mimeType, data: imageBase64 } = parseGeminiImageDataUrl(imageDataUrl)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  state.uiLocale === 'en'
                    ? 'Read this image like OCR and extract the visible text as faithfully as possible.'
                    : '이 이미지를 OCR처럼 읽고 보이는 글자를 한국어로 그대로 추출해 주세요.',
                  state.uiLocale === 'en'
                    ? 'Return text only, with no explanation or summary.'
                    : '설명, 요약, 해설 없이 텍스트만 반환하세요.',
                  state.uiLocale === 'en'
                    ? 'Preserve the original line breaks as much as possible.'
                    : '줄바꿈은 원문 구조를 최대한 유지하세요.',
                ].join(' '),
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBase64,
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

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n')

    if (!text?.trim()) {
      throw new Error('Gemini 이미지 인식 응답이 비어 있습니다.')
    }

    return text.trim()
  }

  if (operation === 'verifyFreshness') {
    const text = readRequiredString(payload, 'text', '검증할 텍스트가 없습니다.')
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  state.uiLocale === 'en'
                    ? 'Verify only claims about AI models, versions, deprecation status, or whether they are current flagship models.'
                    : '다음 문장에서 AI 모델, 버전, deprecated 여부, 현재 주력 모델 여부와 관련된 주장만 검증하세요.',
                  state.uiLocale === 'en'
                    ? 'You must use web search and prioritize official documentation, official release notes, and official product pages.'
                    : '반드시 웹 검색을 사용하고 공식 문서, 공식 릴리스 노트, 공식 제품 페이지를 우선하세요.',
                  state.uiLocale === 'en'
                    ? 'Use confirmed_outdated or confirmed_current only when the claim is clearly verified. Otherwise use inconclusive.'
                    : '확실히 확인된 경우에만 confirmed_outdated 또는 confirmed_current를 사용하고, 애매하면 inconclusive를 사용하세요.',
                  state.uiLocale === 'en' ? 'Return only the JSON below.' : '반드시 아래 JSON만 반환하세요.',
                  state.uiLocale === 'en'
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

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n').trim()

    if (!content) {
      throw new Error('Gemini 최신성 검증 응답이 비어 있습니다.')
    }

    const parsed = JSON.parse(extractJsonObject(content))

    return {
      status: parsed.status ?? 'inconclusive',
      messageKey: 'provider',
      providerSummaryLocale: state.uiLocale,
      providerSummaryText:
        parsed.summary?.trim() ||
        (state.uiLocale === 'en'
          ? 'The web freshness result could not be interpreted.'
          : '웹 검색 기반 최신성 검증 결과를 해석하지 못했습니다.'),
      summary: parsed.summary?.trim() || '웹 검색 기반 최신성 검증 결과를 해석하지 못했습니다.',
      checkedClaims: Array.isArray(parsed.checkedClaims) ? parsed.checkedClaims.slice(0, 5) : [],
      references: Array.isArray(parsed.references) ? parsed.references.slice(0, 3) : [],
    }
  }

  throw new Error('지원하지 않는 Gemini 작업입니다.')
}

async function invokeGroqOperation(state, operation, payload) {
  const apiKey = await getSecureStoreSecret('groq')
  const selectedModel = state.groq.model.trim() || 'groq/compound'

  if (operation === 'summarize') {
    const prompt = readRequiredString(payload, 'prompt', '요약 프롬프트가 없습니다.')
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }
    const body = {
      model: selectedModel,
      messages: [
        {
          role: 'system',
          content:
            state.uiLocale === 'en'
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

    if (isCompoundModel(selectedModel)) {
      headers['Groq-Model-Version'] = 'latest'
      body.compound_custom = {
        tools: {
          enabled_tools: state.groq.enabledTools,
        },
      }
    } else if (isGptOssModel(selectedModel)) {
      const tools = gptOssTools(state.groq.enabledTools)
      if (tools.length > 0) {
        body.tools = tools
      }
    }

    const response = await fetch(`${state.groq.endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error?.message ?? `Groq 호출 실패: ${response.status}`)
    }

    const text = data.choices?.[0]?.message?.content

    if (!text?.trim()) {
      throw new Error('Groq 응답을 해석할 수 없습니다.')
    }

    return text.trim()
  }

  if (operation === 'extractTextFromImage') {
    const imageDataUrl = readRequiredString(payload, 'imageDataUrl', '이미지 데이터가 없습니다.')
    const model = supportsVision(selectedModel)
      ? selectedModel
      : 'meta-llama/llama-4-scout-17b-16e-instruct'
    const response = await fetch(`${state.groq.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
                  state.uiLocale === 'en'
                    ? 'Read this image like OCR and extract the visible text as faithfully as possible.'
                    : '이 이미지를 OCR처럼 읽고 보이는 글자를 한국어로 그대로 추출해 주세요.',
                  state.uiLocale === 'en'
                    ? 'Return text only, with no explanation or summary.'
                    : '설명, 요약, 해설 없이 텍스트만 반환하세요.',
                  state.uiLocale === 'en'
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

    const data = await response.json()

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

  if (operation === 'verifyFreshness') {
    const text = readRequiredString(payload, 'text', '검증할 텍스트가 없습니다.')

    if (!(isCompoundModel(selectedModel) || isGptOssModel(selectedModel))) {
      throw new Error('현재 선택한 Groq 모델은 웹 검색 최신성 검증을 지원하지 않습니다.')
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }
    const body = {
      model: selectedModel,
      messages: [
        {
          role: 'system',
          content: [
            state.uiLocale === 'en'
              ? 'You verify freshness claims about AI models and services.'
              : '당신은 AI 모델·서비스 최신성 검증기입니다.',
            state.uiLocale === 'en'
              ? 'You must use web search and prioritize official documentation, official release notes, and official product pages.'
              : '반드시 웹 검색을 사용해 공식 문서, 공식 릴리스 노트, 공식 제품 페이지를 우선 확인하세요.',
            state.uiLocale === 'en' ? 'Return JSON only.' : '반드시 JSON만 반환하세요.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            state.uiLocale === 'en'
              ? 'Verify only claims about AI model names, versions, support status, deprecation, or whether they are currently flagship models.'
              : '다음 문장에서 AI 모델, 버전, 지원 상태, deprecated 여부, 현재 주력 모델 여부와 관련된 주장만 검증하세요.',
            state.uiLocale === 'en'
              ? 'Use confirmed_outdated or confirmed_current only when the claim is clearly verified. Otherwise use inconclusive.'
              : '확실히 확인된 경우에만 confirmed_outdated 또는 confirmed_current를 사용하고, 애매하면 inconclusive를 사용하세요.',
            state.uiLocale === 'en'
              ? 'Return only the JSON schema below.'
              : '반드시 아래 JSON 스키마만 반환하세요.',
            state.uiLocale === 'en'
              ? '{"status":"confirmed_outdated|confirmed_current|inconclusive","summary":"one short English sentence","checkedClaims":["..."],"references":[{"title":"...","url":"https://..."}]}'
              : '{"status":"confirmed_outdated|confirmed_current|inconclusive","summary":"짧은 한국어 1문장","checkedClaims":["..."],"references":[{"title":"...","url":"https://..."}]}',
            '',
            text.slice(0, 2400),
          ].join('\n'),
        },
      ],
      temperature: 0,
    }

    if (isCompoundModel(selectedModel)) {
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

    const response = await fetch(`${state.groq.endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error?.message ?? `Groq 최신성 검증 실패: ${response.status}`)
    }

    const content = data.choices?.[0]?.message?.content?.trim()

    if (!content) {
      throw new Error('Groq 최신성 검증 응답이 비어 있습니다.')
    }

    const parsed = JSON.parse(extractJsonObject(content))

    return {
      status: parsed.status ?? 'inconclusive',
      messageKey: 'provider',
      providerSummaryLocale: state.uiLocale,
      providerSummaryText:
        parsed.summary?.trim() ||
        (state.uiLocale === 'en'
          ? 'The web freshness result could not be interpreted.'
          : '웹 검색 기반 최신성 검증 결과를 해석하지 못했습니다.'),
      summary: parsed.summary?.trim() || '웹 검색 기반 최신성 검증 결과를 해석하지 못했습니다.',
      checkedClaims: Array.isArray(parsed.checkedClaims) ? parsed.checkedClaims.slice(0, 5) : [],
      references: Array.isArray(parsed.references) ? parsed.references.slice(0, 3) : [],
    }
  }

  throw new Error('지원하지 않는 Groq 작업입니다.')
}

export async function invokeProviderBridge({ store, provider, operation, payload }) {
  const state = await store.getProviderState()

  if (provider === 'gemini') {
    return invokeGeminiOperation(state, operation, payload ?? {})
  }

  if (provider === 'groq') {
    return invokeGroqOperation(state, operation, payload ?? {})
  }

  throw new Error('지원하지 않는 provider bridge 요청입니다.')
}
