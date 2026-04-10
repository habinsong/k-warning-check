import { translateGrade } from '@/shared/localization'
import { GRADE_COLORS, GRADE_SURFACES } from '@/shared/constants'
import type { RiskGrade, UiLocale } from '@/shared/types'

interface GradeBadgeProps {
  grade: RiskGrade
  locale?: UiLocale
}

export function GradeBadge({ grade, locale = 'ko' }: GradeBadgeProps) {
  return (
    <span
      className={[
        'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold',
        'shrink-0 whitespace-nowrap',
        GRADE_COLORS[grade],
        GRADE_SURFACES[grade],
      ].join(' ')}
    >
      {translateGrade(grade, locale)}
    </span>
  )
}
