import { RISK_BASELINES } from '@/data/riskBaselines'
import { COMBO_DEFINITIONS, RULE_DEFINITIONS, SAFE_CONTEXT_PATTERNS } from '@/data/rules'
import { classifySignals } from '@/modules/classifier/classifySignals'
import { evaluateAiHookingChecklist } from '@/modules/analyzer/evaluateAiHookingChecklist'
import { generateExplanation } from '@/modules/explanation/generateExplanation'
import { extractEntities } from '@/modules/parser/extractEntities'
import { findEvidenceSentence } from '@/modules/parser/highlightEvidence'
import { normalizeText, splitSentences } from '@/modules/parser/normalizeText'
import { calculateWarningScore } from '@/modules/scoring/calculateWarningScore'
import type {
  AiHookingChecklistResult,
  AnalysisDimensionScores,
  AnalysisResult,
  AnalysisType,
  ChecklistItem,
  DetectionHit,
  RiskGrade,
} from '@/shared/types'

const DIMENSION_RULES: Record<keyof AnalysisDimensionScores, string[]> = {
  scam: [
    'upfront-payment',
    'refund-fee',
    'loan-repay-first',
    'remote-control',
    'smishing-delivery',
    'external-messenger',
    'secrecy',
    'guaranteed-profit',
    'impersonation',
    'short-url',
    'credential-request',
    'gift-card',
  ],
  virality: [
    'viral-scarcity',
    'weak-identity',
    'ai-agency-hype',
    'ai-clickbait-fast-setup',
    'ai-local-llm-overclaim',
    'ai-no-developer-hype',
    'ai-absolute-tool-ranking',
    'ai-device-viral-framing',
    'ai-selective-comparison',
  ],
  aiSmell: [
    'ai-clickbait-fast-setup',
    'ai-no-developer-hype',
    'ai-absolute-tool-ranking',
    'ai-slick-low-density-style',
    'ai-local-llm-overclaim',
  ],
  factualityRisk: [
    'ai-outdated-model-reference',
    'ai-unverifiable-insider-claim',
    'ai-selective-comparison',
  ],
  comparisonRisk: [
    'ai-local-llm-overclaim',
    'ai-selective-comparison',
    'ai-device-viral-framing',
  ],
  authorityAppeal: [
    'ai-absolute-tool-ranking',
    'ai-authority-trend-pressure',
    'ai-unverifiable-insider-claim',
    'internal-route',
  ],
  hookingStyle: [
    'urgency',
    'viral-scarcity',
    'ai-clickbait-fast-setup',
    'ai-no-developer-hype',
    'ai-absolute-tool-ranking',
    'ai-slick-low-density-style',
  ],
}

