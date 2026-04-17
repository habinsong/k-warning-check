import { BaseProviderAdapter, type ProviderRiskContext } from '@/modules/providers/adapter'
import { buildGroqRiskAnalysisRequest } from '@/modules/providers/groqProvider'

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

  async analyzeRisk(context: ProviderRiskContext) {
    const request = this.buildRiskAnalysisRequest(context)
    const rawText = await window.kwcDesktop.providerBridge.invoke<string>('gemini', 'analyzeRisk', {
      prompt: request.prompt,
      imageDataUrl: context.input.imageDataUrl,
      useWebSearch: request.shouldUseWebSearch,
    })

    return this.parseRiskAnalysisResponse(rawText, context)
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

  async analyzeRisk(context: ProviderRiskContext) {
    const request = buildGroqRiskAnalysisRequest(this.state, {
      ...context,
      webSearchEnabled: context.webSearchEnabled && !context.input.imageDataUrl,
    })
    const rawText = await window.kwcDesktop.providerBridge.invoke<string>('groq', 'analyzeRisk', {
      prompt: request.prompt,
      imageDataUrl: context.input.imageDataUrl,
      useWebSearch: request.shouldUseWebSearch,
    })

    return this.parseRiskAnalysisResponse(rawText, context)
  }
}

export function shouldUseDesktopRemoteProviders() {
  return isDesktopProviderBridgeAvailable()
}
