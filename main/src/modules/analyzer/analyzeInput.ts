import { analyzeText } from '@/modules/analyzer/analyzeText'
import { GRADE_ORDER } from '@/shared/constants'
import type {
  AnalysisInput,
  AnalysisResult,
  AnalysisType,
  ChecklistItem,
  ProviderSecrets,
  ProviderState,
  ProviderUsage,
  RecommendedActionId,
  StoredAnalysisRecord,
  WebFreshnessVerification,
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

const OUTDATED_RELATED_LABELS = new Set(['최신 모델/버전 정보가 아닐 수 있음', '구식 정보 재탕 가능성'])
const OUTDATED_RELATED_TAGS = new Set(['구식 정보 재탕', '모델 정보 최신성 낮음'])
const OUTDATED_RELATED_SIGNALS = new Set([
  '구형 AI 모델명을 현역 추천처럼 제시',
  '웹 검색 기준 최신성 불일치 확인',
])
const KNOWN_MODEL_TERM_PATTERN =
  /\b(?:Claude|GPT|Gemini|Gemma|GLM|Qwen|Llama|Sonnet|Opus|Haiku|DeepSeek|Mistral)\b/i
const QUOTED_MODEL_NAME_PATTERN = /['"`][A-Z][A-Za-z0-9.+-]{2,}['"`]/i
const PREVIEW_MODEL_NAME_PATTERN = /\b[A-Z][A-Za-z0-9.+-]{2,}\s+Preview\b/i

function gradeFromScore(score: number) {
  if (score >= 85) {
    return '경고' as const
  }

  if (score >= 70) {
    return '매우 위험' as const
  }

  if (score >= 50) {
    return '위험' as const
  }

  if (score >= 25) {
    return '주의' as const
  }

  return '낮음' as const
}

function maxGrade(current: AnalysisResult['grade'], next: AnalysisResult['grade']) {
  return GRADE_ORDER.indexOf(next) > GRADE_ORDER.indexOf(current) ? next : current
}

function shouldRunWebFreshnessCheck(text: string, result: AnalysisResult) {
  return (
    KNOWN_MODEL_TERM_PATTERN.test(text) ||
    QUOTED_MODEL_NAME_PATTERN.test(text) ||
    PREVIEW_MODEL_NAME_PATTERN.test(text) ||
    result.primaryType === '구식 모델/최신성 부족' ||
    result.aiHookingChecklist.tags.some((tag) => OUTDATED_RELATED_TAGS.has(tag)) ||
    result.dimensionScores.factualityRisk >= 35
  )
}

function pickReplacementPrimaryType(result: AnalysisResult) {
  const nextPrimary =
    result.secondaryTypes.find((type) => type !== '구식 모델/최신성 부족') ??
    ('AI 저품질 후킹글' as AnalysisType)
  const nextSecondary = [
    ...new Set([result.primaryType, ...result.secondaryTypes].filter((type) => type !== nextPrimary && type !== '구식 모델/최신성 부족')),
  ].slice(0, 4)

  return {
    primaryType: nextPrimary,
    secondaryTypes: nextSecondary,
  }
}

function addChecklistItem(result: AnalysisResult, item: ChecklistItem) {
  if (result.checklist.some((existing) => existing.id === item.id)) {
    return result.checklist
  }

  return [...result.checklist, item]
}

function applyWebFreshnessVerification(
  result: AnalysisResult,
  verification: WebFreshnessVerification,
): AnalysisResult {
  if (verification.status === 'inconclusive') {
    return {
      ...result,
      webFreshnessVerification: verification,
    }
  }

  if (verification.status === 'confirmed_current') {
    const nextScore = Math.max(0, result.score - 8)
    const nextTypeState =
      result.primaryType === '구식 모델/최신성 부족'
        ? pickReplacementPrimaryType(result)
        : {
            primaryType: result.primaryType,
            secondaryTypes: result.secondaryTypes,
          }

    return {
      ...result,
      ...nextTypeState,
      score: nextScore,
      grade: gradeFromScore(nextScore),
      summaryTemplateId: 'freshness_current',
      summary: verification.summary,
      aiHookingChecklist: {
        ...result.aiHookingChecklist,
        normalizedScore: Math.max(0, result.aiHookingChecklist.normalizedScore - 10),
        tags: result.aiHookingChecklist.tags.filter((tag) => !OUTDATED_RELATED_TAGS.has(tag)),
        topFindings: result.aiHookingChecklist.topFindings.filter(
          (finding) => !OUTDATED_RELATED_LABELS.has(finding.userLabel),
        ),
      },
      checklist: result.checklist.filter(
        (item) =>
          !OUTDATED_RELATED_LABELS.has(item.title) &&
          item.title !== '구형 AI 모델명을 현역 추천처럼 제시' &&
          item.title !== '웹 검색 기준 최신성 불일치 확인',
      ),
      signals: result.signals.filter((signal) => !OUTDATED_RELATED_SIGNALS.has(signal)),
      dimensionScores: {
        ...result.dimensionScores,
        factualityRisk: Math.max(0, result.dimensionScores.factualityRisk - 25),
      },
      recommendedActionIds: [
        'freshness_current_keep_other_checks',
        ...result.recommendedActionIds.filter(
          (id) => id !== 'verify_ai_docs' && id !== 'verify_model_claims_and_sources',
        ),
      ].slice(0, 4) as RecommendedActionId[],
      recommendedActions: [
        '최신성 자체는 웹 검색 기준으로 바로 틀렸다고 보긴 어렵습니다. 다만 과장·비교 왜곡 여부는 따로 보십시오.',
        ...result.recommendedActions.filter(
          (action) => !action.includes('모델명') && !action.includes('지원 상태'),
        ),
      ].slice(0, 4),
      webFreshnessVerification: verification,
    }
  }

  const nextScore = Math.min(100, result.score + 8)

  return {
    ...result,
    score: nextScore,
    grade: maxGrade(result.grade, gradeFromScore(nextScore)),
    summaryTemplateId: 'freshness_outdated',
    summary: verification.summary,
    aiHookingChecklist: {
      ...result.aiHookingChecklist,
      normalizedScore: Math.min(100, result.aiHookingChecklist.normalizedScore + 10),
      tags: [...new Set([...result.aiHookingChecklist.tags, '구식 정보 재탕'])].slice(0, 6),
    },
    checklist: addChecklistItem(result, {
      id: 'web-freshness-confirmed-outdated',
      title: '웹 검색 기준 최신성 불일치 확인',
      category: '신뢰 위장',
      triggered: true,
      weight: 10,
      severity: 'high',
      evidence: verification.summary,
    }),
    signals: [...new Set([...result.signals, '웹 검색 기준 최신성 불일치 확인'])],
    dimensionScores: {
      ...result.dimensionScores,
      factualityRisk: Math.min(100, result.dimensionScores.factualityRisk + 25),
    },
    recommendedActionIds: [
      'freshness_outdated_verify_model_status',
      ...result.recommendedActionIds,
    ].slice(0, 4) as RecommendedActionId[],
    recommendedActions: [
      '현재 공식 문서 기준 모델명, 버전, 지원 상태가 맞는지 먼저 다시 확인하십시오.',
      ...result.recommendedActions,
    ].slice(0, 4),
    webFreshnessVerification: verification,
  }
}

export async function analyzeInput(
  input: AnalysisInput,
  providerState: ProviderState,
  providerSecrets: ProviderSecrets,
): Promise<StoredAnalysisRecord> {
  let sourceText = input.rawText?.trim() ?? input.selectedText?.trim() ?? ''
  let ocrText = ''
  const providerUsage: ProviderUsage[] = []

  const assistant = createExplanationAssistant(providerState, providerSecrets)
  const configuredProviders = createConfiguredProviders(providerState, providerSecrets)

  if (input.source === 'url' && input.rawText) {
    sourceText = input.rawText
  }

  if (!sourceText && input.imageDataUrl) {
    if (configuredProviders.length === 0) {
      throw new Error(
        '이미지 분석에는 멀티모달 제공자가 필요합니다. Gemini 또는 Groq API 키를 입력하거나 Codex 연결을 준비해 주세요.',
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

  if (providerState.webSearchEnabled && shouldRunWebFreshnessCheck(sourceText, result)) {
    const freshnessProviders = configuredProviders.filter((provider) => provider.supportsWebFreshnessCheck())
    const freshnessErrors: string[] = []

    if (freshnessProviders.length === 0) {
      result = {
        ...result,
        webFreshnessVerification: {
          status: 'inconclusive',
          messageKey: 'skipped_no_provider',
          summary:
            '웹 검색이 가능한 Gemini 또는 검색 지원 Groq 모델이 없어 최신성 검증을 건너뛰었습니다.',
          checkedClaims: [],
          references: [],
        },
      }
    }

    for (const freshnessProvider of freshnessProviders) {
      try {
        const verification = await withTimeout(
          freshnessProvider.verifyFreshness(sourceText),
          15_000,
          `${freshnessProvider.kind} 웹 검색 최신성 검증`,
        )
        result = applyWebFreshnessVerification(result, verification)
        providerUsage.push({
          provider: freshnessProvider.kind,
          operations: ['verifyFreshness'],
          success: true,
        })
        break
      } catch (error) {
        const message = error instanceof Error ? error.message : '최신성 검증 실패'
        freshnessErrors.push(`${freshnessProvider.kind}: ${message}`)
        providerUsage.push({
          provider: freshnessProvider.kind,
          operations: ['verifyFreshness'],
          success: false,
          error: message,
        })
      }
    }

    if (!result.webFreshnessVerification && freshnessErrors.length > 0) {
      result = {
        ...result,
        webFreshnessVerification: {
          status: 'inconclusive',
          messageKey: 'failed',
          summary: `웹 최신성 검증을 시도했지만 실패했습니다. ${freshnessErrors[0]}`,
          checkedClaims: [],
          references: [],
        },
      }
    }
  }

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
        summaryOverrideLocale: providerState.uiLocale,
        summaryOverrideText: refinedSummary || result.summary,
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
