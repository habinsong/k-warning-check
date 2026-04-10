import { AI_HOOKING_CHECKLIST_DEFINITIONS } from '@/data/aiHookingChecklist'
import { ENGLISH_AI_HOOKING_PATTERNS } from '@/data/englishAiHookingPatterns'
import { findEvidenceSentence } from '@/modules/parser/highlightEvidence'
import type {
  AiHookingChecklistCategory,
  AiHookingChecklistHit,
  AiHookingChecklistResult,
  DetectedLanguage,
} from '@/shared/types'

const CATEGORY_NAMES: AiHookingChecklistCategory[] = [
  '최신성/버전 정확성',
  '사실성/검증 가능성',
  '과장/단정 표현',
  '비교 왜곡/선택적 프레이밍',
  '바이럴/제품 밀어주기',
  'AI 특유 저품질 문체',
  '권위팔이/트렌드 강요',
  '실행 난이도 은폐',
  '비용·시간·성과 과장',
  '기술 맥락/균형감 부족',
]

const HIGH_IMPACT_TAGS = new Set([
  '구식 정보 재탕',
  '후킹형 과장 문체',
  '권위팔이',
  '비교 왜곡',
  '실행 난이도 은폐',
  '비용/성과 과장',
])

function emptyCategoryScores() {
  return Object.fromEntries(CATEGORY_NAMES.map((category) => [category, 0])) as Record<
    AiHookingChecklistCategory,
    number
  >
}

function matchText(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    const match = pattern.exec(text)
    if (match?.[0]) {
      return match[0]
    }
  }

  return ''
}

export function evaluateAiHookingChecklist(
  normalizedText: string,
  sentences: string[],
  detectedLanguage: DetectedLanguage = 'ko',
): AiHookingChecklistResult {
  const hits: AiHookingChecklistHit[] = []

  for (const definition of AI_HOOKING_CHECKLIST_DEFINITIONS) {
    const englishPatterns = ENGLISH_AI_HOOKING_PATTERNS[definition.id]
    const weakPatterns =
      detectedLanguage === 'ko'
        ? definition.weakPatterns
        : detectedLanguage === 'en'
          ? englishPatterns?.weakPatterns ?? []
          : [...definition.weakPatterns, ...(englishPatterns?.weakPatterns ?? [])]
    const strongPatterns =
      detectedLanguage === 'ko'
        ? definition.strongPatterns ?? []
        : detectedLanguage === 'en'
          ? englishPatterns?.strongPatterns ?? []
          : [...(definition.strongPatterns ?? []), ...(englishPatterns?.strongPatterns ?? [])]

    const strongMatch = matchText(normalizedText, strongPatterns)
    const weakMatch = strongMatch || matchText(normalizedText, weakPatterns)

    if (!weakMatch) {
      continue
    }

    hits.push({
      id: definition.id,
      number: definition.number,
      category: definition.category,
      title: definition.title,
      userLabel: definition.userLabel,
      tag: definition.tag,
      score: strongMatch ? 2 : 1,
      critical: Boolean(definition.critical),
      evidence: findEvidenceSentence(sentences, weakMatch),
    })
  }

  const rawScore = hits.reduce((sum, hit) => sum + hit.score, 0)
  const criticalCount = hits.filter((hit) => hit.critical).length
  const highImpactTagBonus = new Set(hits.map((hit) => hit.tag).filter((tag) => HIGH_IMPACT_TAGS.has(tag))).size * 3
  const normalizedScore = Math.min(
    100,
    Math.round((rawScore / 200) * 100 + criticalCount * 3 + highImpactTagBonus),
  )
  const categoryRawScores = emptyCategoryScores()

  for (const hit of hits) {
    categoryRawScores[hit.category] += hit.score
  }

  const categoryScores = Object.fromEntries(
    CATEGORY_NAMES.map((category) => [
      category,
      Math.min(100, Math.round((categoryRawScores[category] / 20) * 100)),
    ]),
  ) as Record<AiHookingChecklistCategory, number>

  const sortedHits = [...hits].sort((a, b) => {
    if (a.critical !== b.critical) {
      return a.critical ? -1 : 1
    }

    const scoreDiff = b.score - a.score
    return scoreDiff === 0 ? a.number - b.number : scoreDiff
  })
  const topFindings: AiHookingChecklistHit[] = []
  const displayedLabels = new Set<string>()

  for (const hit of sortedHits) {
    if (displayedLabels.has(hit.userLabel)) {
      continue
    }

    topFindings.push(hit)
    displayedLabels.add(hit.userLabel)

    if (topFindings.length >= 5) {
      break
    }
  }

  return {
    rawScore,
    normalizedScore,
    criticalCount,
    tags: [...new Set(sortedHits.map((hit) => hit.tag))].slice(0, 6),
    topFindings,
    categoryScores,
  }
}
