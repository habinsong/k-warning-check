const DEFAULT_PROVIDER_STATE = {
  uiLocale: 'ko',
  onboardingCompleted: false,
  preferredProvider: 'codex',
  webSearchEnabled: true,
  theme: 'system',
  autoUseConfiguredProviders: true,
  remoteExplanationEnabled: false,
  remoteOcrEnabled: false,
  gemini: {
    model: 'gemini-3.1-pro-preview',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    apiKeyRetention: '7d',
    hasSecret: false,
    storageBackend: null,
    expiresAt: null,
    lastValidationAt: null,
  },
  groq: {
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
    hasSecret: false,
    storageBackend: null,
    expiresAt: null,
    lastValidationAt: null,
  },
  codex: {
    bridgeUrl: 'http://127.0.0.1:4317',
    bridgeToken: '',
    workspaceRoot: process.env.KWC_WORKSPACE_ROOT || '',
    loginCommand: 'codex login',
    model: 'gpt-5.4-mini',
    reasoningEffort: 'low',
  },
}

function emptyProviderStatus(provider) {
  return {
    provider,
    hasSecret: false,
    storageBackend: null,
    expiresAt: null,
    lastValidationAt: null,
  }
}

function deriveSecureStoreStatusFromState(rawState) {
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

function getSystemUiLocale() {
  const locale =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().locale
      : process.env.LANG || 'ko-KR'

  return String(locale).toLowerCase().startsWith('en') ? 'en' : 'ko'
}

function syncProviderSecurityMetadata(state, secureStoreStatus) {
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

function isProviderSelectable(state, provider) {
  if (provider === 'codex') {
    return !state.webSearchEnabled
  }

  if (provider === 'gemini') {
    return state.gemini.hasSecret && Boolean(state.gemini.storageBackend)
  }

  return state.groq.hasSecret && Boolean(state.groq.storageBackend)
}

function normalizePreferredProvider(state) {
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

  const fallbackOrder = state.webSearchEnabled
    ? ['gemini', 'groq', 'codex']
    : ['codex', 'gemini', 'groq']

  const fallbackProvider =
    fallbackOrder.find((provider) => isProviderSelectable(state, provider)) ?? 'codex'

  return {
    ...state,
    preferredProvider: fallbackProvider,
  }
}

function sanitizePersistedState(state) {
  return {
    ...state,
    codex: {
      ...state.codex,
      bridgeToken: '',
    },
  }
}

function mergeProviderState(rawState, secureStoreStatus) {
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
      },
      secureStoreStatus,
    ),
  )
}

export {
  DEFAULT_PROVIDER_STATE,
  deriveSecureStoreStatusFromState,
  mergeProviderState,
  normalizePreferredProvider,
  sanitizePersistedState,
}
