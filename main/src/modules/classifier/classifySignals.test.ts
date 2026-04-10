import { describe, expect, it } from 'vitest'
import { classifySignals } from '@/modules/classifier/classifySignals'
import type { ComboDefinition, DetectionHit } from '@/shared/types'

describe('classifySignals', () => {
  it('가중치가 높은 유형을 주 유형으로 선택한다', () => {
    const hits: DetectionHit[] = [
      {
        ruleId: 'guaranteed-profit',
        title: '원금 보장',
        category: '표현 패턴',
        weight: 18,
        matchedText: '원금 보장',
        evidence: '원금 보장',
        severity: 'high',
        types: ['투자/코인/리딩방'],
      },
      {
        ruleId: 'viral-scarcity',
        title: '후기 위장',
        category: '바이럴/과장',
        weight: 11,
        matchedText: '광고 아님',
        evidence: '광고 아님',
        severity: 'medium',
        types: ['바이럴/과장 마케팅'],
      },
    ]
    const combos: ComboDefinition[] = []

    const result = classifySignals(hits, combos)
    expect(result.primaryType).toBe('투자/코인/리딩방')
  })
})
