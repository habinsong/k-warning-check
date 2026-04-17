import { GradeBadge } from '@/popup/components/GradeBadge'
import {
  formatDateTime,
  getPrivacyWarningText,
  isNeutralAnalysisResult,
  renderAnalysisSummary,
  renderChecklistTitle,
  renderRecommendedActions,
  renderWebFreshnessSummary,
  translateAiTag,
  translateAnalysisType,
  translateBaseline,
  translateDimensionLabel,
} from '@/shared/localization'
import type { AnalysisDimensionScores, StoredAnalysisRecord, UiLocale } from '@/shared/types'

interface RecordCardProps {
  record: StoredAnalysisRecord
  locale?: UiLocale
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

function renderProviderName(provider: NonNullable<StoredAnalysisRecord['llmAnalysis']>['provider']) {
  if (provider === 'gemini') {
    return 'Gemini'
  }

  if (provider === 'groq') {
    return 'Groq'
  }

  return 'Codex'
}

export function RecordCard({ record, locale = 'ko' }: RecordCardProps) {
  const neutralResult = isNeutralAnalysisResult(record.result)
  const matchedBaselines = record.result.matchedBaselines ?? []
  const dimensionScores = record.result.dimensionScores
  const aiHookingChecklist = record.result.aiHookingChecklist
  const webFreshnessVerification = record.result.webFreshnessVerification
  const llmAnalysis = record.llmAnalysis
  const renderedSummary = renderAnalysisSummary(record.result, locale)
  const conciseActions = [...new Set(renderRecommendedActions(record.result, locale).map((action) => action.trim()).filter(Boolean))]
    .slice(0, 2)
    .join(' ')

  return (
    <section className="rounded-lg border border-[#d6d9e2] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {renderedSummary ? (
            <div className="whitespace-pre-wrap break-words text-sm font-semibold leading-5 text-[#27304d]">
              {renderedSummary}
            </div>
          ) : null}
          <div className="mt-1 text-xs leading-4 text-[#6c7488]">{formatDateTime(record.createdAt, locale)}</div>
        </div>
        <GradeBadge grade={record.result.grade} locale={locale} />
      </div>

