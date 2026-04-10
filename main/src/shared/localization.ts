import type {
  AnalysisResult,
  AnalysisSummaryTemplateId,
  AnalysisType,
  BaselineMatch,
  ChecklistItem,
  DetectedLanguage,
  RiskCategory,
  RiskGrade,
  UiLocale,
  WebFreshnessVerification,
} from '@/shared/types'

const LOCALE_TAGS: Record<UiLocale, string> = {
  ko: 'ko-KR',
  en: 'en-US',
}

const GRADE_LABELS: Record<UiLocale, Record<RiskGrade, string>> = {
  ko: {
    낮음: '낮음',
    주의: '주의',
    위험: '위험',
    '매우 위험': '매우 위험',
    경고: '경고',
  },
  en: {
    낮음: 'Low',
    주의: 'Caution',
    위험: 'Risky',
    '매우 위험': 'Very High Risk',
    경고: 'Alert',
  },
}

const GRADE_DESCRIPTIONS: Record<UiLocale, Record<RiskGrade, string>> = {
  ko: {
    낮음: '즉시 차단 수준은 아니지만 기본 확인이 필요합니다.',
    주의: '조심해야 할 신호가 여러 개 감지되었습니다.',
    위험: '즉시 응답이나 결제를 미루고 추가 확인이 필요합니다.',
    '매우 위험': '고위험 신호가 강하게 겹쳤습니다. 응답·결제·인증을 멈추고 추가 확인이 필요합니다.',
    경고: '치명적 조합이 감지되었습니다. 송금과 인증을 중단하는 편이 안전합니다.',
  },
  en: {
    낮음: 'It is not an immediate block case, but the core claims still need checking.',
    주의: 'Several caution signals were detected.',
    위험: 'Pause any response or payment and verify the claims first.',
    '매우 위험': 'Multiple high-risk signals overlap. Stop responding, paying, or authenticating until verified.',
    경고: 'A critical combination was detected. Stopping payment and authentication is the safer choice.',
  },
}

const TYPE_LABELS: Record<UiLocale, Record<AnalysisType, string>> = {
  ko: {
    '피싱/기관 사칭': '피싱/기관 사칭',
    '투자/코인/리딩방': '투자/코인/리딩방',
    '환급/복구/추적 대행': '환급/복구/추적 대행',
    '부업/재택/작업형': '부업/재택/작업형',
    '바이럴/과장 마케팅': '바이럴/과장 마케팅',
    'AI 자동화/구축 대행 과장': 'AI 자동화/구축 대행 과장',
    'AI 저품질 후킹글': 'AI 저품질 후킹글',
    'AI 바이럴/기기 바이럴': 'AI 바이럴/기기 바이럴',
    '권위팔이 AI 담론': '권위팔이 AI 담론',
    '구식 모델/최신성 부족': '구식 모델/최신성 부족',
    '선택적 비교/정보 왜곡': '선택적 비교/정보 왜곡',
    '중고거래/에스크로 유사': '중고거래/에스크로 유사',
    '일반 수상 제안': '일반 수상 제안',
  },
  en: {
    '피싱/기관 사칭': 'Phishing / Impersonation',
    '투자/코인/리딩방': 'Investment / Crypto Pitch',
    '환급/복구/추적 대행': 'Refund / Recovery Service',
    '부업/재택/작업형': 'Side Hustle / Remote Work Pitch',
    '바이럴/과장 마케팅': 'Viral / Hype Marketing',
    'AI 자동화/구축 대행 과장': 'AI Automation Build-Out Hype',
    'AI 저품질 후킹글': 'Low-Quality AI Hook Post',
    'AI 바이럴/기기 바이럴': 'AI Viral / Device Viral',
    '권위팔이 AI 담론': 'Authority-Driven AI Narrative',
    '구식 모델/최신성 부족': 'Outdated Model / Weak Freshness',
    '선택적 비교/정보 왜곡': 'Selective Comparison / Distortion',
    '중고거래/에스크로 유사': 'Escrow-Like Marketplace Pitch',
    '일반 수상 제안': 'General Suspicious Pitch',
  },
}

const TYPE_LEADS: Record<UiLocale, Record<AnalysisType, string>> = {
  ko: {
    '피싱/기관 사칭': '기관이나 플랫폼을 사칭한 인증 유도 흐름과 유사합니다.',
    '투자/코인/리딩방': '투자·코인 제안에서 자주 보이는 고위험 표현 조합이 감지되었습니다.',
    '환급/복구/추적 대행': '환급이나 복구 대행을 미끼로 비용을 요구하는 패턴과 유사합니다.',
    '부업/재택/작업형': '재택·부업 유인 문구에서 흔한 과장 표현이 포함되었습니다.',
    '바이럴/과장 마케팅': '후기 위장형 광고 또는 희소성 마케팅 패턴이 감지되었습니다.',
    'AI 자동화/구축 대행 과장': 'AI 자동화 구축을 과장하는 문구와 유사한 표현이 포함되었습니다.',
    'AI 저품질 후킹글': 'AI 티가 나는 저품질 후킹 문체와 근거 없는 빠른 성과 약속이 감지되었습니다.',
    'AI 바이럴/기기 바이럴': '특정 AI 도구나 기기를 정답처럼 미는 홍보성 프레이밍이 강합니다.',
    '권위팔이 AI 담론': '검증하기 어려운 내부 사례와 트렌드 압박식 권위 호소가 포함되었습니다.',
    '구식 모델/최신성 부족': '현재 기준과 맞지 않을 수 있는 구식 모델 정보가 현역 추천처럼 쓰였습니다.',
    '선택적 비교/정보 왜곡': '비용, 속도, 성능 조건을 공정하게 맞추지 않은 선택적 비교 신호가 있습니다.',
    '중고거래/에스크로 유사': '안전거래를 가장한 결제 유도 흐름과 비슷한 신호가 있습니다.',
    '일반 수상 제안': '명확히 단정할 수는 없지만 여러 위험 신호가 겹쳤습니다.',
  },
  en: {
    '피싱/기관 사칭': 'It resembles an authentication flow driven by agency or platform impersonation.',
    '투자/코인/리딩방': 'It contains a cluster of high-risk phrases often seen in investment or crypto pitches.',
    '환급/복구/추적 대행': 'It resembles a pattern that asks for payment before refund or recovery support.',
    '부업/재택/작업형': 'It includes exaggerated claims often used in remote-work or side-income bait.',
    '바이럴/과장 마케팅': 'Viral marketing and scarcity-style hype patterns were detected.',
    'AI 자동화/구축 대행 과장': 'It includes phrases that overstate AI automation build-out outcomes.',
    'AI 저품질 후킹글': 'It shows low-density AI hook writing with weak evidence and fast-result promises.',
    'AI 바이럴/기기 바이럴': 'It heavily frames a specific AI tool or device as the obvious answer.',
    '권위팔이 AI 담론': 'It mixes hard-to-verify insider anecdotes with trend-pressure authority appeals.',
    '구식 모델/최신성 부족': 'It presents outdated model information as if it were current guidance.',
    '선택적 비교/정보 왜곡': 'It shows signs of selective comparison rather than a fair technical comparison.',
    '중고거래/에스크로 유사': 'It resembles a payment flow disguised as safe trade or escrow.',
    '일반 수상 제안': 'It is not conclusive, but several risk signals overlap.',
  },
}