function calculateDimensionScores(
  hits: DetectionHit[],
  comboIds: string[],
  safeContextMatched: boolean,
  aiHookingChecklist: AiHookingChecklistResult,
): AnalysisDimensionScores {
  const hitScoreById = new Map(hits.map((hit) => [hit.ruleId, hit.weight]))
  const scores: AnalysisDimensionScores = {
    scam: 0,
    virality: 0,
    aiSmell: 0,
    factualityRisk: 0,
    comparisonRisk: 0,
    authorityAppeal: 0,
    hookingStyle: 0,
  }

  for (const [dimension, ruleIds] of Object.entries(DIMENSION_RULES) as Array<
    [keyof AnalysisDimensionScores, string[]]
  >) {
    const raw = ruleIds.reduce((sum, ruleId) => sum + (hitScoreById.get(ruleId) ?? 0), 0)
    scores[dimension] = Math.min(100, Math.round(raw * 2.2))
  }

  if (comboIds.includes('combo-ai-local-viral')) {
    scores.virality = Math.max(scores.virality, 65)
    scores.comparisonRisk = Math.max(scores.comparisonRisk, 65)
  }

  if (comboIds.includes('combo-ai-clickbait')) {
    scores.aiSmell = Math.max(scores.aiSmell, 70)
    scores.hookingStyle = Math.max(scores.hookingStyle, 70)
  }

  if (comboIds.includes('combo-ai-authority-trend-claim')) {
    scores.authorityAppeal = Math.max(scores.authorityAppeal, 60)
    scores.factualityRisk = Math.max(scores.factualityRisk, 50)
  }

  scores.virality = Math.max(
    scores.virality,
    Math.max(
      aiHookingChecklist.categoryScores['바이럴/제품 밀어주기'],
      aiHookingChecklist.categoryScores['비용·시간·성과 과장'],
    ),
  )
  scores.aiSmell = Math.max(scores.aiSmell, aiHookingChecklist.categoryScores['AI 특유 저품질 문체'])
  scores.factualityRisk = Math.max(
    scores.factualityRisk,
    Math.max(
      aiHookingChecklist.categoryScores['최신성/버전 정확성'],
      aiHookingChecklist.categoryScores['사실성/검증 가능성'],
    ),
  )
  scores.comparisonRisk = Math.max(
    scores.comparisonRisk,
    aiHookingChecklist.categoryScores['비교 왜곡/선택적 프레이밍'],
  )
  scores.authorityAppeal = Math.max(
    scores.authorityAppeal,
    aiHookingChecklist.categoryScores['권위팔이/트렌드 강요'],
  )
  scores.hookingStyle = Math.max(
    scores.hookingStyle,
    Math.max(
      aiHookingChecklist.categoryScores['과장/단정 표현'],
      aiHookingChecklist.categoryScores['실행 난이도 은폐'],
    ),
  )

  if (safeContextMatched) {
    scores.virality = Math.max(0, scores.virality - 12)
    scores.aiSmell = Math.max(0, scores.aiSmell - 12)
    scores.hookingStyle = Math.max(0, scores.hookingStyle - 12)
  }

  return scores
}

function gradeFromAiChecklistScore(score: number): RiskGrade {
  if (score >= 85) {
    return '경고'
  }

  if (score >= 70) {
    return '매우 위험'
  }

  if (score >= 50) {
    return '위험'
  }

  if (score >= 25) {
    return '주의'
  }

  return '낮음'
}

function mergeAiChecklistScore(baseScore: number, aiChecklistScore: number) {
  return Math.max(baseScore, Math.round(aiChecklistScore * 0.85))
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value)
}

