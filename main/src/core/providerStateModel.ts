import { DEFAULT_PROVIDER_STATE } from '@/shared/defaults'
import { getSystemUiLocale } from '@/shared/localization'
import type {
  ProviderState,
  SecretProviderKind,
  SecureStoreStatus,
  SecureStoreProviderStatus,
} from '@/shared/types'

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
) {
  if (provider === 'codex') {
    return !state.webSearchEnabled
  }

  if (provider === 'gemini') {
    return state.gemini.hasSecret && Boolean(state.gemini.storageBackend)
  }

  return state.groq.hasSecret && Boolean(state.groq.storageBackend)
}

export function normalizePreferredProvider(state: ProviderState): ProviderState {
  const hasSearchCapableProvider =
    isProviderSelectable(state, 'gemini') || isProviderSelectable(state, 'groq')

  if (state.webSearchEnabled && !hasSearchCapableProvider) {
    return {
      ...state,
      webSearchEnabled: false,
      preferredProvider: 'codex',
    }
  }

  if (isProviderSelectable(state, state.preferredProvider)) {
    return state
  }

  const fallbackOrder: ProviderState['preferredProvider'][] = state.webSearchEnabled
    ? ['gemini', 'groq', 'codex']
    : ['codex', 'gemini', 'groq']

  const fallbackProvider =
    fallbackOrder.find((provider) => isProviderSelectable(state, provider)) ?? 'codex'

  return {
    ...state,
    preferredProvider: fallbackProvider,
  }
}

export function sanitizePersistedState(state: ProviderState): ProviderState {
  return {
    ...state,
    codex: {
      ...state.codex,
      bridgeToken: '',
    },
  }
}

export function mergeProviderState(
  rawState: Partial<ProviderState> | undefined,
  secureStoreStatus: SecureStoreStatus,
) {
  const systemUiLocale = getSystemUiLocale()

  return normalizePreferredProvider(
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
  )
}
