import { formatScore } from '@/shared/formatters'
import type { AnalysisType, RiskGrade } from '@/shared/types'

interface ScoreGaugeProps {
  score: number
  grade: RiskGrade
  primaryType: AnalysisType
}

function signalTypeLabel(type: AnalysisType) {
  if (type === '일반 수상 제안') {
    return '일반'
  }

  if (type.includes('피싱') || type.includes('기관 사칭')) {
    return '피싱'
  }

  if (type.includes('AI') || type.includes('권위팔이') || type.includes('구식') || type.includes('비교')) {
    return '후킹'
  }

  if (type.includes('바이럴')) {
    return '바이럴'
  }

  if (type.includes('투자') || type.includes('환급') || type.includes('중고거래') || type.includes('수상')) {
    return '사기'
  }

  return '일반'
}

export function ScoreGauge({ score, grade, primaryType }: ScoreGaugeProps) {
  const typeLabel = signalTypeLabel(primaryType)

  return (
    <section className="overflow-hidden rounded-lg bg-[#2c3470] text-white shadow-sm">
      <div className="h-2 bg-[#75a9dc]" />
      <div className="p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f2a14a]">
              Signal Score
            </div>
            <div className="mt-2 text-[34px] font-semibold leading-none tabular-nums">{formatScore(score)}</div>
          </div>
          <div className="flex shrink-0 items-end gap-2">
            <div className="min-w-[58px] rounded-md border border-white/20 bg-white/5 px-2.5 py-2 text-right">
              <div className="text-[11px] text-[#c8d0e5]">유형</div>
              <div className="mt-1 text-lg font-semibold leading-none">{typeLabel}</div>
            </div>
            <div className="min-w-[58px] rounded-md border border-white/20 bg-white/5 px-2.5 py-2 text-right">
              <div className="text-[11px] text-[#c8d0e5]">등급</div>
              <div className="mt-1 text-lg font-semibold leading-none">{grade}</div>
            </div>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className={`h-full rounded-full transition-all ${
              grade === '낮음'
                ? 'bg-[#62b69f]'
                : grade === '주의'
                  ? 'bg-[#e7c45f]'
                  : grade === '위험'
                    ? 'bg-[#e89042]'
                    : grade === '매우 위험'
                      ? 'bg-[#e1663f]'
                      : 'bg-[#d64c2f]'
            }`}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
      </div>
    </section>
  )
}
