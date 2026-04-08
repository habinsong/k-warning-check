import { gradeDescription } from '@/shared/formatters'
import type {
  AiHookingChecklistResult,
  AnalysisResult,
  AnalysisType,
  DetectionHit,
  RiskGrade,
} from '@/shared/types'

function typeLead(type: AnalysisType) {
  switch (type) {
    case '피싱/기관 사칭':
      return '기관이나 플랫폼을 사칭한 인증 유도 흐름과 유사합니다.'
    case '투자/코인/리딩방':
      return '투자·코인 제안에서 자주 보이는 고위험 표현 조합이 감지되었습니다.'
    case '환급/복구/추적 대행':
      return '환급이나 복구 대행을 미끼로 비용을 요구하는 패턴과 유사합니다.'
    case '부업/재택/작업형':
      return '재택·부업 유인 문구에서 흔한 과장 표현이 포함되었습니다.'
    case '바이럴/과장 마케팅':
      return '후기 위장형 광고 또는 희소성 마케팅 패턴이 감지되었습니다.'
    case 'AI 자동화/구축 대행 과장':
      return 'AI 자동화 구축을 과장하는 문구와 유사한 표현이 포함되었습니다.'
    case 'AI 저품질 후킹글':
      return 'AI 티가 나는 저품질 후킹 문체와 근거 없는 빠른 성과 약속이 감지되었습니다.'
    case 'AI 바이럴/기기 바이럴':
      return '특정 AI 도구나 기기를 정답처럼 미는 홍보성 프레이밍이 강합니다.'
    case '권위팔이 AI 담론':
      return '검증하기 어려운 내부 사례와 트렌드 압박식 권위 호소가 포함되었습니다.'
    case '구식 모델/최신성 부족':
      return '현재 기준과 맞지 않을 수 있는 구식 모델 정보가 현역 추천처럼 쓰였습니다.'
    case '선택적 비교/정보 왜곡':
      return '비용, 속도, 성능 조건을 공정하게 맞추지 않은 선택적 비교 신호가 있습니다.'
    case '중고거래/에스크로 유사':
      return '안전거래를 가장한 결제 유도 흐름과 비슷한 신호가 있습니다.'
    case '일반 수상 제안':
      return '명확히 단정할 수는 없지만 여러 위험 신호가 겹쳤습니다.'
  }
}

