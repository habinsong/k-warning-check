export const GEMINI_MODEL_OPTIONS = [
  {
    id: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash-Lite Preview',
    description: '기본 · 가장 빠름',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    description: '속도 우선',
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview',
    description: '정확도 우선',
  },
] as const

export const API_KEY_RETENTION_OPTIONS = [
  { id: 'hourly', label: '1시간 뒤 초기화' },
  { id: '1d', label: '1일 뒤 초기화' },
  { id: '2d', label: '2일 뒤 초기화' },
  { id: '3d', label: '3일 뒤 초기화' },
  { id: '5d', label: '5일 뒤 초기화' },
  { id: '7d', label: '7일 뒤 초기화' },
] as const

export const CODEX_MODEL_OPTIONS = [
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    description: '빠른 응답 우선',
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    description: '균형형',
  },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT-5.3 Codex',
    description: 'Codex 계열',
  },
] as const

export const CODEX_REASONING_OPTIONS = [
  { id: 'low', label: '낮음', description: '속도 우선' },
  { id: 'medium', label: '중간', description: '균형형' },
  { id: 'high', label: '높음', description: '정밀도 우선' },
  { id: 'xhigh', label: '매우 높음', description: '가장 느림' },
] as const

export const GROQ_MODEL_OPTIONS = [
  {
    id: 'groq/compound-mini',
    label: 'Compound Mini',
    description: '기본 · 빠른 단일 호출',
  },
  {
    id: 'groq/compound',
    label: 'Compound',
    description: '권장 · 웹검색과 내장 도구 전체',
  },
  {
    id: 'openai/gpt-oss-120b',
    label: 'GPT OSS 120B',
    description: '큰 컨텍스트 · 일부 도구',
  },
  {
    id: 'openai/gpt-oss-20b',
    label: 'GPT OSS 20B',
    description: '빠른 OSS 모델 · 일부 도구',
  },
  {
    id: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    label: 'Llama 4 Maverick 17B 128E',
    description: '텍스트/비전 계열',
  },
  {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B 16E',
    description: '긴 컨텍스트 계열',
  },
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B Versatile',
    description: '범용 텍스트',
  },
  {
    id: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B Instant',
    description: '저지연 텍스트',
  },
  {
    id: 'qwen/qwen3-32b',
    label: 'Qwen3 32B',
    description: '범용 텍스트',
  },
] as const

export const GROQ_TOOL_OPTIONS = [
  { id: 'web_search', label: '웹검색' },
  { id: 'code_interpreter', label: '코드 실행' },
  { id: 'visit_website', label: '웹사이트 방문' },
  { id: 'browser_automation', label: '브라우저 자동화' },
  { id: 'wolfram_alpha', label: 'Wolfram Alpha' },
] as const