const CATEGORY_LABELS: Record<UiLocale, Record<RiskCategory, string>> = {
  ko: {
    '금전 요구': '금전 요구',
    '행동 유도': '행동 유도',
    '표현 패턴': '표현 패턴',
    '신뢰 위장': '신뢰 위장',
    '바이럴/과장': '바이럴/과장',
    '피싱/링크 위험': '피싱/링크 위험',
  },
  en: {
    '금전 요구': 'Money Request',
    '행동 유도': 'Action Pressure',
    '표현 패턴': 'Language Pattern',
    '신뢰 위장': 'Trust Impersonation',
    '바이럴/과장': 'Viral / Hype',
    '피싱/링크 위험': 'Phishing / Link Risk',
  },
}

const DIMENSION_LABELS = {
  ko: {
    scam: '사기성',
    virality: '바이럴성',
    aiSmell: 'AI 냄새',
    factualityRisk: '최신성 위험',
    comparisonRisk: '선택적 비교',
    authorityAppeal: '권위호소',
    hookingStyle: '후킹 문체',
  },
  en: {
    scam: 'Scam',
    virality: 'Virality',
    aiSmell: 'AI Smell',
    factualityRisk: 'Freshness Risk',
    comparisonRisk: 'Selective Comparison',
    authorityAppeal: 'Authority Appeal',
    hookingStyle: 'Hook Style',
  },
} as const

const AI_TAG_LABELS: Record<UiLocale, Record<string, string>> = {
  ko: {
    '모델 정보 최신성 낮음': '모델 정보 최신성 낮음',
    '구식 정보 재탕': '구식 정보 재탕',
    권위팔이: '권위팔이',
    '비교 왜곡': '비교 왜곡',
    '후킹형 과장 문체': '후킹형 과장 문체',
    '후킹 과장': '후킹 과장',
    '비용/성과 과장': '비용/성과 과장',
    '실행 난이도 은폐': '실행 난이도 은폐',
    '도구 만능론': '도구 만능론',
    '제품 바이럴 가능성': '제품 바이럴 가능성',
    '기기 바이럴 가능성': '기기 바이럴 가능성',
    'AI 냄새 강함': 'AI 냄새 강함',
  },
  en: {
    '모델 정보 최신성 낮음': 'Weak model freshness',
    '구식 정보 재탕': 'Recycled outdated info',
    권위팔이: 'Authority signaling',
    '비교 왜곡': 'Comparison distortion',
    '후킹형 과장 문체': 'Hook-style hype writing',
    '후킹 과장': 'Hooking exaggeration',
    '비용/성과 과장': 'Cost / outcome hype',
    '실행 난이도 은폐': 'Hidden implementation difficulty',
    '도구 만능론': 'Tool solves everything',
    '제품 바이럴 가능성': 'Product viral push',
    '기기 바이럴 가능성': 'Device viral framing',
    'AI 냄새 강함': 'Strong AI-smell',
  },
}

const AI_FINDING_LABELS: Record<UiLocale, Record<string, string>> = {
  ko: {
    '최신 모델/버전 정보가 아닐 수 있음': '최신 모델/버전 정보가 아닐 수 있음',
    '구식 정보 재탕 가능성': '구식 정보 재탕 가능성',
    '트렌드 압박 표현': '트렌드 압박 표현',
    '성능 수치 근거 부족': '성능 수치 근거 부족',
    '권위 호소 표현 다수': '권위 호소 표현 다수',
    '내부 사례 검증 부족': '내부 사례 검증 부족',
    '후킹형 제목/문체': '후킹형 제목/문체',
    '반론/한계 설명 부족': '반론/한계 설명 부족',
    '품질보다 홍보에 초점': '품질보다 홍보에 초점',
    '과장된 시간 단축 표현': '과장된 시간 단축 표현',
    '누구나 가능 식 단순화': '누구나 가능 식 단순화',
    '결과물 수준 과장': '결과물 수준 과장',
    '만능 해결책처럼 표현': '만능 해결책처럼 표현',
    '독자 기대 과도하게 상승': '독자 기대 과도하게 상승',
    '비교 기준 불명확': '비교 기준 불명확',
    '대안 비교 부족': '대안 비교 부족',
    '과장된 비용 절감 표현': '과장된 비용 절감 표현',
    '특정 제품만 과하게 띄움': '특정 제품만 과하게 띄움',
    '제품 바이럴 가능성': '제품 바이럴 가능성',
    'CTA성 홍보 문구 포함': 'CTA성 홍보 문구 포함',
    '정보 밀도 부족': '정보 밀도 부족',
    'AI 생성문 특유의 매끈한 구조': 'AI 생성문 특유의 매끈한 구조',
    '설치/운영 난이도 축소': '설치/운영 난이도 축소',
    '실제 실패 비용 누락': '실제 실패 비용 누락',
    '실서비스와 프로토타입 혼동': '실서비스와 프로토타입 혼동',
    '비판적으로 읽을 필요 높음': '비판적으로 읽을 필요 높음',
  },
  en: {
    '최신 모델/버전 정보가 아닐 수 있음': 'May not reflect the latest model/version',
    '구식 정보 재탕 가능성': 'Possible recycled outdated info',
    '트렌드 압박 표현': 'Trend-pressure language',
    '성능 수치 근거 부족': 'Weak evidence for performance numbers',
    '권위 호소 표현 다수': 'Heavy authority appeal',
    '내부 사례 검증 부족': 'Weakly verified insider example',
    '후킹형 제목/문체': 'Hook-style headline / tone',
    '반론/한계 설명 부족': 'Missing limitations or counterpoints',
    '품질보다 홍보에 초점': 'More promotion than substance',
    '과장된 시간 단축 표현': 'Overstated time savings',
    '누구나 가능 식 단순화': 'Oversimplified anyone-can-do-it framing',
    '결과물 수준 과장': 'Overstated output quality',
    '만능 해결책처럼 표현': 'Presented as a universal fix',
    '독자 기대 과도하게 상승': 'Inflates reader expectations',
    '비교 기준 불명확': 'Unclear comparison basis',
    '대안 비교 부족': 'Weak alternative comparison',
    '과장된 비용 절감 표현': 'Overstated cost savings',
    '특정 제품만 과하게 띄움': 'Over-promotes a specific product',
    '제품 바이럴 가능성': 'Possible product viral framing',
    'CTA성 홍보 문구 포함': 'Contains CTA-heavy promo language',
    '정보 밀도 부족': 'Low information density',
    'AI 생성문 특유의 매끈한 구조': 'Polished AI-generated structure',
    '설치/운영 난이도 축소': 'Understates setup/operations difficulty',
    '실제 실패 비용 누락': 'Omits real failure costs',
    '실서비스와 프로토타입 혼동': 'Confuses production with prototype',
    '비판적으로 읽을 필요 높음': 'Needs critical reading',
  },
}

