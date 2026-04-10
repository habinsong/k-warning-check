export type AnalysisSource =
  | 'text'
  | 'url'
  | 'image'
  | 'selection'
  | 'capture'
  | 'clipboard'

export type UiLocale = 'ko' | 'en'
export type DetectedLanguage = 'ko' | 'en' | 'mixed'

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
export type SecretProviderKind = 'gemini' | 'groq'

export type ApiKeyRetention = 'hourly' | '1d' | '2d' | '3d' | '5d' | '7d'
export type SecureStorageBackend = 'keychain' | 'credential-locker' | 'secret-service'

export type ThemeMode = 'light' | 'dark' | 'system'

export type GroqToolId =
  | 'web_search'
  | 'code_interpreter'
  | 'visit_website'
  | 'browser_automation'
  | 'wolfram_alpha'

export type AnalysisSummaryTemplateId =
  | 'default'
  | 'ai_hook_high'
  | 'ai_hook_medium'
  | 'virality_high_scam_low'
  | 'ai_smell_factuality'
  | 'authority_appeal'
  | 'comparison_risk'
  | 'freshness_current'
  | 'freshness_outdated'
  | 'freshness_skipped_no_provider'
  | 'freshness_failed'

export type RecommendedActionId =
  | 'verify_payment_and_business'
  | 'verify_official_site'
  | 'verify_official_channel'
  | 'stop_upfront_payment'
  | 'verify_ai_docs'
  | 'read_ai_claims_critically'
  | 'compare_same_benchmark'
  | 'verify_authority_claims'
  | 'verify_model_claims_and_sources'
  | 'change_password_and_contact_official_support'
  | 'verify_claims_before_sharing_or_buying'
  | 'double_check_core_claims'
  | 'freshness_current_keep_other_checks'
  | 'freshness_outdated_verify_model_status'

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
  detectedLanguage: DetectedLanguage
  summaryTemplateId: AnalysisSummaryTemplateId
  summaryOverrideLocale?: UiLocale
  summaryOverrideText?: string
  summary: string
  matchedBaselines: BaselineMatch[]
  dimensionScores: AnalysisDimensionScores
  aiHookingChecklist: AiHookingChecklistResult
  checklist: ChecklistItem[]
  signals: string[]
  evidenceSentences: string[]
  recommendedActionIds: RecommendedActionId[]
  recommendedActions: string[]
  webFreshnessVerification?: WebFreshnessVerification
  scoreBreakdown: {
    raw: number
    comboBonus: number
    mitigation: number
    aiChecklistScore: number
    dimensionDrivenScore: number
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

export interface WebFreshnessVerificationReference {
  title: string
  url: string
}

export interface WebFreshnessVerification {
  status: 'confirmed_outdated' | 'confirmed_current' | 'inconclusive'
  messageKey?: 'provider' | 'skipped_no_provider' | 'failed'
  providerSummaryLocale?: UiLocale
  providerSummaryText?: string
  summary: string
  checkedClaims: string[]
  references: WebFreshnessVerificationReference[]
}

export interface ProviderUsage {
  provider: ProviderKind
  operations: Array<'summarize' | 'refineExplanation' | 'assistOcr' | 'verifyFreshness'>
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

export interface PopupStatus {
  loading: boolean
  message: string
  error?: string
}

export interface SecretBackedProviderState {
  hasSecret: boolean
  storageBackend: SecureStorageBackend | null
  expiresAt?: number | null
  lastValidationAt?: number | null
}

export interface GeminiSettings {
  model: string
  endpoint: string
  apiKeyRetention: ApiKeyRetention
  hasSecret: boolean
  storageBackend: SecureStorageBackend | null
  expiresAt?: number | null
  lastValidationAt?: number | null
}

export interface GroqSettings {
  model: string
  endpoint: string
  apiKeyRetention: ApiKeyRetention
  enabledTools: GroqToolId[]
  hasSecret: boolean
  storageBackend: SecureStorageBackend | null
  expiresAt?: number | null
  lastValidationAt?: number | null
}

export interface CodexBridgeSettings {
  bridgeUrl: string
  bridgeToken: string
  workspaceRoot: string
  loginCommand: string
  model: string
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh'
}

export interface ProviderState {
  uiLocale: UiLocale
  onboardingCompleted: boolean
  preferredProvider: Exclude<ProviderKind, 'local'>
  webSearchEnabled: boolean
  theme: ThemeMode
  autoUseConfiguredProviders: boolean
  remoteExplanationEnabled: boolean
  remoteOcrEnabled: boolean
  gemini: GeminiSettings
  groq: GroqSettings
  codex: CodexBridgeSettings
}

export interface ProviderSecrets {
  geminiApiKey?: string
  groqApiKey?: string
}

export interface SecureStoreProviderStatus extends SecretBackedProviderState {
  provider: SecretProviderKind
}

export interface SecureStoreStatus {
  available: boolean
  backend: SecureStorageBackend | null
  providers: Record<SecretProviderKind, SecureStoreProviderStatus>
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
  | { type: 'save-provider-secret'; provider: SecretProviderKind; secret: string; retention: ApiKeyRetention }
  | { type: 'delete-provider-secret'; provider: SecretProviderKind }
  | { type: 'load-groq-models' }
  | { type: 'get-popup-status' }
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
