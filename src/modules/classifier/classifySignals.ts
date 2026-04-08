import type { AnalysisType, ComboDefinition, DetectionHit } from '@/shared/types'

const FALLBACK_TYPE: AnalysisType = '일반 수상 제안'
const TYPE_PRIORITY: AnalysisType[] = [
  '피싱/기관 사칭',
  '환급/복구/추적 대행',
  '투자/코인/리딩방',
  'AI 저품질 후킹글',
  'AI 바이럴/기기 바이럴',
  '권위팔이 AI 담론',
  '구식 모델/최신성 부족',
  '선택적 비교/정보 왜곡',
  'AI 자동화/구축 대행 과장',
  '바이럴/과장 마케팅',
  '부업/재택/작업형',
  '중고거래/에스크로 유사',
  '일반 수상 제안',
]

function typePriority(type: AnalysisType) {
  const index = TYPE_PRIORITY.indexOf(type)
  return index === -1 ? TYPE_PRIORITY.length : index
}

export function classifySignals(hits: DetectionHit[], combos: ComboDefinition[]) {
  const scoreMap = new Map<AnalysisType, number>()

  for (const hit of hits) {
    for (const type of hit.types) {
      scoreMap.set(type, (scoreMap.get(type) ?? 0) + hit.weight)
    }
  }

  for (const combo of combos) {
    for (const type of combo.types) {
      scoreMap.set(type, (scoreMap.get(type) ?? 0) + combo.bonus)
    }
  }

  const hasSpecificAiType = [
    'AI 저품질 후킹글',
    'AI 바이럴/기기 바이럴',
    '권위팔이 AI 담론',
    '구식 모델/최신성 부족',
    '선택적 비교/정보 왜곡',
  ].some((type) => scoreMap.has(type as AnalysisType))

  if (hasSpecificAiType && scoreMap.has('바이럴/과장 마케팅')) {
    scoreMap.set('바이럴/과장 마케팅', Math.round((scoreMap.get('바이럴/과장 마케팅') ?? 0) * 0.55))
  }

  const sorted = [...scoreMap.entries()].sort((a, b) => {
    const scoreDiff = b[1] - a[1]
    return scoreDiff === 0 ? typePriority(a[0]) - typePriority(b[0]) : scoreDiff
  })
  const primaryType = sorted[0]?.[0] ?? FALLBACK_TYPE
  const secondaryTypes = sorted.slice(1, 4).map(([type]) => type)

  return {
    primaryType,
    secondaryTypes,
  }
}
