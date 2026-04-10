import {
  deriveSecureStoreStatusFromState,
  mergeProviderState,
  normalizePreferredProvider,
  sanitizePersistedState,
} from '@/core/providerStateModel'
import { DEFAULT_PROVIDER_STATE } from '@/shared/defaults'
import { STORAGE_KEYS } from '@/shared/constants'
import type { ProviderState, SecretProviderKind } from '@/shared/types'
import {
  resolveCodexWorkspaceRoot,
  setProviderSecret,
} from '@/modules/storage/secureStore'

async function migrateLegacySecret(
  provider: SecretProviderKind,
  legacySecret: string,
  retention: ProviderState['gemini']['apiKeyRetention'] | ProviderState['groq']['apiKeyRetention'],
) {
  if (!legacySecret.trim()) {
    return
  }

  try {
    await setProviderSecret(provider, legacySecret, retention)
  } catch {
    // OS 보안 저장소로 옮기지 못한 경우에도 기존 로컬 비밀값은 더 이상 사용하지 않습니다.
  }
}

async function migrateLegacyStoredSecrets(rawState: Partial<ProviderState> | undefined) {
  const rawStateAny = rawState as
    | (Partial<ProviderState> & {
        gemini?: Partial<ProviderState['gemini']> & { apiKey?: string }
        groq?: Partial<ProviderState['groq']> & { apiKey?: string }
      })
    | undefined
  const legacyGeminiApiKey = rawStateAny?.gemini?.apiKey || ''
  const legacyGroqApiKey = rawStateAny?.groq?.apiKey || ''
  const hasLegacySecrets = Boolean(
    legacyGeminiApiKey.trim() || legacyGroqApiKey.trim() || rawStateAny?.gemini?.apiKey || rawStateAny?.groq?.apiKey,
  )

  await migrateLegacySecret(
    'gemini',
    legacyGeminiApiKey,
    rawState?.gemini?.apiKeyRetention ?? DEFAULT_PROVIDER_STATE.gemini.apiKeyRetention,
  )
  await migrateLegacySecret(
    'groq',
    legacyGroqApiKey,
    rawState?.groq?.apiKeyRetention ?? DEFAULT_PROVIDER_STATE.groq.apiKeyRetention,
  )

  if (hasLegacySecrets) {
    const sanitizedRawState = sanitizePersistedState({
      ...DEFAULT_PROVIDER_STATE,
      ...rawState,
      gemini: {
        ...DEFAULT_PROVIDER_STATE.gemini,
        ...rawState?.gemini,
        hasSecret: false,
        storageBackend: null,
        expiresAt: null,
        lastValidationAt: null,
      },
      groq: {
        ...DEFAULT_PROVIDER_STATE.groq,
        ...rawState?.groq,
        hasSecret: false,
        storageBackend: null,
        expiresAt: null,
        lastValidationAt: null,
      },
      codex: {
        ...DEFAULT_PROVIDER_STATE.codex,
        ...rawState?.codex,
      },
    } satisfies ProviderState)

    await chrome.storage.local.set({
      [STORAGE_KEYS.providerState]: sanitizedRawState,
    })
  }
}

export async function getProviderState() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.providerState)
  const rawState = stored[STORAGE_KEYS.providerState] as Partial<ProviderState> | undefined

  await migrateLegacyStoredSecrets(rawState)

  const resolvedWorkspaceRoot = await resolveCodexWorkspaceRoot(rawState?.codex?.workspaceRoot).catch(
    () => null,
  )

  const resolvedRawState: Partial<ProviderState> | undefined = rawState
    ? {
        ...rawState,
        codex: {
          ...DEFAULT_PROVIDER_STATE.codex,
          ...(rawState.codex ?? {}),
          bridgeUrl: resolvedWorkspaceRoot?.bridgeUrl || DEFAULT_PROVIDER_STATE.codex.bridgeUrl,
          bridgeToken: resolvedWorkspaceRoot?.bridgeToken || '',
          workspaceRoot: resolvedWorkspaceRoot?.workspaceRoot || '',
        },
      }
    : resolvedWorkspaceRoot
      ? {
          codex: {
            ...DEFAULT_PROVIDER_STATE.codex,
            bridgeUrl: resolvedWorkspaceRoot.bridgeUrl,
            bridgeToken: resolvedWorkspaceRoot.bridgeToken,
            workspaceRoot: resolvedWorkspaceRoot.workspaceRoot,
          },
        }
      : rawState

  return mergeProviderState(resolvedRawState, deriveSecureStoreStatusFromState(resolvedRawState))
}

export async function saveProviderState(state: ProviderState) {
  const normalizedState = normalizePreferredProvider(state)

  await chrome.storage.local.set({
    [STORAGE_KEYS.providerState]: sanitizePersistedState(normalizedState),
  })

  return getProviderState()
}