      {!neutralResult ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {[record.result.primaryType, ...record.result.secondaryTypes].map((type) => (
            <span
              key={type}
              className="max-w-full break-words rounded-full bg-[#eef0ff] px-2 py-1 text-[11px] font-medium leading-4 text-[#5f68c7]"
            >
              {translateAnalysisType(type, locale)}
            </span>
          ))}
        </div>
      ) : null}

      {dimensionScores ? (
        <div className="mt-4 border-t border-[#d6d9e2] pt-4">
          <div className="text-xs font-semibold text-[#6c7488]">{locale === 'ko' ? '비판 판별 축' : 'Critical Axes'}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DIMENSION_LABELS.map(([key]) => (
              <div key={key} className="border-b border-[#edf0f6] pb-2">
                <div className="flex items-center justify-between gap-2 text-[11px] leading-4 text-[#6c7488]">
                  <span className="min-w-0 break-keep">{translateDimensionLabel(key, locale)}</span>
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
          <div className="text-xs font-semibold text-[#c46d2a]">{locale === 'ko' ? 'AI 후킹 체크' : 'AI Hook Check'}</div>
          <div className="mt-1 break-words text-sm font-semibold leading-5 text-[#27304d]">
            {aiHookingChecklist.normalizedScore}/100 ·{' '}
            {locale === 'ko'
              ? `치명 항목 ${aiHookingChecklist.criticalCount}개`
              : `${aiHookingChecklist.criticalCount} critical items`}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {aiHookingChecklist.tags.map((tag) => (
              <span
                key={tag}
                className="max-w-full break-words rounded-full bg-[#fff3e6] px-2 py-1 text-[11px] font-medium leading-4 text-[#a85923]"
              >
                {translateAiTag(tag, locale)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {webFreshnessVerification ? (
        <div className="mt-4 border-t border-[#d6d9e2] pt-4">
          <div className="text-xs font-semibold text-[#6c7488]">{locale === 'ko' ? '웹 최신성 검증' : 'Web Freshness Check'}</div>
          <div className="mt-2 break-words text-sm font-medium leading-5 text-[#27304d]">
            {renderWebFreshnessSummary(webFreshnessVerification, locale)}
          </div>
          {webFreshnessVerification.references.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {webFreshnessVerification.references.map((reference) => (
                <a
                  key={`${reference.title}-${reference.url}`}
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-full break-words rounded-full bg-[#eef0ff] px-2 py-1 text-[11px] font-medium leading-4 text-[#5f68c7]"
                >
                  {reference.title}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {llmAnalysis ? (
        <div className="mt-4 border-t border-[#d6d9e2] pt-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-[#6c7488]">{locale === 'ko' ? 'LLM 분석' : 'LLM Analysis'}</div>
            <div className="text-[11px] font-medium text-[#6d78d6]">
              {renderProviderName(llmAnalysis.provider)} · {llmAnalysis.durationMs}ms
            </div>
          </div>
          {llmAnalysis.status === 'success' && llmAnalysis.responseText.trim() ? (
            <div className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-[#edf0f6] bg-[#f8f9fb] px-3 py-3 text-sm leading-6 text-[#27304d]">
              {llmAnalysis.responseText}
            </div>
          ) : null}
          {llmAnalysis.evidence.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs leading-5 text-[#4e5971]">
              {llmAnalysis.evidence.map((item) => (
                <li key={item} className="break-words">
                  • {item}
                </li>
              ))}
            </ul>
          ) : null}
          {llmAnalysis.freshnessNote ? (
            <div className="mt-2 break-words text-xs leading-5 text-[#5a6382]">
              {llmAnalysis.freshnessNote}
            </div>
          ) : null}
          {llmAnalysis.status !== 'success' && llmAnalysis.error ? (
            <div className="mt-2 break-words rounded-lg border border-[#f1d6d6] bg-[#fff7f7] px-3 py-2 text-xs leading-5 text-[#a14a4a]">
              {llmAnalysis.error}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {matchedBaselines.length > 0 ? (
          <div className="border-t border-[#d6d9e2] pt-4">
            <div className="text-xs font-semibold text-[#6c7488]">{locale === 'ko' ? '판별 기준점' : 'Reference Baselines'}</div>
            <ul className="mt-2 space-y-3">
              {matchedBaselines.map((baseline) => {
                const localizedBaseline = translateBaseline(baseline, locale)

                return (
                <li
                  key={baseline.id}
                  className="border-l-2 border-[#f2a14a] pl-3 text-sm leading-5 text-[#27304d]"
                >
                  <div className="break-words font-medium">{localizedBaseline.title}</div>
                  <div className="mt-1 break-words text-xs leading-4 text-[#6c7488]">{localizedBaseline.guidance}</div>
                  <a
                    href={localizedBaseline.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex max-w-full break-words text-[11px] font-medium leading-4 text-[#6d78d6] underline"
                  >
                    {localizedBaseline.sourceName}
                  </a>
                </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {record.result.checklist.length > 0 ? (
        <div className="border-t border-[#d6d9e2] pt-4">
          <div className="text-xs font-semibold text-[#6c7488]">{locale === 'ko' ? '체크리스트' : 'Checklist'}</div>
          <ul className="mt-2 divide-y divide-[#edf0f6] border-y border-[#edf0f6]">
            {record.result.checklist.map((item) => (
              <li key={item.id} className="py-2 text-sm leading-5 text-[#4e5971]">
                <div className="break-words font-medium text-[#27304d]">{renderChecklistTitle(item, locale)}</div>
                <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-4 text-[#6c7488]">
                  {item.evidence}
                </div>
              </li>
            ))}
          </ul>
        </div>
        ) : null}

        {conciseActions ? (
        <div className="border-t border-[#d6d9e2] pt-4">
          <div className="text-xs font-semibold text-[#6c7488]">{locale === 'ko' ? '권장 행동' : 'Recommended Actions'}</div>
          <div className="mt-2 rounded-lg border border-[#edf0f6] bg-[#f8f9fb] px-3 py-3 text-sm leading-6 text-[#4e5971]">
            {conciseActions}
          </div>
        </div>
        ) : null}
      </div>

      <div className="mt-4 break-words border-l-2 border-[#9aa1ff] bg-[#f1f2ff] px-3 py-2 text-xs leading-4 text-[#3e478f]">
        {getPrivacyWarningText(locale)}
      </div>
    </section>
  )
}
