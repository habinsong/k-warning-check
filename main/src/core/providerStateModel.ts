import { DEFAULT_PROVIDER_STATE } from '@/shared/defaults'
import { getSystemUiLocale } from '@/shared/localization'
import {
  DEFAULT_RUNTIME_CAPABILITIES,
  getDefaultPreferredProvider,
} from '@/shared/runtimeCapabilities'
import type {
  ProviderState,
  RuntimeCapabilities,
  SecretProviderKind,
  SecureStoreStatus,
  SecureStoreProviderStatus,
} from '@/shared/types'

const CURRENT_ONBOARDING_VERSION = 2

function emptyProviderStatus(provider: SecretProviderKind): SecureStoreProviderStatus {
  return {
    provider,
    hasSecret: false,
    storageBackend: null,
    expiresAt: null,
    lastValidationAt: null,
  }
}

export function deriveSecureStoreStatusFromState(
  rawState: Partial<ProviderState> | undefined,
): SecureStoreStatus {
  const gemini = {
    ...emptyProviderStatus('gemini'),
    ...(rawState?.gemini
      ? {
          hasSecret: Boolean(rawState.gemini.hasSecret),
          storageBackend: rawState.gemini.storageBackend ?? null,
          expiresAt: rawState.gemini.expiresAt ?? null,
          lastValidationAt: rawState.gemini.lastValidationAt ?? null,
        }
      : {}),
  }
  const groq = {
    ...emptyProviderStatus('groq'),
    ...(rawState?.groq
      ? {
          hasSecret: Boolean(rawState.groq.hasSecret),
          storageBackend: rawState.groq.storageBackend ?? null,
          expiresAt: rawState.groq.expiresAt ?? null,
          lastValidationAt: rawState.groq.lastValidationAt ?? null,
        }
      : {}),
  }

  return {
    available: Boolean(gemini.storageBackend || groq.storageBackend),
    backend: gemini.storageBackend || groq.storageBackend || null,
    providers: {
      gemini,
      groq,
    },
  }
}

export function syncProviderSecurityMetadata(
  state: ProviderState,
  secureStoreStatus: SecureStoreStatus,
): ProviderState {
  return {
    ...state,
    gemini: {
      ...state.gemini,
      ...secureStoreStatus.providers.gemini,
    },
    groq: {
      ...state.groq,
      ...secureStoreStatus.providers.groq,
    },
  }
}

export function isProviderSelectable(
  state: ProviderState,
  provider: ProviderState['preferredProvider'],
  runtimeCapabilities: RuntimeCapabilities = DEFAULT_RUNTIME_CAPABILITIES,
) {
  if (provider === 'codex') {
    return runtimeCapabilities.supportsCodex && !state.webSearchEnabled
  }

  if (provider === 'gemini') {
    return state.gemini.hasSecret && Boolean(state.gemini.storageBackend)
  }

  return state.groq.hasSecret && Boolean(state.groq.storageBackend)
}

export function normalizePreferredProvider(state: ProviderState): ProviderState {
  return normalizePreferredProviderWithCapabilities(state, DEFAULT_RUNTIME_CAPABILITIES)
}