const RULE_TITLES_EN: Record<string, string> = {
  'upfront-payment': 'Requests upfront payment or deposit',
  'refund-fee': 'Requests payment before refund or recovery',
  'loan-repay-first': 'Demands prior repayment of an existing loan',
  'remote-control': 'Pushes remote-control app installation',
  'smishing-delivery': 'Delivery or agency impersonation link language',
  'external-messenger': 'Pushes you to an external messenger',
  urgency: 'Uses urgency or immediate-decision pressure',
  secrecy: 'Requests secrecy',
  'guaranteed-profit': 'Promises guaranteed principal or no loss',
  'easy-income': 'Claims effortless or automatic income',
  'internal-route': 'Hints at insider route or special selection',
  impersonation: 'Possible agency or platform impersonation',
  'weak-identity': 'Unclear brand identity or heavy testimonial use',
  'viral-scarcity': 'Testimonial-style viral ad or scarcity framing',
  'ai-agency-hype': 'Overstates AI automation build-out claims',
  'ai-clickbait-fast-setup': 'Fast AI setup clickbait hook',
  'ai-local-llm-overclaim': 'Possible local LLM performance overclaim',
  'ai-outdated-model-reference': 'Presents outdated AI models like current picks',
  'ai-no-developer-hype': 'Hypes no-developer startup shortcut claims',
  'ai-absolute-tool-ranking': 'Uses absolute AI-tool ranking language',
  'ai-device-viral-framing': 'Frames a specific device as the obvious AI answer',
  'ai-selective-comparison': 'Selective AI cost/performance comparison',
  'ai-slick-low-density-style': 'Low-density LLM-style hook writing',
  'ai-explainer-tone': 'Overly polished explainer-style AI tone',
  'ai-emoji-hype': 'Emoji-heavy hype writing',
  'ai-blog-story-hook': 'Personal-story AI viral hook',
  'ai-authority-trend-pressure': 'AI trend pressure and authority signaling',
  'ai-unverifiable-insider-claim': 'Source-free insider AI anecdote',
  'short-url': 'Uses shortened link',
  'credential-request': 'Requests login or authentication details',
  'gift-card': 'Pushes gift card or virtual-asset payment',
  'startup-grant-broker': 'Broker-style startup grant / support pitch',
  'startup-success-fee': 'Requests startup consulting fee or success fee',
  'startup-insider-judge': 'Claims insider access to judges or evaluation criteria',
  'lecture-sales-funnel': 'Lecture or seminar style income/startup funnel',
}

const COMBO_TITLES_EN: Record<string, string> = {
  'combo-phishing-auth': 'Impersonation + authentication bait + link',
  'combo-smishing-link': 'Impersonation wording + link/auth bait',
  'combo-profit-payment': 'External messenger + upfront payment + guaranteed return',
  'combo-refund-fee': 'Recovery/refund narrative + fee demand',
  'combo-loan-scam': 'Refinancing bait + pre-repayment demand',
  'combo-viral-hype': 'Fake-testimonial viral hype + scarcity + external redirect',
  'combo-ai-clickbait': 'AI fast-setup hook combination',
  'combo-ai-local-viral': 'Local AI overclaim + device viral framing',
  'combo-ai-selective-local-comparison': 'Local AI overclaim + selective comparison chart',
  'combo-ai-authority-trend-claim': 'AI authority signaling + unverified insider anecdote',
  'combo-ai-emoji-explainer': 'Explainer AI tone + emoji hook combination',
  'combo-ai-blog-device-viral': 'Personal-story AI viral + device promotion combination',
  'combo-startup-grant-fee': 'Startup grant brokerage + fee demand',
  'combo-startup-insider-sales': 'Insider-judge framing + brokerage pitch',
  'combo-lecture-sales-funnel': 'Lecture-style hook + external inquiry funnel',
}

const BASELINE_META: Record<
  string,
  {
    ko: { title: string; sourceName: string; guidance: string }
    en: { title: string; sourceName: string; guidance: string }
  }
