import { BaseProviderAdapter } from '@/modules/providers/adapter'
import type { WebFreshnessVerification } from '@/shared/types'

function isDesktopProviderBridgeAvailable() {
  return (
    typeof window !== 'undefined' &&
    typeof window.kwcDesktop !== 'undefined' &&
    typeof window.kwcDesktop.providerBridge?.invoke === 'function'
  )
}

function isCompoundModel(model: string) {
  return model === 'groq/compound' || model === 'groq/compound-mini'
}

function isGptOssModel(model: string) {
  return model === 'openai/gpt-oss-120b' || model === 'openai/gpt-oss-20b'
}

export class DesktopGeminiProvider extends BaseProviderAdapter {
  kind = 'gemini' as const

  static isAvailable() {
    return isDesktopProviderBridgeAvailable()
  }

  isConfigured() {
    return Boolean(this.state.gemini.hasSecret && this.state.gemini.storageBackend)
  }

  supportsWebFreshnessCheck() {
    return true
  }

  summarize(prompt: string) {
    return window.kwcDesktop.providerBridge.invoke<string>('gemini', 'summarize', {
      prompt,
    })
  }

  extractTextFromImage(imageDataUrl: string) {
    return window.kwcDesktop.providerBridge.invoke<string>('gemini', 'extractTextFromImage', {
      imageDataUrl,
    })
  }

  verifyFreshness(text: string): Promise<WebFreshnessVerification> {
    return window.kwcDesktop.providerBridge.invoke<WebFreshnessVerification>('gemini', 'verifyFreshness', {
      text,
    })
  }
}

export class DesktopGroqProvider extends BaseProviderAdapter {
  kind = 'groq' as const

  static isAvailable() {
    return isDesktopProviderBridgeAvailable()
  }

  isConfigured() {
    return Boolean(this.state.groq.hasSecret && this.state.groq.storageBackend)
  }

  supportsWebFreshnessCheck() {
    const model = this.state.groq.model.trim() || 'groq/compound'
    return isCompoundModel(model) || isGptOssModel(model)
  }

  summarize(prompt: string) {
    return window.kwcDesktop.providerBridge.invoke<string>('groq', 'summarize', {
      prompt,
    })
  }

  extractTextFromImage(imageDataUrl: string) {
    return window.kwcDesktop.providerBridge.invoke<string>('groq', 'extractTextFromImage', {
      imageDataUrl,
    })
  }

  verifyFreshness(text: string): Promise<WebFreshnessVerification> {
    return window.kwcDesktop.providerBridge.invoke<WebFreshnessVerification>('groq', 'verifyFreshness', {
      text,
    })
  }
}

export function shouldUseDesktopRemoteProviders() {
  return isDesktopProviderBridgeAvailable()
}