function recommendedActions(
  grade: RiskGrade,
  hits: DetectionHit[],
  aiHookingChecklist: AiHookingChecklistResult,
) {
  const actions = new Set<string>()
  const highRiskGrade = grade === '매우 위험' || grade === '경고'
  const hitIds = new Set(hits.map((hit) => hit.ruleId))
  const hasMoneyRisk = [
    'upfront-payment',
    'refund-fee',
    'loan-repay-first',
    'gift-card',
    'guaranteed-profit',
  ].some((ruleId) => hitIds.has(ruleId))
  const hasLinkOrAuthRisk = [
    'credential-request',
    'impersonation',
    'smishing-delivery',
    'short-url',
  ].some((ruleId) => hitIds.has(ruleId))
  const hasAiViralityRisk =
    aiHookingChecklist.normalizedScore > 0 ||
    [
      'ai-outdated-model-reference',
      'ai-local-llm-overclaim',
      'ai-device-viral-framing',
      'ai-selective-comparison',
      'ai-clickbait-fast-setup',
      'ai-no-developer-hype',
      'ai-slick-low-density-style',
    ].some((ruleId) => hitIds.has(ruleId))

  if (hasMoneyRisk) {
    actions.add('송금, 결제, 예치금, 수수료 요청은 상대 정보와 사업자 정보를 먼저 확인하십시오.')
  }

  if (hasLinkOrAuthRisk) {
    actions.add('링크를 누르지 말고 공식 사이트 주소를 직접 입력해 로그인·인증 요청이 맞는지 확인하십시오.')
  }

  if (hitIds.has('external-messenger')) {
    actions.add('외부 메신저로 이동하라는 요청은 거래·인증 흐름을 끊고 공식 채널에서 다시 확인하십시오.')
  }

  if (hitIds.has('credential-request')) {
    actions.add('로그인, 인증번호, 신분증 사진 입력은 공식 사이트 주소를 직접 확인한 뒤 진행하십시오.')
  }

  if (hitIds.has('upfront-payment')) {
    actions.add('선입금이나 예치금 요구가 있으면 거래를 멈추고 대체 결제 수단을 확인하십시오.')
  }

  if (hasAiViralityRisk) {
    actions.add('AI 모델명, 지원 상태, 하드웨어 조건, 비용 비교가 현재 공식 문서와 같은 기준인지 따로 확인하십시오.')
    actions.add('광고성 문구와 기술 정보를 구분하고, 예외 조건과 한계가 빠진 문장은 비판적으로 읽으십시오.')
  }

  if (hitIds.has('ai-selective-comparison') || aiHookingChecklist.tags.includes('비교 왜곡')) {
    actions.add('비교표가 있으면 성능, 비용, 속도, 품질 조건이 같은 기준인지 다시 맞춰 보십시오.')
  }

  if (hitIds.has('ai-authority-trend-pressure') || aiHookingChecklist.tags.includes('권위팔이')) {
    actions.add('“현업은 다 이렇게 한다” 같은 문구는 출처와 실제 사례가 검증되기 전까지 업계 일반화로 보십시오.')
  }

  if (aiHookingChecklist.normalizedScore >= 25) {
    actions.add('모델명·버전 최신 여부, 경쟁 대안, 실제 사용 조건, 시간·비용 수치의 근거를 분리해서 확인하십시오.')
  }

  if (highRiskGrade && (hasMoneyRisk || hasLinkOrAuthRisk)) {
    actions.add('이미 링크를 열었거나 정보를 입력했다면 비밀번호 변경과 공식 고객센터 확인을 우선 진행하십시오.')
  }

  if (highRiskGrade && hasAiViralityRisk && !hasMoneyRisk && !hasLinkOrAuthRisk) {
    actions.add('공유, 구매, 도입 판단 전에 원문 주장별 출처와 반례를 최소 1개 이상 확인하십시오.')
  }

  if (actions.size === 0) {
    actions.add('강한 위험 신호는 낮지만, 핵심 주장과 출처가 맞는지 한 번 더 확인하십시오.')
  }

  return [...actions]
}

export function generateExplanation(
  result: Omit<AnalysisResult, 'summary' | 'recommendedActions'>,
  hits: DetectionHit[],
) {
  const { dimensionScores } = result
  const { aiHookingChecklist } = result
  let summary = `${typeLead(result.primaryType)} ${gradeDescription(result.grade)}`

  if (aiHookingChecklist.normalizedScore >= 75) {
    summary =
      'AI 저품질 후킹글 가능성이 높습니다. 구식 정보, 제품 밀어주기, 권위팔이, 비교 왜곡, 실행 난이도 은폐 신호가 강하게 겹쳤습니다.'
  } else if (aiHookingChecklist.normalizedScore >= 50) {
    summary =
      '사기성 단정보다는 AI 바이럴·후킹형 과장 가능성이 큽니다. 사실 일부가 맞더라도 비교 조건과 최신성은 따로 확인해야 합니다.'
  } else if (dimensionScores.scam < 30 && dimensionScores.virality >= 60) {
    summary =
      '사기성은 낮지만 과장·바이럴·선택적 비교 가능성이 높습니다. 사실 일부가 맞더라도 결론은 홍보성 프레이밍에 가깝습니다.'
  } else if (dimensionScores.aiSmell >= 70 && dimensionScores.factualityRisk >= 40) {
    summary =
      'AI 딸깍형 저품질 후킹글 가능성이 높습니다. 구식 모델 정보, 빠른 성과 약속, 근거 없는 비용 프레이밍이 함께 나타납니다.'
  } else if (dimensionScores.authorityAppeal >= 60) {
    summary =
      '방향성 비판은 타당할 수 있지만 권위 호소, 내부 사례 일반화, 검증되지 않은 수치가 섞여 있어 사실 확인이 필요합니다.'
  } else if (dimensionScores.comparisonRisk >= 60) {
    summary =
      '기술 설명이라기보다 특정 제품·기기 홍보 문구에 가깝습니다. 비교 조건과 대체재 누락 여부를 비판적으로 확인해야 합니다.'
  }

  return {
    summary,
    recommendedActions: recommendedActions(result.grade, hits, aiHookingChecklist),
  }
}