> = {
  'kisa-smishing-link-app': {
    ko: {
      title: '문자 내 URL 클릭 또는 앱 설치 유도',
      sourceName: 'KISA 보호나라·정부24 스미싱 예방 안내',
      guidance:
        '출처 불명 문자에 포함된 URL 클릭, 앱 설치, 계정 인증 요구는 스미싱 기준점으로 우선 경계합니다.',
    },
    en: {
      title: 'Text message urges link click or app installation',
      sourceName: 'KISA / Gov.kr smishing prevention guidance',
      guidance:
        'Unknown messages that push URL clicks, app installs, or account authentication should be treated as a core smishing baseline.',
    },
  },
  'police-loan-repay-first': {
    ko: {
      title: '저금리 대환대출을 미끼로 기존 대출 상환 요구',
      sourceName: '경찰청 통합신고대응단 대출사기 예방 기준',
      guidance:
        '저금리 전환을 명목으로 기존 대출금을 먼저 갚게 하는 흐름은 공식 예방 자료의 대표 대출사기 패턴입니다.',
    },
    en: {
      title: 'Low-interest refinancing bait followed by pre-repayment demand',
      sourceName: 'Korean National Police anti-loan-scam baseline',
      guidance:
        'Requests to repay an existing loan first in order to unlock a cheaper refinancing offer match a common official loan-scam pattern.',
    },
  },
  'police-remote-control-app': {
    ko: {
      title: '원격제어 또는 악성 앱 설치 유도',
      sourceName: '경찰청 통합신고대응단 악성 앱·원격제어 예방 기준',
      guidance:
        '원격제어 앱이나 악성 앱 설치 유도는 경찰청 통합신고 안내에서 반복적으로 경고하는 핵심 보이스피싱 신호입니다.',
    },
    en: {
      title: 'Pushes remote-control or malicious app installation',
      sourceName: 'Korean National Police remote-control app warning baseline',
      guidance:
        'Requests to install remote-control or malicious apps are repeatedly highlighted as key voice-phishing signals in official guidance.',
    },
  },
  'police-family-impersonation': {
    ko: {
      title: '지인·자녀 사칭 후 메신저 송금 유도',
      sourceName: '경찰청 통합신고대응단 메신저피싱 예방 기준',
      guidance:
        '가족·지인 사칭 뒤 메신저로 송금이나 대리 결제를 요구하는 흐름은 공식 메신저피싱 사례와 맞닿습니다.',
    },
    en: {
      title: 'Friend or child impersonation followed by messenger transfer request',
      sourceName: 'Korean National Police messenger-phishing baseline',
      guidance:
        'Impersonating a relative or acquaintance and then pushing transfer or proxy payment through a messenger app aligns with official messenger-phishing cases.',
    },
  },
  'kisa-official-impersonation': {
    ko: {
      title: '공공기관·금융기관 사칭 + 링크 포함 메시지',
      sourceName: 'KISA 통합신고센터 문자 제보 기준',
      guidance:
        '택배, 공공기관, 금융기관 등을 사칭하면서 URL을 포함한 문자는 공식 제보 대상 기준과 직접 맞닿습니다.',
    },
    en: {
      title: 'Public or financial institution impersonation plus link',
      sourceName: 'KISA suspicious-message reporting baseline',
      guidance:
        'Messages that impersonate delivery, public agencies, or financial institutions while including a URL closely match official reporting criteria.',
    },
  },
  'ai-outdated-model-hype': {
    ko: {
      title: '구형·검증 필요 AI 모델명으로 후킹',
      sourceName: 'Anthropic 모델 폐기 공지 및 Google AI 모델 문서 기준',
      guidance:
        '구형 또는 검증 필요한 모델명을 최신 도구처럼 제시하면서 즉시 성과를 약속하면 AI 딸깍형 저품질 후킹 기준점으로 봅니다.',
    },
    en: {
      title: 'Hooks with outdated or weakly verified AI model names',
      sourceName: 'Anthropic deprecation notices and Google AI model docs',
      guidance:
        'Using outdated or weakly verified model names like current best options while promising immediate results is a core low-quality AI hook baseline.',
    },
  },
  'ai-local-llm-viral-overclaim': {
    ko: {
      title: '로컬 LLM 성능·비용·기기 프레이밍 과장',
      sourceName: 'Google Gemma 모델 카드 및 Ollama 하드웨어 지원 문서 대조 기준',
      guidance:
        'Gemma 4 26B A4B 같은 모델명 자체보다, 특정 기기만 정답처럼 밀거나 비용·성능·프라이버시를 한쪽 조건으로만 비교하는 프레이밍을 과장 후킹으로 봅니다.',
    },
    en: {
      title: 'Overclaim around local LLM performance, cost, and device framing',
      sourceName: 'Gemma model cards and Ollama hardware guidance cross-check',
      guidance:
        'The issue is less the model name itself and more the framing that treats one device as the answer or compares cost, performance, and privacy on mismatched conditions.',
    },
  },
  'ai-authority-trend-claim': {
    ko: {
      title: 'AI 권위팔이·내부 사례 일반화',
      sourceName: 'K-워닝체크 내부 비판 기준',
      guidance:
        '“현업은 다 이렇게 한다”, “모르면 뒤처진다”, 출처 없는 내부 썰이 함께 나오면 방향이 맞아 보여도 사실 검증이 필요한 AI 담론으로 봅니다.',
    },
    en: {
      title: 'AI authority signaling plus generalized insider anecdote',
      sourceName: 'K-WarningCheck internal critique baseline',
      guidance:
        'Claims such as “everyone in the field already does this” or “you are behind if you do not know this,” combined with unsourced insider stories, need factual verification even if the direction sounds plausible.',
    },
  },
  'ai-low-quality-hooking-style': {
    ko: {
      title: 'AI 저품질 후킹 문체와 낮은 정보 밀도',
      sourceName: 'LLM 생성문 스타일로메트리 연구 및 K-워닝체크 휴리스틱',
      guidance:
        '문장 구조는 매끈하지만 예외 조건과 근거가 빠지고 빠른 성과만 강조하면 AI 냄새가 나는 저밀도 후킹글로 봅니다.',
    },
    en: {
      title: 'Low-density AI hook style with polished wording',
      sourceName: 'LLM stylometry research and K-WarningCheck heuristics',
      guidance:
        'If the writing feels polished but omits edge cases and evidence while pushing fast outcomes, it fits a low-density AI hook style.',
    },
  },
  'kstartup-brokered-support-sales': {
    ko: {
      title: '공식 창업지원 경로를 빙자한 사설 선정 대행·수수료 유도',
      sourceName: 'K-Startup 창업지원포털·스타트업 원스톱 지원센터·창업에듀 기준',
      guidance:
        '공식 창업지원 정보와 상담은 K-Startup 포털, 원스톱 지원센터, 창업에듀 같은 공개 경로로 제공됩니다. 사설 업체가 선정 보장, 내부 기준, 성공보수를 함께 내세우면 브로커성 유도로 비판적으로 봅니다.',
    },
    en: {
      title: 'Private brokerage pitch disguised as official startup-support path',
      sourceName: 'K-Startup portal and startup support center baseline',
      guidance:
        'Official startup support information is provided through public channels. If a private actor combines guaranteed selection, insider criteria, and success fees, it should be treated as brokerage-style pressure.',
    },
  },
  'gov-support-phishing-or-broker-pitch': {
    ko: {
      title: '정부지원금·정책자금을 미끼로 한 사칭 또는 브로커성 접근',
      sourceName: '정부24 사칭 피싱 주의 및 경찰청 전기통신금융사기 기준',
      guidance:
        '정부24는 금전 안내나 인증서 개별 요구를 하지 않는다고 밝히고 있으며, 경찰청도 대출상담·알선을 미끼로 수수료나 선상환을 요구하는 흐름을 전형적 사기 패턴으로 안내합니다.',
    },
    en: {
      title: 'Government-support bait used for impersonation or brokerage approach',
      sourceName: 'Gov.kr impersonation warning and police telecom-fraud baseline',
      guidance:
        'Official guidance states that government channels do not individually demand money or authentication. Police guidance also treats fee demands or forced pre-repayment in loan-broker style flows as classic scam patterns.',
    },
  },
}

