import { CodexProvider } from '@/modules/providers/codexProvider'
import {
  DesktopGeminiProvider,
  DesktopGroqProvider,
  shouldUseDesktopRemoteProviders,
} from '@/modules/providers/desktopRemoteProvider'
import { GeminiProvider } from '@/modules/providers/geminiProvider'
import { GroqProvider } from '@/modules/providers/groqProvider'
import { getCachedRuntimeCapabilities, getSupportedProviders } from '@/shared/runtimeCapabilities'
import type { AIProviderAdapter } from '@/modules/providers/adapter'
import type { ProviderKind, ProviderSecrets, ProviderState, RuntimeCapabilities } from '@/shared/types'

function providerFor(
  kind: Exclude<ProviderKind, 'local'>,
  state: ProviderState,
  secrets: ProviderSecrets,
  runtimeCapabilities: RuntimeCapabilities,
): AIProviderAdapter | null {
  if (kind === 'codex') {
    if (!runtimeCapabilities.supportsCodex) {
      return null
    }

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

export function createConfiguredProviders(state: ProviderState, secrets: ProviderSecrets): AIProviderAdapter[] {
  const runtimeCapabilities = getCachedRuntimeCapabilities()
  const supportedProviders = getSupportedProviders(runtimeCapabilities)
  const orderedKinds = [
    state.preferredProvider,
    ...supportedProviders.filter((kind) => kind !== state.preferredProvider),
  ]

  return orderedKinds
    .map((kind) => providerFor(kind, state, secrets, runtimeCapabilities))
    .filter((provider): provider is NonNullable<ReturnType<typeof providerFor>> => provider !== null)
    .filter((provider, index, providers) => {
      if (!provider.isConfigured()) {
        return false
      }

      return providers.findIndex((item) => item.kind === provider.kind) === index
    })
}

export function createSelectedProvider(
  state: ProviderState,
  secrets: ProviderSecrets,
): AIProviderAdapter | null {
  const runtimeCapabilities = getCachedRuntimeCapabilities()
  const provider = providerFor(state.preferredProvider, state, secrets, runtimeCapabilities)

  if (!provider?.isConfigured()) {
    return null
  }

  return provider
}

export function createCodexProvider(state: ProviderState, secrets: ProviderSecrets) {
  return new CodexProvider(state, secrets)
}
