import { GRADE_ORDER } from '@/shared/constants'
import type { ComboDefinition, DetectionHit, RiskGrade } from '@/shared/types'

function maxGrade(current: RiskGrade, next: RiskGrade) {
  return GRADE_ORDER.indexOf(next) > GRADE_ORDER.indexOf(current) ? next : current
}

export function calculateWarningScore(
  hits: DetectionHit[],
  combos: ComboDefinition[],
  safeContextMatched: boolean,
) {
  const raw = hits.reduce((sum, hit) => sum + hit.weight, 0)
  const comboBonus = combos.reduce((sum, combo) => sum + combo.bonus, 0)
  const mitigation = safeContextMatched ? 12 : 0

  let floorApplied: RiskGrade | undefined

  for (const hit of hits) {
    if (hit.severity === 'critical') {
      floorApplied = maxGrade(floorApplied ?? '낮음', '위험')
    }
  }

  for (const combo of combos) {
    if (combo.floor) {
      floorApplied = maxGrade(floorApplied ?? '낮음', combo.floor)
    }
  }

  const unclamped = raw + comboBonus - mitigation
  let score = Math.max(0, Math.min(100, unclamped))

  if (floorApplied === '위험') {
    score = Math.max(score, 50)
  }

  if (floorApplied === '매우 위험') {
    score = Math.max(score, 70)
  }

  if (floorApplied === '경고') {
    score = Math.max(score, 85)
  }

  let grade: RiskGrade = '낮음'

  if (score >= 85) {
    grade = '경고'
  } else if (score >= 70) {
    grade = '매우 위험'
  } else if (score >= 50) {
    grade = '위험'
  } else if (score >= 25) {
    grade = '주의'
  }

  if (floorApplied) {
    grade = maxGrade(grade, floorApplied)
  }

  return {
    score,
    grade,
    scoreBreakdown: {
      raw,
      comboBonus,
      mitigation,
      aiChecklistScore: 0,
      floorApplied,
    },
  }
}
