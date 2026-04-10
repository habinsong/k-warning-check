import { CodexProvider } from '@/modules/providers/codexProvider'
import {
  DesktopGeminiProvider,
  DesktopGroqProvider,
  shouldUseDesktopRemoteProviders,
} from '@/modules/providers/desktopRemoteProvider'
import { GeminiProvider } from '@/modules/providers/geminiProvider'
import { GroqProvider } from '@/modules/providers/groqProvider'
import type { AIProviderAdapter } from '@/modules/providers/adapter'
import type { ProviderKind, ProviderSecrets, ProviderState } from '@/shared/types'

function providerFor(
  kind: Exclude<ProviderKind, 'local'>,
  state: ProviderState,
  secrets: ProviderSecrets,
) {
  if (kind === 'codex') {
    return new CodexProvider(state, secrets)
  }

  if (kind === 'groq') {
    if (shouldUseDesktopRemoteProviders()) {
      return new DesktopGroqProvider(state, secrets)
    }

    return new GroqProvider(state, secrets)
  }

  if (shouldUseDesktopRemoteProviders()) {
    return new DesktopGeminiProvider(state, secrets)
  }

  return new GeminiProvider(state, secrets)
}

export function createConfiguredProviders(state: ProviderState, secrets: ProviderSecrets) {
  const orderedKinds = [
    state.preferredProvider,
    ...(['groq', 'gemini', 'codex'] as const).filter((kind) => kind !== state.preferredProvider),
  ]

  return orderedKinds
    .map((kind) => providerFor(kind, state, secrets))
    .filter((provider, index, providers) => {
      if (!provider.isConfigured()) {
        return false
      }

      return providers.findIndex((item) => item.kind === provider.kind) === index
    })
}

export function createExplanationAssistant(
  state: ProviderState,
  secrets: ProviderSecrets,
): AIProviderAdapter | null {
  if (!state.autoUseConfiguredProviders) {
    return null
  }

  return createConfiguredProviders(state, secrets)[0] ?? null
}

export function createCodexProvider(state: ProviderState, secrets: ProviderSecrets) {
  return new CodexProvider(state, secrets)
}