const SUMMARY_TEXT: Record<
  UiLocale,
  Record<Exclude<AnalysisSummaryTemplateId, 'default'>, string>
> = {
  ko: {
    ai_hook_high:
      'AI 저품질 후킹글 가능성이 높습니다. 구식 정보, 제품 밀어주기, 권위팔이, 비교 왜곡, 실행 난이도 은폐 신호가 강하게 겹쳤습니다.',
    ai_hook_medium:
      '사기성 단정보다는 AI 바이럴·후킹형 과장 가능성이 큽니다. 사실 일부가 맞더라도 비교 조건과 최신성은 따로 확인해야 합니다.',
    virality_high_scam_low:
      '사기성은 낮지만 과장·바이럴·선택적 비교 가능성이 높습니다. 사실 일부가 맞더라도 결론은 홍보성 프레이밍에 가깝습니다.',
    ai_smell_factuality:
      'AI 딸깍형 저품질 후킹글 가능성이 높습니다. 구식 모델 정보, 빠른 성과 약속, 근거 없는 비용 프레이밍이 함께 나타납니다.',
    authority_appeal:
      '방향성 비판은 타당할 수 있지만 권위 호소, 내부 사례 일반화, 검증되지 않은 수치가 섞여 있어 사실 확인이 필요합니다.',
    comparison_risk:
      '기술 설명이라기보다 특정 제품·기기 홍보 문구에 가깝습니다. 비교 조건과 대체재 누락 여부를 비판적으로 확인해야 합니다.',
    freshness_current:
      '웹 검색 기준 최신성 자체는 바로 틀렸다고 보긴 어렵습니다. 다만 과장이나 비교 왜곡 여부는 별도로 확인해야 합니다.',
    freshness_outdated:
      '웹 검색 기준 최신성 불일치 가능성이 확인되었습니다. 모델명, 버전, 지원 상태를 현재 공식 문서로 다시 검증해야 합니다.',
    freshness_skipped_no_provider:
      '웹 검색이 가능한 제공자가 없어 최신성 검증을 건너뛰었습니다.',
    freshness_failed:
      '웹 최신성 검증을 시도했지만 결과를 안정적으로 확인하지 못했습니다.',
  },
  en: {
    ai_hook_high:
      'This strongly resembles a low-quality AI hook post. Outdated info, product pushing, authority signaling, comparison distortion, and hidden implementation difficulty overlap heavily.',
    ai_hook_medium:
      'It looks more like AI-viral or hook-style exaggeration than a direct scam. Even if part of it is true, the comparison conditions and freshness still need separate verification.',
    virality_high_scam_low:
      'Direct scam risk is lower, but hype, virality, and selective comparison risk are high. Even if some claims are true, the framing is still promotional.',
    ai_smell_factuality:
      'This strongly resembles a low-quality AI hook post. Outdated model info, fast-result promises, and weakly grounded cost framing appear together.',
    authority_appeal:
      'The direction may contain a valid critique, but authority appeal, generalized insider anecdotes, and unverified numbers are mixed in and need fact-checking.',
    comparison_risk:
      'It reads less like a technical explanation and more like promotional copy for a specific product or device. The comparison conditions and missing alternatives should be checked critically.',
    freshness_current:
      'A web check does not strongly support the claim that the freshness is wrong. Exaggeration and comparison distortion should still be reviewed separately.',
    freshness_outdated:
      'A web check supports a freshness mismatch. Recheck the model name, version, and support status against current official documentation.',
    freshness_skipped_no_provider:
      'Freshness verification was skipped because no web-search-capable provider is configured.',
    freshness_failed:
      'A web freshness check was attempted, but the result could not be confirmed reliably.',
  },
}

