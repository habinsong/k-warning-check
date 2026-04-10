import { describe, expect, it } from 'vitest'
import { analyzeText } from '@/modules/analyzer/analyzeText'
import {
  renderAnalysisSummary,
  renderChecklistTitle,
  renderRecommendedActions,
  renderWebFreshnessSummary,
  translateBaseline,
} from '@/shared/localization'

describe('localization', () => {
  it('locale-neutral 결과를 영어로 다시 렌더링한다', () => {
    const result = analyzeText(
      '개발자 없이 1인 창업할 때 딱 이 4개 조합이면 끝납니다. Claude 3.5 Sonnet 원탑이고 0원 듭니다. 30초 뒤 결과물 보면 진짜 헛웃음 납니다.',
    )

    expect(renderAnalysisSummary(result, 'en')).toContain('AI')
    expect(renderRecommendedActions(result, 'en')[0]).toMatch(/[A-Za-z]/)
  })

  it('체크리스트와 기준점을 영어로 다시 렌더링한다', () => {
    const result = analyzeText(
      '정부지원 대환대출이 가능합니다. 기존 대출을 먼저 상환하시면 저금리로 전환해드립니다.',
    )

    const checklistTitle = renderChecklistTitle(result.checklist[0], 'en')
    const baseline = translateBaseline(result.matchedBaselines[0], 'en')

    expect(checklistTitle).toMatch(/[A-Za-z]/)
    expect(baseline.title).toMatch(/[A-Za-z]/)
    expect(baseline.guidance).toMatch(/[A-Za-z]/)
  })

  it('웹 최신성 결과를 현재 UI 언어에 맞춰 다시 렌더링한다', () => {
    expect(
      renderWebFreshnessSummary(
        {
          status: 'inconclusive',
          messageKey: 'skipped_no_provider',
          summary:
            '웹 검색이 가능한 Gemini 또는 검색 지원 Groq 모델이 없어 최신성 검증을 건너뛰었습니다.',
          checkedClaims: [],
          references: [],
        },
        'en',
      ),
    ).toContain('skipped')
  })
})
