import { translateAiTag, translateGrade } from '@/shared/localization'
import type { AnalysisType, RiskGrade, UiLocale } from '@/shared/types'

interface ScoreGaugeProps {
  score: number
  grade: RiskGrade
  primaryType: AnalysisType
  secondaryTypes: AnalysisType[]
  aiHookingTags: string[]
  locale?: UiLocale
}

function signalTypeLabel(type: AnalysisType, locale: UiLocale) {
  if (type === 'AI 저품질 후킹글') {
    return locale === 'ko' ? '딸깍' : 'Hook'
  }

  if (type === '일반 수상 제안') {
    return locale === 'ko' ? '일반' : 'General'
  }

  if (type.includes('피싱') || type.includes('기관 사칭')) {
    return locale === 'ko' ? '피싱' : 'Phish'
  }

  if (type.includes('권위팔이') || type.includes('구식') || type.includes('비교') || type === 'AI 자동화/구축 대행 과장') {
    return locale === 'ko' ? '후킹' : 'Hook'
  }

  if (type.includes('바이럴')) {
    return locale === 'ko' ? '바이럴' : 'Viral'
  }

  if (type.includes('투자') || type.includes('환급') || type.includes('중고거래') || type.includes('수상')) {
    return locale === 'ko' ? '사기' : 'Scam'
  }

  return locale === 'ko' ? '일반' : 'General'
}

function buildSignalTypeLabels(
  primaryType: AnalysisType,
  secondaryTypes: AnalysisType[],
  aiHookingTags: string[],
  locale: UiLocale,
) {
  const labels: string[] = []
  const allTypes = [primaryType, ...secondaryTypes]

  for (const type of allTypes) {
    const label = signalTypeLabel(type, locale)

    if (!labels.includes(label)) {
      labels.push(label)
    }

    if (labels.length >= 2) {
      break
    }
  }

  const shouldShowClickLabel =
    !labels.includes(locale === 'ko' ? '딸깍' : 'Hook') &&
    (allTypes.some((type) => type.includes('AI')) || aiHookingTags.includes('AI 냄새 강함'))

  if (shouldShowClickLabel) {
    if (labels.length >= 2) {
      labels[1] = locale === 'ko' ? '딸깍' : 'Hook'
    } else {
      labels.push(locale === 'ko' ? '딸깍' : 'Hook')
    }
  }

  return labels.slice(0, 2)
}

function signalTypeTextColor(label: string) {
  switch (label) {
    case '피싱':
      return 'text-[#ffb2a5]'
    case '사기':
      return 'text-[#ffbe82]'
    case '후킹':
      return 'text-[#ffd06d]'
    case '바이럴':
      return 'text-[#cfc8ff]'
    case '딸깍':
      return 'text-[#ffd59a]'
    default:
      return 'text-[#eef1ff]'
  }
}

function gradeTextColor(grade: RiskGrade) {
  switch (grade) {
    case '낮음':
      return 'text-[#9fe6d4]'
    case '주의':
      return 'text-[#f8db8a]'
    case '위험':
      return 'text-[#ffc08c]'
    case '매우 위험':
      return 'text-[#ff9f8b]'
    case '경고':
      return 'text-[#ff8d84]'
  }
}

export function ScoreGauge({
  score,
  grade,
  primaryType,
  secondaryTypes,
  aiHookingTags,
  locale = 'ko',
}: ScoreGaugeProps) {
  const neutralResult =
    score <= 0 &&
    primaryType === '일반 수상 제안' &&
    secondaryTypes.length === 0 &&
    aiHookingTags.length === 0
  const typeLabels = neutralResult
    ? [locale === 'ko' ? '없음' : 'None']
    : buildSignalTypeLabels(primaryType, secondaryTypes, aiHookingTags, locale)
  const scoreText = `${Math.round(score)}%`
  const visibleTags = aiHookingTags.slice(0, 2)
  const overflowCount = Math.max(aiHookingTags.length - visibleTags.length, 0)

  return (
    <section className="overflow-hidden rounded-lg bg-[#2c3470] text-white shadow-sm">
      <div className="h-2 bg-[#75a9dc]" />
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 pr-2">
            <div className="text-[11px] font-semibold leading-none uppercase tracking-[0.14em] text-[#f2a14a]">
              {locale === 'ko' ? 'Signal Score' : 'Signal Score'}
            </div>
            <div className="mt-1 text-[34px] font-semibold leading-none tabular-nums">{scoreText}</div>
            {visibleTags.length > 0 ? (
              <div className="mt-1.5 flex max-w-full flex-wrap items-center justify-start gap-1.5">
                {visibleTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex max-w-full items-center justify-center truncate whitespace-nowrap rounded-full border border-[#8fa0ff]/30 bg-[#6d78d6]/20 px-3 py-0.5 text-center text-[11px] font-semibold leading-4 text-[#eef1ff]"
                    title={tag}
                  >
                    {translateAiTag(tag, locale)}
                  </span>
                ))}
                {overflowCount > 0 ? (
                  <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-[#8fa0ff]/30 bg-[#6d78d6]/20 px-3 py-0.5 text-center text-[11px] font-semibold leading-4 text-[#eef1ff]">
                    +{overflowCount}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 self-stretch">
            <div className="flex min-w-[54px] flex-col justify-center rounded-md border border-white/20 bg-white/5 px-2 py-1.5 text-center">
              <div className="text-[10px] text-[#c8d0e5]">{locale === 'ko' ? '유형' : 'Type'}</div>
              <div className="mt-1 break-keep text-[15px] font-extrabold leading-tight">
                {typeLabels.map((label, index) => (
                  <span key={`${label}-${index}`}>
                    {index > 0 ? <span className="px-1 text-[#dbe1f3]">·</span> : null}
                    <span className={signalTypeTextColor(label)}>{label}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex min-w-[54px] flex-col justify-center rounded-md border border-white/20 bg-white/5 px-2 py-1.5 text-center">
              <div className="text-[10px] text-[#c8d0e5]">{locale === 'ko' ? '등급' : 'Grade'}</div>
              <div className={`mt-1 text-[15px] font-extrabold leading-none ${gradeTextColor(grade)}`}>
                {translateGrade(grade, locale)}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
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