const ACTION_LABELS: Record<UiLocale, Record<string, string>> = {
  ko: {
    verify_payment_and_business:
      '송금, 결제, 예치금, 수수료 요청은 상대 정보와 사업자 정보를 먼저 확인하십시오.',
    verify_official_site:
      '링크를 누르지 말고 공식 사이트 주소를 직접 입력해 로그인·인증 요청이 맞는지 확인하십시오.',
    verify_official_channel:
      '외부 메신저로 이동하라는 요청은 거래·인증 흐름을 끊고 공식 채널에서 다시 확인하십시오.',
    stop_upfront_payment:
      '선입금이나 예치금 요구가 있으면 거래를 멈추고 대체 결제 수단을 확인하십시오.',
    verify_ai_docs:
      'AI 모델명, 지원 상태, 하드웨어 조건, 비용 비교가 현재 공식 문서와 같은 기준인지 따로 확인하십시오.',
    read_ai_claims_critically:
      '광고성 문구와 기술 정보를 구분하고, 예외 조건과 한계가 빠진 문장은 비판적으로 읽으십시오.',
    compare_same_benchmark:
      '비교표가 있으면 성능, 비용, 속도, 품질 조건이 같은 기준인지 다시 맞춰 보십시오.',
    verify_authority_claims:
      '“현업은 다 이렇게 한다” 같은 문구는 출처와 실제 사례가 검증되기 전까지 업계 일반화로 보십시오.',
    verify_model_claims_and_sources:
      '모델명·버전 최신 여부, 경쟁 대안, 실제 사용 조건, 시간·비용 수치의 근거를 분리해서 확인하십시오.',
    change_password_and_contact_official_support:
      '이미 링크를 열었거나 정보를 입력했다면 비밀번호 변경과 공식 고객센터 확인을 우선 진행하십시오.',
    verify_claims_before_sharing_or_buying:
      '공유, 구매, 도입 판단 전에 원문 주장별 출처와 반례를 최소 1개 이상 확인하십시오.',
    double_check_core_claims:
      '강한 위험 신호는 낮지만, 핵심 주장과 출처가 맞는지 한 번 더 확인하십시오.',
    freshness_current_keep_other_checks:
      '최신성 자체는 웹 검색 기준으로 바로 틀렸다고 보긴 어렵습니다. 다만 과장·비교 왜곡 여부는 따로 보십시오.',
    freshness_outdated_verify_model_status:
      '현재 공식 문서 기준 모델명, 버전, 지원 상태가 맞는지 먼저 다시 확인하십시오.',
  },
  en: {
    verify_payment_and_business:
      'Before sending money, paying fees, or placing a deposit, verify the counterparty identity and business details first.',
    verify_official_site:
      'Do not click the link. Type the official site address yourself and confirm whether the login or authentication request is real.',
    verify_official_channel:
      'If you are pushed to move to an external messenger, stop the transaction or verification flow and confirm again through an official channel.',
    stop_upfront_payment:
      'If upfront payment or a deposit is requested, stop the transaction and verify whether a legitimate payment path exists.',
    verify_ai_docs:
      'Check whether the AI model name, support status, hardware requirement, and cost comparison actually match current official docs.',
    read_ai_claims_critically:
      'Separate promotional language from technical facts, and read claims critically when edge cases and limits are omitted.',
    compare_same_benchmark:
      'If a comparison chart is shown, verify that performance, cost, speed, and quality are being compared under the same benchmark conditions.',
    verify_authority_claims:
      'Treat lines like “everyone in the industry already does this” as broad authority claims until the source and real examples are verified.',
    verify_model_claims_and_sources:
      'Verify the model/version freshness, competing alternatives, actual usage constraints, and the evidence behind any time or cost number separately.',
    change_password_and_contact_official_support:
      'If you already opened the link or entered information, change your password first and contact the official support channel.',
    verify_claims_before_sharing_or_buying:
      'Before sharing, buying, or adopting the claim, verify at least one source and one counterexample for each core claim.',
    double_check_core_claims:
      'The strongest risk signals are limited, but the core claim and its source should still be checked once more.',
    freshness_current_keep_other_checks:
      'The freshness claim does not look clearly wrong from the web check, but exaggeration and comparison distortion should still be reviewed separately.',
    freshness_outdated_verify_model_status:
      'First verify the model name, version, and support status against the current official documentation.',
  },
}

const LEGACY_SUMMARY_TO_TEMPLATE: Array<[string, AnalysisSummaryTemplateId]> = [
  ['AI 저품질 후킹글 가능성이 높습니다.', 'ai_hook_high'],
  ['사기성 단정보다는 AI 바이럴·후킹형 과장 가능성이 큽니다.', 'ai_hook_medium'],
  ['사기성은 낮지만 과장·바이럴·선택적 비교 가능성이 높습니다.', 'virality_high_scam_low'],
  ['AI 딸깍형 저품질 후킹글 가능성이 높습니다.', 'ai_smell_factuality'],
  ['방향성 비판은 타당할 수 있지만 권위 호소', 'authority_appeal'],
  ['기술 설명이라기보다 특정 제품·기기 홍보 문구에 가깝습니다.', 'comparison_risk'],
  ['웹 검색 기준 최신성 자체는 바로 틀렸다고 보긴 어렵습니다.', 'freshness_current'],
  ['웹 최신성 검증을 건너뛰었습니다.', 'freshness_skipped_no_provider'],
  ['웹 최신성 검증을 시도했지만 실패했습니다.', 'freshness_failed'],
]

const LEGACY_ACTION_TO_ID: Record<string, string> = {
  '송금, 결제, 예치금, 수수료 요청은 상대 정보와 사업자 정보를 먼저 확인하십시오.':
    'verify_payment_and_business',
  '링크를 누르지 말고 공식 사이트 주소를 직접 입력해 로그인·인증 요청이 맞는지 확인하십시오.':
    'verify_official_site',
  '외부 메신저로 이동하라는 요청은 거래·인증 흐름을 끊고 공식 채널에서 다시 확인하십시오.':
    'verify_official_channel',
  '선입금이나 예치금 요구가 있으면 거래를 멈추고 대체 결제 수단을 확인하십시오.':
    'stop_upfront_payment',
  'AI 모델명, 지원 상태, 하드웨어 조건, 비용 비교가 현재 공식 문서와 같은 기준인지 따로 확인하십시오.':
    'verify_ai_docs',
  '광고성 문구와 기술 정보를 구분하고, 예외 조건과 한계가 빠진 문장은 비판적으로 읽으십시오.':
    'read_ai_claims_critically',
  '비교표가 있으면 성능, 비용, 속도, 품질 조건이 같은 기준인지 다시 맞춰 보십시오.':
    'compare_same_benchmark',
  '“현업은 다 이렇게 한다” 같은 문구는 출처와 실제 사례가 검증되기 전까지 업계 일반화로 보십시오.':
    'verify_authority_claims',
  '모델명·버전 최신 여부, 경쟁 대안, 실제 사용 조건, 시간·비용 수치의 근거를 분리해서 확인하십시오.':
    'verify_model_claims_and_sources',
  '이미 링크를 열었거나 정보를 입력했다면 비밀번호 변경과 공식 고객센터 확인을 우선 진행하십시오.':
    'change_password_and_contact_official_support',
  '공유, 구매, 도입 판단 전에 원문 주장별 출처와 반례를 최소 1개 이상 확인하십시오.':
    'verify_claims_before_sharing_or_buying',
  '강한 위험 신호는 낮지만, 핵심 주장과 출처가 맞는지 한 번 더 확인하십시오.':
    'double_check_core_claims',
  '최신성 자체는 웹 검색 기준으로 바로 틀렸다고 보긴 어렵습니다. 다만 과장·비교 왜곡 여부는 따로 보십시오.':
    'freshness_current_keep_other_checks',
  '현재 공식 문서 기준 모델명, 버전, 지원 상태가 맞는지 먼저 다시 확인하십시오.':
    'freshness_outdated_verify_model_status',
}

export function resolveUiLocale(input?: string | null): UiLocale {
  return String(input || '').toLowerCase().startsWith('en') ? 'en' : 'ko'
}

