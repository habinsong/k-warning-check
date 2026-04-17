import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeInput } from '@/modules/analyzer/analyzeInput'
import { DEFAULT_PROVIDER_STATE } from '@/shared/defaults'
import type { ProviderRiskAnalysis, AIProviderAdapter } from '@/modules/providers/adapter'
import type { ProviderSecrets, ProviderState } from '@/shared/types'

const { createSelectedProviderMock } = vi.hoisted(() => ({
  createSelectedProviderMock: vi.fn<
    (state: ProviderState, secrets: ProviderSecrets) => AIProviderAdapter | null
  >(),
}))

vi.mock('@/modules/providers/factory', () => ({
  createSelectedProvider: createSelectedProviderMock,
}))

function createProvider(result: ProviderRiskAnalysis): AIProviderAdapter {
  return {
    kind: 'gemini',
    isConfigured: () => true,
    analyzeRisk: vi.fn(async () => result),
    supportsWebFreshnessCheck: () => true,
  }
}

function createState(overrides?: Partial<ProviderState>): ProviderState {
  return {
    ...DEFAULT_PROVIDER_STATE,
    ...overrides,
    preferredProvider: 'gemini',
    webSearchEnabled: true,
    gemini: {
      ...DEFAULT_PROVIDER_STATE.gemini,
      hasSecret: true,
      storageBackend: 'keychain',
    },
  }
}

describe('analyzeInput', () => {
  beforeEach(() => {
    createSelectedProviderMock.mockReset()
  })

  it('선택한 provider를 한 번만 호출하고 llmAnalysis를 저장한다', async () => {
    const provider = createProvider({
      summary: 'LLM 요약입니다.',
      responseText: 'LLM 본문 응답입니다.',
      evidence: ['근거 1', '근거 2'],
      freshnessNote: 'Claude 3.5는 최신 주력 모델이 아닐 수 있습니다.',
    })
    createSelectedProviderMock.mockReturnValue(provider)

    const record = await analyzeInput(
      {
        source: 'text',
        rawText:
          '개발자 없이 1인 창업할 때 딱 이 4개 조합이면 끝납니다. Claude 3.5 Sonnet 원탑이고 0원 듭니다.',
        createdAt: new Date().toISOString(),
      },
      createState(),
      {} satisfies ProviderSecrets,
    )

    expect(provider.analyzeRisk).toHaveBeenCalledTimes(1)
    expect(record.providerUsage).toHaveLength(1)
    expect(record.providerUsage[0]).toMatchObject({
      provider: 'gemini',
      operations: ['analyzeRisk'],
      success: true,
    })
    expect(record.llmAnalysis).toMatchObject({
      provider: 'gemini',
      status: 'success',
      responseText: 'LLM 본문 응답입니다.',
      evidence: ['근거 1', '근거 2'],
      freshnessNote: 'Claude 3.5는 최신 주력 모델이 아닐 수 있습니다.',
    })
    expect(record.result.summaryOverrideText).toBe('LLM 요약입니다.')
    expect(record.result.webFreshnessVerification?.summary).toBe(
      'Claude 3.5는 최신 주력 모델이 아닐 수 있습니다.',
    )
  })

  it('선택한 provider가 없으면 skipped 상태를 저장한다', async () => {
    createSelectedProviderMock.mockReturnValue(null)

    const record = await analyzeInput(
      {
        source: 'text',
        rawText: '안녕하세요. 일반 공지입니다.',
        createdAt: new Date().toISOString(),
      },
      createState(),
      {} satisfies ProviderSecrets,
    )

    expect(record.providerUsage).toHaveLength(1)
    expect(record.providerUsage[0]).toMatchObject({
      provider: 'gemini',
      operations: ['analyzeRisk'],
      success: false,
    })
    expect(record.llmAnalysis).toMatchObject({
      provider: 'gemini',
      status: 'skipped',
    })
  })
})
