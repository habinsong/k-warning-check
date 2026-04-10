import { describe, expect, it } from 'vitest'
import { calculateWarningScore } from '@/modules/scoring/calculateWarningScore'
import type { ComboDefinition, DetectionHit } from '@/shared/types'

const criticalHit: DetectionHit = {
  ruleId: 'credential-request',
  title: '로그인 또는 인증 정보 요구',
  category: '피싱/링크 위험',
  weight: 20,
  matchedText: '본인 인증',
  evidence: '본인 인증 필요',
  severity: 'critical',
  types: ['피싱/기관 사칭'],
}

describe('calculateWarningScore', () => {
  it('치명 항목이 있으면 최소 위험 등급을 보장한다', () => {
    const result = calculateWarningScore([criticalHit], [], false)
    expect(result.grade).toBe('위험')
    expect(result.score).toBeGreaterThanOrEqual(50)
  })

  it('조합 경고가 있으면 경고 하한선을 적용한다', () => {
    const combo: ComboDefinition = {
      id: 'combo-phishing-auth',
      title: '기관 사칭 + 인증 유도 + 링크',
      requires: ['impersonation', 'credential-request'],
      bonus: 22,
      floor: '경고',
      types: ['피싱/기관 사칭'],
    }
    const result = calculateWarningScore([criticalHit], [combo], false)
    expect(result.grade).toBe('경고')
    expect(result.score).toBeGreaterThanOrEqual(85)
  })
})
