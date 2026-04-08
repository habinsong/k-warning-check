import { GRADE_COLORS, GRADE_SURFACES } from '@/shared/constants'
import type { RiskGrade } from '@/shared/types'

interface GradeBadgeProps {
  grade: RiskGrade
}

export function GradeBadge({ grade }: GradeBadgeProps) {
  return (
    <span
      className={[
        'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold',
        'shrink-0 whitespace-nowrap',
        GRADE_COLORS[grade],
        GRADE_SURFACES[grade],
      ].join(' ')}
    >
      {grade}
    </span>
  )
}
