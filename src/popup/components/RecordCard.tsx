import { GradeBadge } from '@/popup/components/GradeBadge'
import { PRIVACY_WARNING_TEXT } from '@/shared/constants'
import { formatDateTime } from '@/shared/formatters'
import type { AnalysisDimensionScores, StoredAnalysisRecord } from '@/shared/types'

interface RecordCardProps {
  record: StoredAnalysisRecord
}

const DIMENSION_LABELS: Array<[keyof AnalysisDimensionScores, string]> = [
  ['scam', '사기성'],
  ['virality', '바이럴성'],
  ['aiSmell', 'AI 냄새'],
  ['factualityRisk', '최신성 위험'],
  ['comparisonRisk', '선택적 비교'],
  ['authorityAppeal', '권위호소'],
  ['hookingStyle', '후킹 문체'],
]

export function RecordCard({ record }: RecordCardProps) {
  const matchedBaselines = record.result.matchedBaselines ?? []
  const dimensionScores = record.result.dimensionScores
  const aiHookingChecklist = record.result.aiHookingChecklist
  const conciseActions = [...new Set(record.result.recommendedActions.map((action) => action.trim()).filter(Boolean))]
    .slice(0, 2)
    .join(' ')

  return (
    <section className="rounded-lg border border-[#d6d9e2] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="whitespace-pre-wrap break-words text-sm font-semibold leading-5 text-[#27304d]">
            {record.result.summary}
          </div>
          <div className="mt-1 text-xs leading-4 text-[#6c7488]">{formatDateTime(record.createdAt)}</div>
        </div>
        <GradeBadge grade={record.result.grade} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {[record.result.primaryType, ...record.result.secondaryTypes].map((type) => (
          <span
            key={type}
            className="max-w-full break-words rounded-full bg-[#eef0ff] px-2 py-1 text-[11px] font-medium leading-4 text-[#5f68c7]"
          >
            {type}
          </span>
        ))}
      </div>

      {dimensionScores ? (
        <div className="mt-4 border-t border-[#d6d9e2] pt-4">
          <div className="text-xs font-semibold text-[#6c7488]">비판 판별 축</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DIMENSION_LABELS.map(([key, label]) => (
              <div key={key} className="border-b border-[#edf0f6] pb-2">
                <div className="flex items-center justify-between gap-2 text-[11px] leading-4 text-[#6c7488]">
                  <span className="min-w-0 break-keep">{label}</span>
                  <span className="font-semibold text-[#27304d]">{dimensionScores[key]}/100</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[#edf0f6]">
                  <div
                    className="h-1.5 rounded-full bg-[#6d78d6]"
                    style={{ width: `${dimensionScores[key]}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {aiHookingChecklist?.tags.length ? (
        <div className="mt-4 border-t border-[#efd18f] pt-4">
          <div className="text-xs font-semibold text-[#c46d2a]">AI 후킹 체크</div>
          <div className="mt-1 break-words text-sm font-semibold leading-5 text-[#27304d]">
            {aiHookingChecklist.normalizedScore}/100 · 치명 항목 {aiHookingChecklist.criticalCount}개
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {aiHookingChecklist.tags.map((tag) => (
              <span
                key={tag}
                className="max-w-full break-words rounded-full bg-[#fff3e6] px-2 py-1 text-[11px] font-medium leading-4 text-[#a85923]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {matchedBaselines.length > 0 ? (
          <div className="border-t border-[#d6d9e2] pt-4">
            <div className="text-xs font-semibold text-[#6c7488]">판별 기준점</div>
            <ul className="mt-2 space-y-3">
              {matchedBaselines.map((baseline) => (
                <li
                  key={baseline.id}
                  className="border-l-2 border-[#f2a14a] pl-3 text-sm leading-5 text-[#27304d]"
                >
                  <div className="break-words font-medium">{baseline.title}</div>
                  <div className="mt-1 break-words text-xs leading-4 text-[#6c7488]">{baseline.guidance}</div>
                  <a
                    href={baseline.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex max-w-full break-words text-[11px] font-medium leading-4 text-[#6d78d6] underline"
                  >
                    {baseline.sourceName}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="border-t border-[#d6d9e2] pt-4">
          <div className="text-xs font-semibold text-[#6c7488]">체크리스트</div>
          <ul className="mt-2 divide-y divide-[#edf0f6] border-y border-[#edf0f6]">
            {record.result.checklist.map((item) => (
              <li key={item.id} className="py-2 text-sm leading-5 text-[#4e5971]">
                <div className="break-words font-medium text-[#27304d]">{item.title}</div>
                <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-4 text-[#6c7488]">
                  {item.evidence}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-[#d6d9e2] pt-4">
          <div className="text-xs font-semibold text-[#6c7488]">권장 행동</div>
          <div className="mt-2 rounded-lg border border-[#edf0f6] bg-[#f8f9fb] px-3 py-3 text-sm leading-6 text-[#4e5971]">
            {conciseActions}
          </div>
        </div>
      </div>

      <div className="mt-4 break-words border-l-2 border-[#9aa1ff] bg-[#f1f2ff] px-3 py-2 text-xs leading-4 text-[#3e478f]">
        {PRIVACY_WARNING_TEXT}
      </div>
    </section>
  )
}
