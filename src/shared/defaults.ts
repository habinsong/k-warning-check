import type { ProviderState } from '@/shared/types'

export const DEFAULT_PROVIDER_STATE: ProviderState = {
  preferredProvider: 'codex',
  autoUseConfiguredProviders: true,
  remoteExplanationEnabled: false,
  remoteOcrEnabled: false,
  gemini: {
    apiKey: '',
    model: 'gemini-3.1-pro-preview',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    apiKeyRetention: '7d',
  },
  groq: {
    apiKey: '',
    model: 'groq/compound',
    endpoint: 'https://api.groq.com/openai/v1',
    apiKeyRetention: '7d',
    enabledTools: [
      'web_search',
      'code_interpreter',
      'visit_website',
      'browser_automation',
      'wolfram_alpha',
    ],
  },
  codex: {
    bridgeUrl: 'http://127.0.0.1:4317',
    workspaceRoot: '/Users/songhabin/k-warning-check',
    loginCommand: 'codex login',
    model: 'gpt-5.4-mini',
    reasoningEffort: 'low',
  },
}
