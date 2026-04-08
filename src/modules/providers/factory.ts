import { CodexProvider } from '@/modules/providers/codexProvider'
import { GeminiProvider } from '@/modules/providers/geminiProvider'
import { GroqProvider } from '@/modules/providers/groqProvider'
import type { AIProviderAdapter } from '@/modules/providers/adapter'
import type { ProviderKind, ProviderState } from '@/shared/types'

function providerFor(kind: Exclude<ProviderKind, 'local'>, state: ProviderState) {
  if (kind === 'codex') {
    return new CodexProvider(state)
  }

  if (kind === 'groq') {
    return new GroqProvider(state)
  }

  return new GeminiProvider(state)
}

export function createConfiguredProviders(state: ProviderState) {
  const orderedKinds = [
    state.preferredProvider,
    ...(['groq', 'gemini', 'codex'] as const).filter((kind) => kind !== state.preferredProvider),
  ]

  return orderedKinds
    .map((kind) => providerFor(kind, state))
    .filter((provider, index, providers) => {
      if (!provider.isConfigured()) {
        return false
      }

      return providers.findIndex((item) => item.kind === provider.kind) === index
    })
}

export function createExplanationAssistant(state: ProviderState): AIProviderAdapter | null {
  if (!state.autoUseConfiguredProviders) {
    return null
  }

  return createConfiguredProviders(state)[0] ?? null
}

export function createCodexProvider(state: ProviderState) {
  return new CodexProvider(state)
}