export function analyzeText(rawText: string): AnalysisResult {
  const normalizedText = normalizeText(rawText)
  const sentences = splitSentences(normalizedText)
  const entities = extractEntities(normalizedText)

  const hits: DetectionHit[] = []

  for (const rule of RULE_DEFINITIONS) {
    const matchedPattern = rule.patterns.find((pattern) => pattern.test(normalizedText))

    if (!matchedPattern) {
      continue
    }

    const matchedText =
      normalizedText.match(matchedPattern)?.[0] ??
      (rule.id === 'short-url' ? entities.shortUrls[0] : rule.title)

    hits.push({
      ruleId: rule.id,
      title: rule.title,
      category: rule.category,
      weight: rule.weight,
      matchedText,
      evidence: findEvidenceSentence(sentences, matchedText),
      severity: rule.severity,
      types: rule.types,
    })
  }

  if (entities.shortUrls.length > 0 && !hits.some((hit) => hit.ruleId === 'short-url')) {
    const firstShortUrl = entities.shortUrls[0]

    hits.push({
      ruleId: 'short-url',
      title: '단축 링크 사용',
      category: '피싱/링크 위험',
      weight: 10,
      matchedText: firstShortUrl,
      evidence: findEvidenceSentence(sentences, firstShortUrl),
      severity: 'medium',
      types: ['피싱/기관 사칭', '일반 수상 제안'],
    })
  }

  if (
    entities.openChatLinks.length > 0 &&
    !hits.some((hit) => hit.ruleId === 'external-messenger')
  ) {
    const link = entities.openChatLinks[0]
    hits.push({
      ruleId: 'external-messenger',
      title: '외부 메신저 이동 유도',
      category: '행동 유도',
      weight: 12,
      matchedText: link,
      evidence: findEvidenceSentence(sentences, link),
      severity: 'medium',
      types: ['부업/재택/작업형', '일반 수상 제안'],
    })
  }

  const combos = COMBO_DEFINITIONS.filter((combo) =>
    combo.requires.every((ruleId) => hits.some((hit) => hit.ruleId === ruleId)),
  )
  const hitIds = hits.map((hit) => hit.ruleId)
  const matchedBaselines = RISK_BASELINES.filter((baseline) =>
    baseline.check(normalizedText, hitIds),
  ).map((baseline) => ({
    id: baseline.id,
    title: baseline.title,
    sourceName: baseline.sourceName,
    sourceUrl: baseline.sourceUrl,
    guidance: baseline.guidance,
  }))

  const safeContextMatched = SAFE_CONTEXT_PATTERNS.some((pattern) =>
    pattern.test(normalizedText),
  )
  const aiHookingChecklist = evaluateAiHookingChecklist(normalizedText, sentences)
  const baseScoreResult = calculateWarningScore(
    hits,
    combos,
    safeContextMatched,
  )
  const score = mergeAiChecklistScore(baseScoreResult.score, aiHookingChecklist.normalizedScore)
  const grade =
    score === baseScoreResult.score ? baseScoreResult.grade : gradeFromAiChecklistScore(score)
  const scoreBreakdown = {
    ...baseScoreResult.scoreBreakdown,
    aiChecklistScore: aiHookingChecklist.normalizedScore,
  }
  const dimensionScores = calculateDimensionScores(
    hits,
    combos.map((combo) => combo.id),
    safeContextMatched,
    aiHookingChecklist,
  )
  let { primaryType, secondaryTypes } = classifySignals(hits, combos)

  if (
    primaryType === '일반 수상 제안' &&
    aiHookingChecklist.normalizedScore >= 25 &&
    aiHookingChecklist.topFindings.length > 0
  ) {
    primaryType = 'AI 저품질 후킹글'
    secondaryTypes = [...new Set<AnalysisType>(['바이럴/과장 마케팅', ...secondaryTypes])].slice(0, 4)
  }

  const ruleChecklist: ChecklistItem[] = hits.map((hit) => ({
    id: hit.ruleId,
    title: hit.title,
    category: hit.category,
    triggered: true,
    weight: hit.weight,
    severity: hit.severity,
    evidence: hit.evidence,
  }))
  const comboChecklist: ChecklistItem[] = combos.map((combo) => ({
    id: combo.id,
    title: combo.title,
    category: '바이럴/과장',
    triggered: true,
    weight: combo.bonus,
    severity: combo.floor === '경고' ? 'critical' : combo.floor === '위험' ? 'high' : 'medium',
    evidence: combo.requires
      .map((ruleId) => hits.find((hit) => hit.ruleId === ruleId)?.evidence)
      .filter(isNonEmptyString)
      .join(' / '),
  }))
  const aiChecklist: ChecklistItem[] = aiHookingChecklist.topFindings.map((finding) => ({
    id: `ai-check-${finding.id}`,
    title: finding.userLabel,
    category: '바이럴/과장',
    triggered: true,
    weight: finding.critical ? 10 : finding.score * 3,
    severity: finding.critical ? 'high' : finding.score === 2 ? 'medium' : 'low',
    evidence: finding.evidence,
  }))
  const checklist = [...ruleChecklist, ...comboChecklist, ...aiChecklist]

  const evidenceSentences = [
    ...new Set(
      [
        ...hits.map((hit) => hit.evidence),
        ...combos.flatMap((combo) =>
          combo.requires.map((ruleId) => hits.find((hit) => hit.ruleId === ruleId)?.evidence),
        ),
        ...aiHookingChecklist.topFindings.map((finding) => finding.evidence),
      ].filter(isNonEmptyString),
    ),
  ]

  const explanation = generateExplanation(
    {
      score,
      grade,
      primaryType,
      secondaryTypes,
      matchedBaselines,
      dimensionScores,
      aiHookingChecklist,
      checklist,
      signals: hits.map((hit) => hit.title),
      evidenceSentences,
      scoreBreakdown,
    },
    hits,
  )

  return {
    score,
    grade,
    primaryType,
    secondaryTypes,
    summary: explanation.summary,
    matchedBaselines,
    dimensionScores,
    aiHookingChecklist,
    checklist,
    signals: [...new Set([...hits.map((hit) => hit.title), ...combos.map((combo) => combo.title)])],
    evidenceSentences,
    recommendedActions: explanation.recommendedActions,
    scoreBreakdown,
  }
}