export function getSystemUiLocale() {
  const browserLocale =
    typeof navigator !== 'undefined'
      ? navigator.language
      : typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().locale
        : 'ko-KR'

  return resolveUiLocale(browserLocale)
}

export function getLocaleTag(locale: UiLocale) {
  return LOCALE_TAGS[locale]
}

export function translateGrade(grade: RiskGrade, locale: UiLocale) {
  return GRADE_LABELS[locale][grade]
}

export function translateAnalysisType(type: AnalysisType, locale: UiLocale) {
  return TYPE_LABELS[locale][type]
}

export function translateRiskCategory(category: RiskCategory, locale: UiLocale) {
  return CATEGORY_LABELS[locale][category]
}

export function translateDimensionLabel(
  key: keyof typeof DIMENSION_LABELS.ko,
  locale: UiLocale,
) {
  return DIMENSION_LABELS[locale][key]
}

export function translateAiTag(tag: string, locale: UiLocale) {
  return AI_TAG_LABELS[locale][tag] ?? tag
}

export function translateAiFindingLabel(label: string, locale: UiLocale) {
  return AI_FINDING_LABELS[locale][label] ?? label
}

export function translateRuleLikeTitle(id: string, fallbackTitle: string, locale: UiLocale) {
  if (locale === 'ko') {
    return fallbackTitle
  }

  if (id.startsWith('ai-check-')) {
    return translateAiFindingLabel(fallbackTitle, locale)
  }

  return RULE_TITLES_EN[id] ?? COMBO_TITLES_EN[id] ?? fallbackTitle
}

export function translateBaseline(baseline: BaselineMatch, locale: UiLocale) {
  const meta = BASELINE_META[baseline.id]

  if (!meta) {
    return baseline
  }

  return {
    ...baseline,
    title: meta[locale].title,
    sourceName: meta[locale].sourceName,
    guidance: meta[locale].guidance,
  }
}

function inferSummaryTemplateId(summary: string): AnalysisSummaryTemplateId {
  const matched = LEGACY_SUMMARY_TO_TEMPLATE.find(([snippet]) => summary.includes(snippet))
  return matched?.[1] ?? 'default'
}

export function resolveSummaryTemplateId(result: Pick<AnalysisResult, 'summaryTemplateId' | 'summary'>) {
  return result.summaryTemplateId || inferSummaryTemplateId(result.summary)
}

function resolveActionIds(
  result: Pick<AnalysisResult, 'recommendedActionIds' | 'recommendedActions'>,
) {
  if (Array.isArray(result.recommendedActionIds) && result.recommendedActionIds.length > 0) {
    return result.recommendedActionIds
  }

  return [...new Set((result.recommendedActions ?? []).map((action) => LEGACY_ACTION_TO_ID[action]).filter(Boolean))]
}

