import type { ProviderState, RuntimeCapabilities, RuntimeOs, UiLocale } from '@/shared/types'

const DEFAULT_RUNTIME_OS: RuntimeOs = 'unknown'
let cachedRuntimeCapabilities = createRuntimeCapabilities(DEFAULT_RUNTIME_OS)
let chromeRuntimeCapabilitiesPromise: Promise<RuntimeCapabilities> | null = null

export const DEFAULT_RUNTIME_CAPABILITIES = createRuntimeCapabilities(DEFAULT_RUNTIME_OS)

export function normalizeRuntimeOs(os: string | null | undefined): RuntimeOs {
  const normalized = String(os ?? '').trim().toLowerCase()

  if (normalized === 'mac' || normalized === 'darwin') {
    return 'mac'
  }

  if (normalized === 'win' || normalized === 'windows' || normalized === 'win32') {
    return 'windows'
  }

  if (normalized === 'linux') {
    return 'linux'
  }

  if (normalized === 'android') {
    return 'android'
  }

  if (normalized === 'cros' || normalized === 'chromeos') {
    return 'cros'
  }

  if (normalized === 'openbsd') {
    return 'openbsd'
  }

  if (normalized === 'fuchsia') {
    return 'fuchsia'
  }

  return DEFAULT_RUNTIME_OS
}

export function createRuntimeCapabilities(os: string | RuntimeOs): RuntimeCapabilities {
  const normalizedOs = normalizeRuntimeOs(os)

  return {
    os: normalizedOs,
    supportsCodex: normalizedOs !== 'windows',
  }
}

export function setCachedRuntimeCapabilities(capabilities: RuntimeCapabilities) {
  cachedRuntimeCapabilities = capabilities
  return capabilities
}

export function getCachedRuntimeCapabilities() {
  return cachedRuntimeCapabilities
}

export function getSupportedProviders(
  capabilities: RuntimeCapabilities,
): ProviderState['preferredProvider'][] {
  return capabilities.supportsCodex ? ['codex', 'gemini', 'groq'] : ['gemini', 'groq']
}

export function getDefaultPreferredProvider(capabilities: RuntimeCapabilities): ProviderState['preferredProvider'] {
  return capabilities.supportsCodex ? 'codex' : 'gemini'
}

export function getCodexUnsupportedMessage(locale: UiLocale) {
  return locale === 'en' ? 'Codex is not available on Windows.' : 'Windows에서는 Codex를 지원하지 않습니다.'
}

function loadChromePlatformInfo() {
  return new Promise<chrome.runtime.PlatformInfo>((resolve, reject) => {
    if (!chrome.runtime?.getPlatformInfo) {
      reject(new Error('chrome.runtime.getPlatformInfo is unavailable.'))
      return
    }

    chrome.runtime.getPlatformInfo((platformInfo) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      resolve(platformInfo)
    })
  })
}

export async function getChromeRuntimeCapabilities() {
  if (cachedRuntimeCapabilities.os !== DEFAULT_RUNTIME_OS) {
    return cachedRuntimeCapabilities
  }

  if (!chromeRuntimeCapabilitiesPromise) {
    chromeRuntimeCapabilitiesPromise = loadChromePlatformInfo()
      .then((platformInfo) => setCachedRuntimeCapabilities(createRuntimeCapabilities(platformInfo.os)))
      .catch(() => cachedRuntimeCapabilities)
      .finally(() => {
        chromeRuntimeCapabilitiesPromise = null
      })
  }

  return chromeRuntimeCapabilitiesPromise
}
