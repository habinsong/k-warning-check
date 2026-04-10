import { STORAGE_KEYS } from '@/shared/constants'
import type { ApiKeyRetention } from '@/shared/types'

interface EncryptedSecretRecord {
  cipherText: string
  iv: string
  createdAt: number
  expiresAt: number
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

type SecretStorageKey = typeof STORAGE_KEYS.geminiApiKey | typeof STORAGE_KEYS.groqApiKey

function retentionMs(value: ApiKeyRetention) {
  if (value === 'hourly') {
    return 60 * 60 * 1000
  }

  return Number(value.replace('d', '')) * 24 * 60 * 60 * 1000
}

async function getOrCreateSalt() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.cryptoSalt)
  const current = stored[STORAGE_KEYS.cryptoSalt] as string | undefined

  if (current) {
    return fromBase64(current)
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  await chrome.storage.local.set({ [STORAGE_KEYS.cryptoSalt]: toBase64(salt) })
  return salt
}

async function getCryptoKey() {
  const salt = await getOrCreateSalt()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(`k-warning-check:${chrome.runtime.id}`),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 210_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function saveEncryptedApiKey(
  storageKey: SecretStorageKey,
  apiKey: string,
  retention: ApiKeyRetention,
) {
  if (!apiKey.trim()) {
    await chrome.storage.local.remove(storageKey)
    return
  }

  const key = await getCryptoKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const createdAt = Date.now()
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    textEncoder.encode(apiKey),
  )

  const record: EncryptedSecretRecord = {
    cipherText: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    createdAt,
    expiresAt: createdAt + retentionMs(retention),
  }

  await chrome.storage.local.set({
    [storageKey]: record,
  })
}

async function loadEncryptedApiKey(storageKey: SecretStorageKey) {
  const stored = await chrome.storage.local.get(storageKey)
  const record = stored[storageKey] as EncryptedSecretRecord | undefined

  if (!record) {
    return ''
  }

  if (record.expiresAt <= Date.now()) {
    await chrome.storage.local.remove(storageKey)
    return ''
  }

  try {
    const key = await getCryptoKey()
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(record.iv),
      },
      key,
      fromBase64(record.cipherText),
    )

    return textDecoder.decode(decrypted)
  } catch {
    await chrome.storage.local.remove(storageKey)
    return ''
  }
}

async function clearEncryptedApiKey(storageKey: SecretStorageKey) {
  await chrome.storage.local.remove(storageKey)
}

export async function clearLegacyEncryptedSecrets() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.geminiApiKey,
    STORAGE_KEYS.groqApiKey,
    STORAGE_KEYS.cryptoSalt,
  ])
}

export async function saveEncryptedGeminiApiKey(apiKey: string, retention: ApiKeyRetention) {
  await saveEncryptedApiKey(STORAGE_KEYS.geminiApiKey, apiKey, retention)
}

export async function loadEncryptedGeminiApiKey() {
  return loadEncryptedApiKey(STORAGE_KEYS.geminiApiKey)
}

export async function saveEncryptedGroqApiKey(apiKey: string, retention: ApiKeyRetention) {
  await saveEncryptedApiKey(STORAGE_KEYS.groqApiKey, apiKey, retention)
}

export async function loadEncryptedGroqApiKey() {
  return loadEncryptedApiKey(STORAGE_KEYS.groqApiKey)
}

export async function clearEncryptedGeminiApiKey() {
  await clearEncryptedApiKey(STORAGE_KEYS.geminiApiKey)
}

export async function clearEncryptedGroqApiKey() {
  await clearEncryptedApiKey(STORAGE_KEYS.groqApiKey)
}
