import type { BaselineDefinition } from '@/shared/types'

const hasAny = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.includes(keyword))

export const RISK_BASELINES: BaselineDefinition[] = [
  {
    id: 'kisa-smishing-link-app',
    title: '문자 내 URL 클릭 또는 앱 설치 유도',
    sourceName: 'KISA 보호나라·정부24 스미싱 예방 안내',
    sourceUrl:
      'https://www.gov.kr/portal/ntnadmNews/3796614',
    check: (text, hitIds) =>
      (text.includes('http') || text.includes('www.')) &&
      (hasAny(text, ['설치', '앱', '다운로드']) || hitIds.includes('credential-request')),
    guidance:
      '출처 불명 문자에 포함된 URL 클릭, 앱 설치, 계정 인증 요구는 스미싱 기준점으로 우선 경계합니다.',
  },
  {
    id: 'police-loan-repay-first',
    title: '저금리 대환대출을 미끼로 기존 대출 상환 요구',
    sourceName: '경찰청 통합신고대응단 대출사기 예방 기준',
    sourceUrl: 'https://www.counterscam112.go.kr/cyberCrime/voicePhishing.do',
    check: (text) =>
      hasAny(text, ['대환대출', '저금리', '정부지원 대출']) &&
      hasAny(text, ['기존 대출 상환', '먼저 상환', '상환 후 실행']),
    guidance:
      '저금리 전환을 명목으로 기존 대출금을 먼저 갚게 하는 흐름은 공식 예방 자료의 대표 대출사기 패턴입니다.',
  },
  {
    id: 'police-remote-control-app',
    title: '원격제어 또는 악성 앱 설치 유도',
    sourceName: '경찰청 통합신고대응단 악성 앱·원격제어 예방 기준',
    sourceUrl: 'https://www.counterscam112.go.kr/member/loginProc.do',
    check: (text, hitIds) =>
      hitIds.includes('remote-control') ||
      hasAny(text, ['원격제어', '팀뷰어', 'AnyDesk', '헬프유', '악성 앱']),
    guidance:
      '원격제어 앱이나 악성 앱 설치 유도는 경찰청 통합신고 안내에서 반복적으로 경고하는 핵심 보이스피싱 신호입니다.',
  },
  {
    id: 'police-family-impersonation',
    title: '지인·자녀 사칭 후 메신저 송금 유도',
    sourceName: '경찰청 통합신고대응단 메신저피싱 예방 기준',
    sourceUrl: 'https://www.counterscam112.go.kr/cyberCrime/voicePhishing.do',
    check: (text, hitIds) =>
      hitIds.includes('external-messenger') &&
      hasAny(text, ['엄마', '아빠', '자녀', '지인', '휴대폰 고장']) &&
      hasAny(text, ['송금', '계좌이체', '대신 결제']),
    guidance:
      '가족·지인 사칭 뒤 메신저로 송금이나 대리 결제를 요구하는 흐름은 공식 메신저피싱 사례와 맞닿습니다.',
  },
  {
    id: 'kisa-official-impersonation',
    title: '공공기관·금융기관 사칭 + 링크 포함 메시지',
    sourceName: 'KISA 통합신고센터 문자 제보 기준',
    sourceUrl: 'https://www.counterscam112.go.kr/member/loginProc.do',
    check: (text, hitIds) =>
      hitIds.includes('impersonation') &&
      (text.includes('http') || text.includes('www.') || hitIds.includes('short-url')),
    guidance:
      '택배, 공공기관, 금융기관 등을 사칭하면서 URL을 포함한 문자는 공식 제보 대상 기준과 직접 맞닿습니다.',
  },
  {
    id: 'ai-outdated-model-hype',
    title: '구형·검증 필요 AI 모델명으로 후킹',
    sourceName: 'Anthropic 모델 폐기 공지 및 Google AI 모델 문서 기준',
    sourceUrl: 'https://docs.anthropic.com/en/docs/about-claude/model-deprecations',
    check: (text, hitIds) =>
      hitIds.includes('ai-outdated-model-reference') &&
      hasAny(text, ['원탑', '0원', '30초', '10분', '외주 개발자', '끝납니다']),
    guidance:
      '구형 또는 검증 필요한 모델명을 최신 도구처럼 제시하면서 즉시 성과를 약속하면 AI 딸깍형 저품질 후킹 기준점으로 봅니다.',
  },
  {
    id: 'ai-local-llm-viral-overclaim',
    title: '로컬 LLM 성능·비용·기기 프레이밍 과장',
    sourceName: 'Google Gemma 모델 카드 및 Ollama 하드웨어 지원 문서 대조 기준',
    sourceUrl: 'https://ai.google.dev/gemma/docs/core/model_card_4',
    check: (_text, hitIds) =>
      hitIds.includes('ai-local-llm-overclaim') &&
      (hitIds.includes('ai-device-viral-framing') || hitIds.includes('ai-selective-comparison')),
    guidance:
      'Gemma 4 26B A4B 같은 모델명 자체보다, 특정 기기만 정답처럼 밀거나 비용·성능·프라이버시를 한쪽 조건으로만 비교하는 프레이밍을 과장 후킹으로 봅니다.',
  },
  {
    id: 'ai-authority-trend-claim',
    title: 'AI 권위팔이·내부 사례 일반화',
    sourceName: 'K-워닝체크 내부 비판 기준',
    sourceUrl: 'https://docs.anthropic.com/en/docs/about-claude/model-deprecations',
    check: (_text, hitIds) =>
      hitIds.includes('ai-authority-trend-pressure') &&
      hitIds.includes('ai-unverifiable-insider-claim'),
    guidance:
      '“현업은 다 이렇게 한다”, “모르면 뒤처진다”, 출처 없는 내부 썰이 함께 나오면 방향이 맞아 보여도 사실 검증이 필요한 AI 담론으로 봅니다.',
  },
  {
    id: 'ai-low-quality-hooking-style',
    title: 'AI 저품질 후킹 문체와 낮은 정보 밀도',
    sourceName: 'LLM 생성문 스타일로메트리 연구 및 K-워닝체크 휴리스틱',
    sourceUrl: 'https://arxiv.org/abs/2507.00838',
    check: (_text, hitIds) =>
      hitIds.includes('ai-slick-low-density-style') &&
      (hitIds.includes('ai-clickbait-fast-setup') || hitIds.includes('ai-absolute-tool-ranking')),
    guidance:
      '문장 구조는 매끈하지만 예외 조건과 근거가 빠지고 빠른 성과만 강조하면 AI 냄새가 나는 저밀도 후킹글로 봅니다.',
  },
]
