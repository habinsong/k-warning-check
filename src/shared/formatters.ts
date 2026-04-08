import type { RiskGrade } from '@/shared/types'

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function formatScore(score: number) {
  return `${Math.round(score)}/100`
}

export function gradeDescription(grade: RiskGrade) {
  switch (grade) {
    case '낮음':
      return '즉시 차단 수준은 아니지만 기본 확인이 필요합니다.'
    case '주의':
      return '조심해야 할 신호가 여러 개 감지되었습니다.'
    case '위험':
      return '즉시 응답이나 결제를 미루고 추가 확인이 필요합니다.'
    case '매우 위험':
      return '고위험 신호가 강하게 겹쳤습니다. 응답·결제·인증을 멈추고 추가 확인이 필요합니다.'
    case '경고':
      return '치명적 조합이 감지되었습니다. 송금과 인증을 중단하는 편이 안전합니다.'
  }
}
