export type AnalysisSource =
  | 'text'
  | 'url'
  | 'image'
  | 'selection'
  | 'capture'
  | 'clipboard'

export type RiskCategory =
  | '금전 요구'
  | '행동 유도'
  | '표현 패턴'
  | '신뢰 위장'
  | '바이럴/과장'
  | '피싱/링크 위험'

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical'

export type RiskGrade = '낮음' | '주의' | '위험' | '매우 위험' | '경고'

export type AnalysisType =
  | '피싱/기관 사칭'
  | '투자/코인/리딩방'
  | '환급/복구/추적 대행'
  | '부업/재택/작업형'
  | '바이럴/과장 마케팅'
  | 'AI 자동화/구축 대행 과장'
  | 'AI 저품질 후킹글'
  | 'AI 바이럴/기기 바이럴'
  | '권위팔이 AI 담론'
  | '구식 모델/최신성 부족'
  | '선택적 비교/정보 왜곡'
  | '중고거래/에스크로 유사'
  | '일반 수상 제안'

export type ProviderKind = 'local' | 'gemini' | 'codex' | 'groq'

export type ApiKeyRetention = 'hourly' | '1d' | '2d' | '3d' | '5d' | '7d'

export type GroqToolId =
  | 'web_search'
  | 'code_interpreter'
  | 'visit_website'
  | 'browser_automation'
  | 'wolfram_alpha'

export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
  devicePixelRatio?: number
}

export interface AnalysisInput {
  source: AnalysisSource
  rawText?: string
  imageDataUrl?: string
  pageUrl?: string
  selectedText?: string
  captureRect?: CaptureRect
  title?: string
  createdAt: string
  metadata?: Record<string, string | number | boolean | undefined>
}

export interface DetectionHit {
  ruleId: string
  title: string
  category: RiskCategory
  weight: number
  matchedText: string
  evidence: string
  severity: RiskSeverity
  types: AnalysisType[]
}

export interface ChecklistItem {
  id: string
  title: string
  category: RiskCategory
  triggered: boolean
  weight: number
  severity: RiskSeverity
  evidence: string
}

export type AiHookingChecklistCategory =
  | '최신성/버전 정확성'
  | '사실성/검증 가능성'
  | '과장/단정 표현'
  | '비교 왜곡/선택적 프레이밍'
  | '바이럴/제품 밀어주기'
  | 'AI 특유 저품질 문체'
  | '권위팔이/트렌드 강요'
  | '실행 난이도 은폐'
  | '비용·시간·성과 과장'
  | '기술 맥락/균형감 부족'

export interface AiHookingChecklistHit {
  id: string
  number: number
  category: AiHookingChecklistCategory
  title: string
  userLabel: string
  tag: string
  score: 1 | 2
  critical: boolean
  evidence: string
}

export interface AiHookingChecklistResult {
  rawScore: number
  normalizedScore: number
  criticalCount: number
  tags: string[]
  topFindings: AiHookingChecklistHit[]
  categoryScores: Record<AiHookingChecklistCategory, number>
}

export interface AnalysisResult {
  score: number
  grade: RiskGrade
  primaryType: AnalysisType
  secondaryTypes: AnalysisType[]
  summary: string
  matchedBaselines: BaselineMatch[]
  dimensionScores: AnalysisDimensionScores
  aiHookingChecklist: AiHookingChecklistResult
  checklist: ChecklistItem[]
  signals: string[]
  evidenceSentences: string[]
  recommendedActions: string[]
  scoreBreakdown: {
    raw: number
    comboBonus: number
    mitigation: number
    aiChecklistScore: number
    floorApplied?: RiskGrade
  }
}

export interface AnalysisDimensionScores {
  scam: number
  virality: number
  aiSmell: number
  factualityRisk: number
  comparisonRisk: number
  authorityAppeal: number
  hookingStyle: number
}

export interface ProviderUsage {
  provider: ProviderKind
  operations: Array<'summarize' | 'refineExplanation' | 'assistOcr'>
  success: boolean
  error?: string
}

export interface StoredAnalysisRecord {
  id: string
  createdAt: string
  input: AnalysisInput
  result: AnalysisResult
  ocrText?: string
  providerUsage: ProviderUsage[]
}

export interface GeminiSettings {
  apiKey: string
  model: string
  endpoint: string
  apiKeyRetention: ApiKeyRetention
}

export interface GroqSettings {
  apiKey: string
  model: string
  endpoint: string
  apiKeyRetention: ApiKeyRetention
  enabledTools: GroqToolId[]
}

export interface CodexBridgeSettings {
  bridgeUrl: string
  workspaceRoot: string
  loginCommand: string
  model: string
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh'
}

export interface ProviderState {
  preferredProvider: Exclude<ProviderKind, 'local'>
  autoUseConfiguredProviders: boolean
  remoteExplanationEnabled: boolean
  remoteOcrEnabled: boolean
  gemini: GeminiSettings
  groq: GroqSettings
  codex: CodexBridgeSettings
}

export interface TextEntities {
  urls: string[]
  shortUrls: string[]
  phoneNumbers: string[]
  accounts: string[]
  openChatLinks: string[]
  telegramLinks: string[]
}

export interface RuleDefinition {
  id: string
  title: string
  category: RiskCategory
  weight: number
  severity: RiskSeverity
  patterns: RegExp[]
  types: AnalysisType[]
}

export interface ComboDefinition {
  id: string
  title: string
  requires: string[]
  bonus: number
  floor?: RiskGrade
  types: AnalysisType[]
}

export interface BaselineDefinition {
  id: string
  title: string
  sourceName: string
  sourceUrl: string
  check: (text: string, hitIds: string[]) => boolean
  guidance: string
}

export interface BaselineMatch {
  id: string
  title: string
  sourceName: string
  sourceUrl: string
  guidance: string
}

export type RuntimeMessage =
  | { type: 'analyze-input'; input: AnalysisInput }
  | { type: 'analyze-active-selection' }
  | { type: 'capture-active-area' }
  | { type: 'capture-finished'; rect: CaptureRect; title?: string }
  | { type: 'analyze-clipboard' }
  | { type: 'run-ocr'; imageDataUrl: string }
  | { type: 'get-latest-record' }
  | { type: 'get-history' }
  | { type: 'delete-history-record'; id: string }
  | { type: 'clear-history' }
  | { type: 'reanalyze-record'; id: string }
  | { type: 'get-provider-state' }
  | { type: 'save-provider-state'; state: ProviderState }
  | { type: 'get-codex-status' }
  | { type: 'start-codex-login' }
  | { type: 'start-codex-bridge' }
  | { type: 'read-clipboard' }
  | { type: 'analysis-ready'; record: StoredAnalysisRecord }

export interface RuntimeResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}