export function formatDateTime(iso: string, locale: UiLocale = 'ko') {
  return new Intl.DateTimeFormat(getLocaleTag(locale), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function formatScore(score: number) {
  return `${Math.round(score)}/100`
}

export function buildRecordTitle(
  primaryType: AnalysisType,
  sourceText = '',
  locale: UiLocale = 'ko',
  isNeutral = false,
) {
  const normalized = sourceText.replace(/\s+/g, ' ').trim()
  const typeLabel = translateAnalysisType(primaryType, locale)

  if (!normalized) {
    return isNeutral ? (locale === 'en' ? 'Analysis record' : '분석 기록') : typeLabel
  }

  const excerpt = normalized.length > 18 ? `${normalized.slice(0, 18)}…` : normalized
  if (isNeutral) {
    return excerpt
  }
  return `${typeLabel} (${excerpt})`
}

export function gradeDescription(grade: RiskGrade, locale: UiLocale = 'ko') {
  return GRADE_DESCRIPTIONS[locale][grade]
}

export function isNeutralAnalysisResult(
  result: Pick<
    AnalysisResult,
    | 'score'
    | 'primaryType'
    | 'secondaryTypes'
    | 'checklist'
    | 'matchedBaselines'
    | 'signals'
    | 'recommendedActionIds'
    | 'recommendedActions'
    | 'webFreshnessVerification'
    | 'aiHookingChecklist'
  >,
) {
  return (
    result.score <= 0 &&
    result.primaryType === '일반 수상 제안' &&
    result.secondaryTypes.length === 0 &&
    result.checklist.length === 0 &&
    result.matchedBaselines.length === 0 &&
    result.signals.length === 0 &&
    result.aiHookingChecklist.normalizedScore === 0 &&
    result.aiHookingChecklist.tags.length === 0 &&
    result.recommendedActionIds.length === 0 &&
    result.recommendedActions.length === 0 &&
    !result.webFreshnessVerification
  )
}

export function translateDetectedLanguage(language: DetectedLanguage, locale: UiLocale) {
  if (locale === 'ko') {
    if (language === 'ko') {
      return '한국어'
    }
    if (language === 'en') {
      return '영어'
    }
    return '혼합'
  }

  if (language === 'ko') {
    return 'Korean'
  }
  if (language === 'en') {
    return 'English'
  }
  return 'Mixed'
}

function summaryFromTemplate(result: AnalysisResult, locale: UiLocale) {
  if (isNeutralAnalysisResult(result)) {
    return ''
  }

  const templateId = resolveSummaryTemplateId(result)

  if (templateId === 'default') {
    return `${TYPE_LEADS[locale][result.primaryType]} ${gradeDescription(result.grade, locale)}`
  }

  return SUMMARY_TEXT[locale][templateId]
}

export function renderAnalysisSummary(result: AnalysisResult, locale: UiLocale) {
  if (result.summaryOverrideLocale === locale && result.summaryOverrideText?.trim()) {
    return result.summaryOverrideText.trim()
  }

  return summaryFromTemplate(result, locale)
}

export function renderRecommendedActions(result: AnalysisResult, locale: UiLocale) {
  if (isNeutralAnalysisResult(result)) {
    return []
  }

  const ids = resolveActionIds(result)

  if (ids.length > 0) {
    return [...new Set(ids.map((id) => ACTION_LABELS[locale][id]).filter(Boolean))]
  }

  return result.recommendedActions ?? []
}

function inferFreshnessMessageKey(
  verification: WebFreshnessVerification,
): NonNullable<WebFreshnessVerification['messageKey']> {
  if (verification.messageKey) {
    return verification.messageKey
  }

  if (verification.summary.includes('건너뛰')) {
    return 'skipped_no_provider'
  }

  if (verification.summary.includes('실패')) {
    return 'failed'
  }

  return 'provider'
}

export function renderWebFreshnessSummary(
  verification: WebFreshnessVerification,
  locale: UiLocale,
) {
  if (
    verification.providerSummaryLocale === locale &&
    verification.providerSummaryText?.trim()
  ) {
    return verification.providerSummaryText.trim()
  }

  const messageKey = inferFreshnessMessageKey(verification)

  if (messageKey === 'skipped_no_provider') {
    return SUMMARY_TEXT[locale].freshness_skipped_no_provider
  }

  if (messageKey === 'failed') {
    return SUMMARY_TEXT[locale].freshness_failed
  }

  if (verification.status === 'confirmed_current') {
    return SUMMARY_TEXT[locale].freshness_current
  }

  if (verification.status === 'confirmed_outdated') {
    return SUMMARY_TEXT[locale].freshness_outdated
  }

  return locale === 'ko'
    ? '웹 최신성 검증 결과가 결정적이지 않았습니다.'
    : 'The web freshness check was inconclusive.'
}

export function renderChecklistTitle(item: ChecklistItem, locale: UiLocale) {
  return translateRuleLikeTitle(item.id.replace(/^ai-check-/, 'ai-check-'), item.title, locale)
}

export function getDisclaimerText(locale: UiLocale) {
  return locale === 'ko'
    ? '본 서비스는 warning.or.kr 및 공식 차단안내 페이지와 무관한 독립 서비스입니다. 공식 정부기관·공공기관 서비스가 아니며, 분석 결과는 참고용입니다. 최종 판단 전 출처와 결제 방식, 사업자 정보를 직접 확인하십시오.'
    : 'This service is an independent tool and is not affiliated with warning.or.kr or any official blocking page. It is not an official government or public-agency service, and the analysis is for reference only. Verify the source, payment path, and business details before making a final decision.'
}

export function getPrivacyWarningText(locale: UiLocale) {
  return locale === 'ko'
    ? '민감정보가 로컬에 저장될 수 있습니다. 공용 기기에서는 기록 저장과 원본 이미지 보관에 주의하십시오.'
    : 'Sensitive information may be stored locally. On shared devices, be careful with saved history and retained original images.'
}

const RETENTION_LABELS: Record<UiLocale, Record<string, string>> = {
  ko: {
    hourly: '1시간 뒤 초기화',
    '1d': '1일 뒤 초기화',
    '2d': '2일 뒤 초기화',
    '3d': '3일 뒤 초기화',
    '5d': '5일 뒤 초기화',
    '7d': '7일 뒤 초기화',
  },
  en: {
    hourly: 'Reset after 1 hour',
    '1d': 'Reset after 1 day',
    '2d': 'Reset after 2 days',
    '3d': 'Reset after 3 days',
    '5d': 'Reset after 5 days',
    '7d': 'Reset after 7 days',
  },
}

const MODEL_DESCRIPTION_LABELS: Record<UiLocale, Record<string, string>> = {
  ko: {
    '정확도 우선': '정확도 우선',
    '속도 우선': '속도 우선',
    '비용·처리량 우선': '비용·처리량 우선',
    '빠른 응답 우선': '빠른 응답 우선',
    균형형: '균형형',
    'Codex 계열': 'Codex 계열',
    '권장 · 웹검색과 내장 도구 전체': '권장 · 웹검색과 내장 도구 전체',
    '권장 · 빠른 웹검색과 내장 도구': '권장 · 빠른 웹검색과 내장 도구',
    '큰 컨텍스트 · 일부 도구': '큰 컨텍스트 · 일부 도구',
    '빠른 OSS 모델 · 일부 도구': '빠른 OSS 모델 · 일부 도구',
    '텍스트/비전 계열': '텍스트/비전 계열',
    '긴 컨텍스트 계열': '긴 컨텍스트 계열',
    '범용 텍스트': '범용 텍스트',
    '저지연 텍스트': '저지연 텍스트',
  },
  en: {
    '정확도 우선': 'Accuracy first',
    '속도 우선': 'Speed first',
    '비용·처리량 우선': 'Cost / throughput first',
    '빠른 응답 우선': 'Fast response first',
    균형형: 'Balanced',
    'Codex 계열': 'Codex family',
    '권장 · 웹검색과 내장 도구 전체': 'Recommended · full web search and built-in tools',
    '권장 · 빠른 웹검색과 내장 도구': 'Recommended · faster web search and built-in tools',
    '큰 컨텍스트 · 일부 도구': 'Large context · some tools',
    '빠른 OSS 모델 · 일부 도구': 'Fast OSS model · some tools',
    '텍스트/비전 계열': 'Text / vision',
    '긴 컨텍스트 계열': 'Long-context',
    '범용 텍스트': 'General text',
    '저지연 텍스트': 'Low-latency text',
  },
}

const REASONING_LABELS: Record<UiLocale, Record<string, string>> = {
  ko: {
    low: '낮음',
    medium: '중간',
    high: '높음',
    xhigh: '매우 높음',
    '속도 우선': '속도 우선',
    '정밀도 우선': '정밀도 우선',
    '가장 느림': '가장 느림',
  },
  en: {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'Very High',
    '속도 우선': 'Speed first',
    '정밀도 우선': 'Precision first',
    '가장 느림': 'Slowest',
  },
}

const GROQ_TOOL_LABELS: Record<UiLocale, Record<string, string>> = {
  ko: {
    web_search: '웹검색',
    code_interpreter: '코드 실행',
    visit_website: '웹사이트 방문',
    browser_automation: '브라우저 자동화',
    wolfram_alpha: 'Wolfram Alpha',
  },
  en: {
    web_search: 'Web search',
    code_interpreter: 'Code interpreter',
    visit_website: 'Visit website',
    browser_automation: 'Browser automation',
    wolfram_alpha: 'Wolfram Alpha',
  },
}

export function translateRetentionLabel(id: string, locale: UiLocale) {
  return RETENTION_LABELS[locale][id] ?? id
}

export function translateModelDescription(description: string, locale: UiLocale) {
  return MODEL_DESCRIPTION_LABELS[locale][description] ?? description
}

export function translateReasoningLabel(id: string, locale: UiLocale) {
  return REASONING_LABELS[locale][id] ?? id
}

export function translateGroqToolLabel(id: string, locale: UiLocale) {
  return GROQ_TOOL_LABELS[locale][id] ?? id
}
