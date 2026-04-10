import type {
  ApiKeyRetention,
  ProviderSecrets,
  SecretProviderKind,
  SecureStoreStatus,
  SecureStoreProviderStatus,
} from '@/shared/types'
import {
  clearEncryptedGeminiApiKey,
  clearEncryptedGroqApiKey,
  loadEncryptedGeminiApiKey,
  loadEncryptedGroqApiKey,
  saveEncryptedGeminiApiKey,
  saveEncryptedGroqApiKey,
} from '@/modules/storage/encryptedSecret'

interface NativeResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

export interface NativeHostInfo {
  workspaceRoot: string
  bridgeUrl: string
  bridgeToken: string
}

const NATIVE_HOST_NAME = 'kr.k_warning_check.codex'

function emptyProviderStatus(provider: SecretProviderKind): SecureStoreProviderStatus {
  return {
    provider,
    hasSecret: false,
    storageBackend: null,
    expiresAt: null,
    lastValidationAt: null,
  }
}

function emptySecureStoreStatus(): SecureStoreStatus {
  return {
    available: false,
    backend: null,
    providers: {
      gemini: emptyProviderStatus('gemini'),
      groq: emptyProviderStatus('groq'),
    },
  }
}

async function sendNativeSecureStoreMessage<T>(message: { type: string; [key: string]: unknown }) {
  const response = (await chrome.runtime.sendNativeMessage(
    NATIVE_HOST_NAME,
    message,
  )) as NativeResponse<T>

  if (!response?.ok) {
    throw new Error(response?.error ?? 'OS 보안 저장소 호출에 실패했습니다.')
  }

  return response.data as T
}

export async function getSecureStoreStatus() {
  try {
    return await sendNativeSecureStoreMessage<SecureStoreStatus>({
      type: 'secure-store-status',
    })
  } catch {
    return emptySecureStoreStatus()
  }
}

export async function getNativeHostInfo() {
  return sendNativeSecureStoreMessage<NativeHostInfo>({
    type: 'get-host-info',
  })
}

export async function resolveCodexWorkspaceRoot(preferredRoot?: string) {
  return sendNativeSecureStoreMessage<NativeHostInfo>({
    type: 'resolve-workspace-root',
    preferredRoot,
  })
}

export async function setProviderSecret(
  provider: SecretProviderKind,
  secret: string,
  retention: ApiKeyRetention,
) {
  const status = await sendNativeSecureStoreMessage<SecureStoreProviderStatus>({
    type: 'secure-store-set-secret',
    provider,
    secret,
    retention,
  })

  if (provider === 'gemini') {
    await saveEncryptedGeminiApiKey(secret, retention)
  } else {
    await saveEncryptedGroqApiKey(secret, retention)
  }

  return status
}

export async function deleteProviderSecret(provider: SecretProviderKind) {
  const status = await sendNativeSecureStoreMessage<SecureStoreProviderStatus>({
    type: 'secure-store-delete-secret',
    provider,
  })

  if (provider === 'gemini') {
    await clearEncryptedGeminiApiKey()
  } else {
    await clearEncryptedGroqApiKey()
  }

  return status
}

export async function validateProviderSecret(provider: SecretProviderKind) {
  return sendNativeSecureStoreMessage<SecureStoreProviderStatus>({
    type: 'secure-store-validate',
    provider,
  })
}

export async function getProviderSecret(provider: SecretProviderKind) {
  const cachedSecret =
    provider === 'gemini' ? await loadEncryptedGeminiApiKey() : await loadEncryptedGroqApiKey()

  if (cachedSecret.trim()) {
    return cachedSecret
  }

  const response = await sendNativeSecureStoreMessage<{
    provider: SecretProviderKind
    secret: string
  }>({
    type: 'secure-store-get-secret',
    provider,
  })

  return response.secret
}

export async function resolveProviderSecrets(): Promise<ProviderSecrets> {
  const secrets: ProviderSecrets = {}
  const [geminiCachedSecret, groqCachedSecret] = await Promise.all([
    loadEncryptedGeminiApiKey(),
    loadEncryptedGroqApiKey(),
  ])

  if (geminiCachedSecret.trim()) {
    secrets.geminiApiKey = geminiCachedSecret
  } else {
    try {
      const geminiApiKey = await getProviderSecret('gemini')
      if (geminiApiKey.trim()) {
        secrets.geminiApiKey = geminiApiKey
      }
    } catch {
      // 설정되지 않았거나 잠긴 경우는 상위 로직에서 비구성 상태로 처리합니다.
    }
  }

  if (groqCachedSecret.trim()) {
    secrets.groqApiKey = groqCachedSecret
  } else {
    try {
      const groqApiKey = await getProviderSecret('groq')
      if (groqApiKey.trim()) {
        secrets.groqApiKey = groqApiKey
      }
    } catch {
      // 설정되지 않았거나 잠긴 경우는 상위 로직에서 비구성 상태로 처리합니다.
    }
  }

  return secrets
}
