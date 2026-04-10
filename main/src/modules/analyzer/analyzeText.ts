import { ENGLISH_RULE_PATTERNS, ENGLISH_SAFE_CONTEXT_PATTERNS } from '@/data/englishRulePatterns'
import { RISK_BASELINES } from '@/data/riskBaselines'
import { COMBO_DEFINITIONS, RULE_DEFINITIONS, SAFE_CONTEXT_PATTERNS } from '@/data/rules'
import { classifySignals } from '@/modules/classifier/classifySignals'
import { evaluateAiHookingChecklist } from '@/modules/analyzer/evaluateAiHookingChecklist'
import { generateExplanation } from '@/modules/explanation/generateExplanation'
import { detectTextLanguage } from '@/modules/parser/detectTextLanguage'
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
    'startup-grant-broker',
    'startup-success-fee',
    'startup-insider-judge',
    'lecture-sales-funnel',
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
    'ai-blog-story-hook',
  ],
  aiSmell: [
    'ai-clickbait-fast-setup',
    'ai-no-developer-hype',
    'ai-absolute-tool-ranking',
    'ai-slick-low-density-style',
    'ai-explainer-tone',
    'ai-emoji-hype',
    'ai-blog-story-hook',
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
    'ai-explainer-tone',
    'ai-emoji-hype',
    'ai-blog-story-hook',
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

  if (comboIds.includes('combo-startup-grant-fee')) {
    scores.scam = Math.max(scores.scam, 78)
  }

  if (comboIds.includes('combo-startup-insider-sales')) {
    scores.scam = Math.max(scores.scam, 64)
  }

  if (comboIds.includes('combo-lecture-sales-funnel')) {
    scores.scam = Math.max(scores.scam, 38)
  }

  if (comboIds.includes('combo-ai-local-viral')) {
    scores.virality = Math.max(scores.virality, 65)
    scores.comparisonRisk = Math.max(scores.comparisonRisk, 65)
  }

  if (comboIds.includes('combo-ai-clickbait')) {
    scores.aiSmell = Math.max(scores.aiSmell, 70)
    scores.hookingStyle = Math.max(scores.hookingStyle, 70)
  }

  if (comboIds.includes('combo-ai-emoji-explainer')) {
    scores.aiSmell = Math.max(scores.aiSmell, 60)
    scores.hookingStyle = Math.max(scores.hookingStyle, 60)
  }

  if (comboIds.includes('combo-ai-blog-device-viral')) {
    scores.virality = Math.max(scores.virality, 65)
    scores.aiSmell = Math.max(scores.aiSmell, 65)
    scores.hookingStyle = Math.max(scores.hookingStyle, 60)
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

function calculateDimensionDrivenScore(
  scores: AnalysisDimensionScores,
  safeContextMatched: boolean,
) {
  const activeScores = Object.values(scores)
    .filter((value) => value > 25)
    .sort((left, right) => right - left)

  if (activeScores.length === 0) {
    return 0
  }

  if (activeScores.length === 1 && activeScores[0] < 60) {
    return 0
  }

  const peak = activeScores[0]
  const secondaryPeak = activeScores[1] ?? peak
  const average = activeScores.reduce((sum, value) => sum + value, 0) / activeScores.length
  const strongCount = activeScores.filter((value) => value >= 50).length
  const bonus = Math.min(10, Math.max(0, strongCount - 1) * 2)
  const rawScore = Math.round(average * 0.42 + peak * 0.38 + secondaryPeak * 0.2 + bonus)

  if (safeContextMatched) {
    return Math.max(0, Math.round(rawScore * 0.72) - 10)
  }

  return Math.min(100, rawScore)
}

function applyTypeDrivenDimensionMins(
  scores: AnalysisDimensionScores,
  primaryType: AnalysisType,
  secondaryTypes: AnalysisType[],
  aiHookingChecklist: AiHookingChecklistResult,
) {
  const nextScores = { ...scores }
  const allTypes = [primaryType, ...secondaryTypes]
  const tags = new Set(aiHookingChecklist.tags)
  const categoryScores = aiHookingChecklist.categoryScores

  const hasType = (type: AnalysisType) => allTypes.includes(type)
  const applyMin = (dimension: keyof AnalysisDimensionScores, value: number) => {
    nextScores[dimension] = Math.max(nextScores[dimension], Math.min(100, Math.round(value)))
  }

  const aiToneScore = categoryScores['AI 특유 저품질 문체']
  const hypeScore = Math.max(
    categoryScores['과장/단정 표현'],
    categoryScores['실행 난이도 은폐'],
    categoryScores['비용·시간·성과 과장'],
  )
  const viralScore = categoryScores['바이럴/제품 밀어주기']
  const outdatedScore = Math.max(
    categoryScores['최신성/버전 정확성'],
    categoryScores['사실성/검증 가능성'],
  )
  const comparisonScore = categoryScores['비교 왜곡/선택적 프레이밍']
  const authorityScore = categoryScores['권위팔이/트렌드 강요']

  if (hasType('AI 저품질 후킹글')) {
    applyMin('aiSmell', 28 + aiToneScore * 0.8)
    applyMin('hookingStyle', 20 + hypeScore * 0.72)
    applyMin('virality', 15 + Math.max(viralScore, hypeScore) * 0.58)
  }

  if (hasType('AI 바이럴/기기 바이럴')) {
    applyMin('virality', 26 + viralScore * 0.78)
    applyMin('comparisonRisk', 22 + comparisonScore * 0.75)
    applyMin('hookingStyle', 18 + hypeScore * 0.55)
  }

  if (hasType('권위팔이 AI 담론')) {
    applyMin('authorityAppeal', 25 + authorityScore * 0.78)
    applyMin('factualityRisk', 18 + outdatedScore * 0.62)
  }

  if (hasType('구식 모델/최신성 부족')) {
    applyMin('factualityRisk', 28 + outdatedScore * 0.82)
  }

  if (hasType('선택적 비교/정보 왜곡')) {
    applyMin('comparisonRisk', 26 + comparisonScore * 0.78)
    applyMin('virality', 16 + viralScore * 0.55)
  }

  if (tags.has('AI 냄새 강함')) {
    applyMin('aiSmell', 35 + aiToneScore * 0.7)
  }

  if (tags.has('제품 바이럴 가능성') || tags.has('기기 바이럴 가능성')) {
    applyMin('virality', 30 + viralScore * 0.72)
  }

  if (tags.has('모델 정보 최신성 낮음') || tags.has('구식 정보 재탕')) {
    applyMin('factualityRisk', 32 + outdatedScore * 0.7)
  }

  if (tags.has('권위팔이')) {
    applyMin('authorityAppeal', 30 + authorityScore * 0.72)
  }

  if (tags.has('비교 왜곡')) {
    applyMin('comparisonRisk', 32 + comparisonScore * 0.72)
  }

  if (
    tags.has('후킹형 과장 문체') ||
    tags.has('후킹 과장') ||
    tags.has('실행 난이도 은폐') ||
    tags.has('비용/성과 과장')
  ) {
    applyMin('hookingStyle', 30 + hypeScore * 0.68)
  }

  return nextScores
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value)
}

function resolveRulePatterns(ruleId: string, detectedLanguage: AnalysisResult['detectedLanguage'], koreanPatterns: RegExp[]) {
  const englishPatterns = ENGLISH_RULE_PATTERNS[ruleId] ?? []

  if (detectedLanguage === 'ko') {
    return koreanPatterns
  }

  if (detectedLanguage === 'en') {
    return englishPatterns
  }

  return [...koreanPatterns, ...englishPatterns]
}

export function analyzeText(rawText: string): AnalysisResult {
  const normalizedText = normalizeText(rawText)
  const detectedLanguage = detectTextLanguage(rawText)
  const sentences = splitSentences(normalizedText)
  const entities = extractEntities(normalizedText)

  const hits: DetectionHit[] = []

  for (const rule of RULE_DEFINITIONS) {
    const candidatePatterns = resolveRulePatterns(rule.id, detectedLanguage, rule.patterns)
    const matchedPattern = candidatePatterns.find((pattern) => {
      pattern.lastIndex = 0
      return pattern.test(normalizedText)
    })

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
  const englishSafeContextMatched =
    detectedLanguage !== 'ko' &&
    ENGLISH_SAFE_CONTEXT_PATTERNS.some((pattern) => pattern.test(normalizedText))
  const hasSafeContext = safeContextMatched || englishSafeContextMatched
  const aiHookingChecklist = evaluateAiHookingChecklist(normalizedText, sentences, detectedLanguage)
  const baseScoreResult = calculateWarningScore(hits, combos, hasSafeContext)
  const baseDimensionScores = calculateDimensionScores(
    hits,
    combos.map((combo) => combo.id),
    hasSafeContext,
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

  const dimensionScores = applyTypeDrivenDimensionMins(
    baseDimensionScores,
    primaryType,
    secondaryTypes,
    aiHookingChecklist,
  )
  const aiChecklistScore = mergeAiChecklistScore(
    baseScoreResult.score,
    aiHookingChecklist.normalizedScore,
  )
  const dimensionDrivenScore = calculateDimensionDrivenScore(dimensionScores, hasSafeContext)
  const score = Math.max(aiChecklistScore, dimensionDrivenScore)
  const grade =
    score === baseScoreResult.score ? baseScoreResult.grade : gradeFromAiChecklistScore(score)
  const scoreBreakdown = {
    ...baseScoreResult.scoreBreakdown,
    aiChecklistScore: aiHookingChecklist.normalizedScore,
    dimensionDrivenScore,
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
      detectedLanguage,
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
    detectedLanguage,
    summaryTemplateId: explanation.summaryTemplateId,
    summary: explanation.summary,
    matchedBaselines,
    dimensionScores,
    aiHookingChecklist,
    checklist,
    signals: [...new Set([...hits.map((hit) => hit.title), ...combos.map((combo) => combo.title)])],
    evidenceSentences,
    recommendedActionIds: explanation.recommendedActionIds,
    recommendedActions: explanation.recommendedActions,
    scoreBreakdown,
  }
}
