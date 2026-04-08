import { DEFAULT_PROVIDER_STATE } from '@/shared/defaults'
import { STORAGE_KEYS } from '@/shared/constants'
import type { ProviderState } from '@/shared/types'
import {
  loadEncryptedGroqApiKey,
  loadEncryptedGeminiApiKey,
  saveEncryptedGroqApiKey,
  saveEncryptedGeminiApiKey,
} from '@/modules/storage/encryptedSecret'

export async function getProviderState() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.providerState)
  const rawState = stored[STORAGE_KEYS.providerState] as Partial<ProviderState> | undefined
  const encryptedApiKey = await loadEncryptedGeminiApiKey()
  const encryptedGroqApiKey = await loadEncryptedGroqApiKey()
  const legacyPlainApiKey = rawState?.gemini?.apiKey ?? ''
  const legacyPlainGroqApiKey = rawState?.groq?.apiKey ?? ''

  if (!encryptedApiKey && legacyPlainApiKey) {
    await saveEncryptedGeminiApiKey(
      legacyPlainApiKey,
      rawState?.gemini?.apiKeyRetention ?? DEFAULT_PROVIDER_STATE.gemini.apiKeyRetention,
    )
  }

  if (!encryptedGroqApiKey && legacyPlainGroqApiKey) {
    await saveEncryptedGroqApiKey(
      legacyPlainGroqApiKey,
      rawState?.groq?.apiKeyRetention ?? DEFAULT_PROVIDER_STATE.groq.apiKeyRetention,
    )
  }

  return {
    ...DEFAULT_PROVIDER_STATE,
    ...rawState,
    gemini: {
      ...DEFAULT_PROVIDER_STATE.gemini,
      ...rawState?.gemini,
      apiKey: encryptedApiKey || legacyPlainApiKey,
    },
    groq: {
      ...DEFAULT_PROVIDER_STATE.groq,
      ...rawState?.groq,
      apiKey: encryptedGroqApiKey || legacyPlainGroqApiKey,
    },
    codex: {
      ...DEFAULT_PROVIDER_STATE.codex,
      ...rawState?.codex,
    },
  } satisfies ProviderState
}

export async function saveProviderState(state: ProviderState) {
  await saveEncryptedGeminiApiKey(state.gemini.apiKey, state.gemini.apiKeyRetention)
  await saveEncryptedGroqApiKey(state.groq.apiKey, state.groq.apiKeyRetention)

  const persistableState: ProviderState = {
    ...state,
    gemini: {
      ...state.gemini,
      apiKey: '',
    },
    groq: {
      ...state.groq,
      apiKey: '',
    },
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.providerState]: persistableState,
  })

  return getProviderState()
}