export function normalizePreferredProviderWithCapabilities(
  state: ProviderState,
  runtimeCapabilities: RuntimeCapabilities = DEFAULT_RUNTIME_CAPABILITIES,
): ProviderState {
  const defaultProvider = getDefaultPreferredProvider(runtimeCapabilities)
  const hasSearchCapableProvider =
    isProviderSelectable(state, 'gemini', runtimeCapabilities) ||
    isProviderSelectable(state, 'groq', runtimeCapabilities)

  let nextState = state

  if (nextState.webSearchEnabled && !hasSearchCapableProvider) {
    nextState = {
      ...nextState,
      webSearchEnabled: false,
      preferredProvider: defaultProvider,
    }
  }

  if (!runtimeCapabilities.supportsCodex && nextState.preferredProvider === 'codex') {
    const hasSelectableRemoteProvider =
      isProviderSelectable(nextState, 'gemini', runtimeCapabilities) ||
      isProviderSelectable(nextState, 'groq', runtimeCapabilities)

    nextState = {
      ...nextState,
      preferredProvider: defaultProvider,
      remoteExplanationEnabled: hasSelectableRemoteProvider ? nextState.remoteExplanationEnabled : false,
      remoteOcrEnabled: hasSelectableRemoteProvider ? nextState.remoteOcrEnabled : false,
      webSearchEnabled: hasSelectableRemoteProvider ? nextState.webSearchEnabled : false,
    }
  }

  if (isProviderSelectable(nextState, nextState.preferredProvider, runtimeCapabilities)) {
    return nextState
  }

  const fallbackOrder: ProviderState['preferredProvider'][] = nextState.webSearchEnabled
    ? ['gemini', 'groq', ...(runtimeCapabilities.supportsCodex ? (['codex'] as const) : [])]
    : [...(runtimeCapabilities.supportsCodex ? (['codex'] as const) : []), 'gemini', 'groq']

  const fallbackProvider =
    fallbackOrder.find((provider) => isProviderSelectable(nextState, provider, runtimeCapabilities)) ?? defaultProvider

  return {
    ...nextState,
    preferredProvider: fallbackProvider,
    remoteExplanationEnabled:
      !runtimeCapabilities.supportsCodex &&
      !isProviderSelectable(nextState, 'gemini', runtimeCapabilities) &&
      !isProviderSelectable(nextState, 'groq', runtimeCapabilities)
        ? false
        : nextState.remoteExplanationEnabled,
    remoteOcrEnabled:
      !runtimeCapabilities.supportsCodex &&
      !isProviderSelectable(nextState, 'gemini', runtimeCapabilities) &&
      !isProviderSelectable(nextState, 'groq', runtimeCapabilities)
        ? false
        : nextState.remoteOcrEnabled,
  }
}

export function sanitizePersistedState(state: ProviderState): ProviderState {
  return {
    ...state,
    gemini: {
      ...state.gemini,
      hasSecret: false,
      storageBackend: null,
      expiresAt: null,
      lastValidationAt: null,
    },
    groq: {
      ...state.groq,
      hasSecret: false,
      storageBackend: null,
      expiresAt: null,
      lastValidationAt: null,
    },
    codex: {
      ...state.codex,
      bridgeToken: '',
    },
  }
}

export function normalizeOnboardingState(state: ProviderState): ProviderState {
  if (state.onboardingCompleted && (state.onboardingVersion ?? 0) < CURRENT_ONBOARDING_VERSION) {
    return {
      ...state,
      onboardingCompleted: false,
    }
  }

  return state
}

export function mergeProviderState(
  rawState: Partial<ProviderState> | undefined,
  secureStoreStatus: SecureStoreStatus,
  runtimeCapabilities: RuntimeCapabilities = DEFAULT_RUNTIME_CAPABILITIES,
) {
  const systemUiLocale = getSystemUiLocale()

  return normalizePreferredProviderWithCapabilities(
    normalizeOnboardingState(
      syncProviderSecurityMetadata(
        {
          ...DEFAULT_PROVIDER_STATE,
          ...rawState,
          uiLocale: rawState?.uiLocale ?? systemUiLocale,
          gemini: {
            ...DEFAULT_PROVIDER_STATE.gemini,
            ...rawState?.gemini,
          },
          groq: {
            ...DEFAULT_PROVIDER_STATE.groq,
            ...rawState?.groq,
          },
          codex: {
            ...DEFAULT_PROVIDER_STATE.codex,
            ...rawState?.codex,
          },
        } satisfies ProviderState,
        secureStoreStatus,
      ),
    ),
    runtimeCapabilities,
  )
}
