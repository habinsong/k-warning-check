import { describe, expect, it } from 'vitest'
import { AI_HOOKING_CHECKLIST_DEFINITIONS } from '@/data/aiHookingChecklist'
import { analyzeText } from '@/modules/analyzer/analyzeText'

describe('analyzeText', () => {
  it('AI 저품질 후킹글 내부 체크리스트 100개를 유지한다', () => {
    expect(AI_HOOKING_CHECKLIST_DEFINITIONS).toHaveLength(100)

    const categoryCounts = AI_HOOKING_CHECKLIST_DEFINITIONS.reduce<Record<string, number>>(
      (counts, definition) => ({
        ...counts,
        [definition.category]: (counts[definition.category] ?? 0) + 1,
      }),
      {},
    )

    expect(Object.values(categoryCounts)).toEqual([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])
  })

  it('외부 메신저 + 선입금 + 수익 보장을 위험 이상으로 판정한다', () => {
    const result = analyzeText(
      '텔레그램으로 문의 주세요. 선입금 후 진행되며 원금 보장 수익 보장 가능합니다.',
    )

    expect(['위험', '매우 위험', '경고']).toContain(result.grade)
    expect(result.primaryType).toBe('투자/코인/리딩방')
  })

  it('기관 사칭 + 링크 + 인증 유도를 경고로 판정한다', () => {
    const result = analyzeText(
      '금감원 안내입니다. bit.ly/test 링크에서 본인 인증 후 계정 복구를 진행하세요.',
    )

    expect(result.grade).toBe('경고')
    expect(result.primaryType).toBe('피싱/기관 사칭')
  })

  it('정상 안내 문구는 감점이 적용된다', () => {
    const result = analyzeText('주문이 정상적으로 접수되었습니다. 보안 주의 안내를 확인하세요.')
    expect(result.score).toBeLessThan(30)
  })

  it('대환대출 선상환 요구를 위험 이상으로 판정한다', () => {
    const result = analyzeText(
      '정부지원 대환대출이 가능합니다. 기존 대출을 먼저 상환하시면 저금리로 전환해드립니다.',
    )

    expect(['위험', '매우 위험', '경고']).toContain(result.grade)
    expect(result.matchedBaselines.some((baseline) => baseline.id === 'police-loan-repay-first')).toBe(
      true,
    )
  })

  it('AI 딸깍형 저품질 후킹글을 감지한다', () => {
    const result = analyzeText(
      '개발자 없이 1인 창업할 때 딱 이 4개 조합이면 끝납니다. Claude 3.5 Sonnet 원탑이고 0원 듭니다. 30초 뒤 결과물 보면 진짜 헛웃음 납니다. 예전 같으면 외주 개발자한테 200만 원 줬어야 합니다.',
    )

    expect(['주의', '위험', '매우 위험', '경고']).toContain(result.grade)
    expect(result.primaryType).toBe('AI 저품질 후킹글')
    expect(result.aiHookingChecklist.normalizedScore).toBeGreaterThanOrEqual(25)
    expect(new Set(result.aiHookingChecklist.topFindings.map((finding) => finding.userLabel)).size).toBe(
      result.aiHookingChecklist.topFindings.length,
    )
    expect(result.aiHookingChecklist.tags).toContain('구식 정보 재탕')
    expect(result.aiHookingChecklist.tags).toContain('비용/성과 과장')
    expect(result.dimensionScores.aiSmell).toBeGreaterThanOrEqual(70)
    expect(result.dimensionScores.factualityRisk).toBeGreaterThanOrEqual(30)
    expect(result.matchedBaselines.some((baseline) => baseline.id === 'ai-outdated-model-hype')).toBe(
      true,
    )
  })

  it('로컬 LLM 성능 과장과 하드웨어 바이럴 문맥을 감지한다', () => {
    const result = analyzeText(
      'Mac Mini 하나면 AI를 로컬에서 돌릴 수 있다. Google Gemma 4 26B + Ollama 조합. 설치부터 API 연동까지 10분이면 끝남. 4B급 속도로 26B급 성능이 나옴. 내 Mac이 AI 서버가 되는 시대.',
    )

    expect(['위험', '매우 위험', '경고']).toContain(result.grade)
    expect(result.primaryType).toBe('AI 바이럴/기기 바이럴')
    expect(result.signals).not.toContain('구형 AI 모델명을 현역 추천처럼 제시')
    expect(result.aiHookingChecklist.topFindings.some((finding) => finding.userLabel === '특정 제품만 과하게 띄움')).toBe(
      true,
    )
    expect(result.dimensionScores.comparisonRisk).toBeGreaterThanOrEqual(60)
    expect(result.matchedBaselines.some((baseline) => baseline.id === 'ai-local-llm-viral-overclaim')).toBe(
      true,
    )
  })

  it('AI 바이럴 반박 문맥은 과잉 경고하지 않는다', () => {
    const result = analyzeText(
      '병렬 AI AGENT로 FULL AUTOMATION 된다고 홍보하더니 코드 품질 개판이었다. 결국 그냥 돌아만 가는 코드였고, 이게 바이브 코딩의 허와 실이다.',
    )

    expect(result.score).toBeLessThan(30)
  })

  it('AI 권위팔이 반박글도 내부 사례 일반화는 주의로 잡는다', () => {
    const result = analyzeText(
      '엔트로픽에서 우리 직원들은 수개월전부터 코드 1도 안 짜요. 병렬 AI AGENT로 FULL AUTOMATION 돌립니다. 하네스 모르면 트렌드에 뒤떨어지는 개발자예요. 그런데 50만 라인 코드가 유실됐다는 말도 있어 사실 확인이 필요합니다.',
    )

    expect(['주의', '위험', '매우 위험']).toContain(result.grade)
    expect(result.primaryType).toBe('권위팔이 AI 담론')
    expect(result.aiHookingChecklist.tags).toContain('권위팔이')
    expect(result.dimensionScores.authorityAppeal).toBeGreaterThanOrEqual(60)
    expect(result.matchedBaselines.some((baseline) => baseline.id === 'ai-authority-trend-claim')).toBe(
      true,
    )
  })
})
