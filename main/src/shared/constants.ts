import type { RiskGrade } from '@/shared/types'

export const HISTORY_LIMIT = 50

export const GRADE_ORDER: RiskGrade[] = ['낮음', '주의', '위험', '매우 위험', '경고']

export const GRADE_COLORS: Record<RiskGrade, string> = {
  낮음: 'text-[#2f7d6d]',
  주의: 'text-[#d38a2d]',
  위험: 'text-[#c46d2a]',
  '매우 위험': 'text-[#d64c2f]',
  경고: 'text-[#b9382d]',
}

export const GRADE_SURFACES: Record<RiskGrade, string> = {
  낮음: 'bg-[#eef8f4] border-[#b8ddd2]',
  주의: 'bg-[#fff8e8] border-[#efd18f]',
  위험: 'bg-[#fff1e5] border-[#e4b184]',
  '매우 위험': 'bg-[#fff0ed] border-[#ef9b8f]',
  경고: 'bg-[#ffe9e5] border-[#f39a90]',
}

export const STORAGE_KEYS = {
  history: 'kwc.history',
  providerState: 'kwc.provider-state',
  latestRecord: 'kwc.latest-record',
  popupStatus: 'kwc.popup-status',
  cryptoSalt: 'kwc.crypto-salt',
  geminiApiKey: 'kwc.gemini-api-key',
  groqApiKey: 'kwc.groq-api-key',
} as const

export const SECURE_STORE_SERVICE_NAME = 'K-WarningCheck'

export const DISCLAIMER_TEXT =
  '본 서비스는 warning.or.kr 및 공식 차단안내 페이지와 무관한 독립 서비스입니다. 공식 정부기관·공공기관 서비스가 아니며, 분석 결과는 참고용입니다. 최종 판단 전 출처와 결제 방식, 사업자 정보를 직접 확인하십시오.'

export const PRIVACY_WARNING_TEXT =
  '민감정보가 로컬에 저장될 수 있습니다. 공용 기기에서는 기록 저장과 원본 이미지 보관에 주의하십시오.'
