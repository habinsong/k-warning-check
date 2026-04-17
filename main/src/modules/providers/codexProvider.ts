import { BaseProviderAdapter, type ProviderRiskContext } from '@/modules/providers/adapter'
import { getCachedRuntimeCapabilities } from '@/shared/runtimeCapabilities'

interface CodexBridgeResponse {
  ok: boolean
  data?: {
    message?: string
    status?: string
    command?: string
  }
  error?: string
}

export class CodexProvider extends BaseProviderAdapter {
  kind = 'codex' as const

  isConfigured() {
    return (
      getCachedRuntimeCapabilities().supportsCodex &&
      Boolean(this.state.codex.bridgeUrl.trim() && this.state.codex.bridgeToken.trim())
    )
  }

  private async invokeBridge(
    pathname: '/summarize',
    body: Record<string, unknown>,
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Codex 연결이 설정되지 않았습니다.')
    }

    const response = await fetch(`${this.state.codex.bridgeUrl}${pathname}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KWC-Bridge-Token': this.state.codex.bridgeToken,
      },
      body: JSON.stringify({
        ...body,
        workspaceRoot: this.state.codex.workspaceRoot,
        model: this.state.codex.model,
        reasoningEffort: this.state.codex.reasoningEffort,
      }),
      signal: AbortSignal.timeout(25_000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(
        `Codex 연결 호출 실패: ${response.status}${errorText ? ` ${errorText}` : ''}`.trim(),
      )
    }

    const data = (await response.json()) as CodexBridgeResponse

    if (!data.ok || !data.data?.message?.trim()) {
      throw new Error(data.error ?? 'Codex 응답을 해석할 수 없습니다.')
    }

    return data.data.message.trim()
  }

  async analyzeRisk(context: ProviderRiskContext) {
    const request = this.buildRiskAnalysisRequest(context)
    const rawText = await this.invokeBridge('/summarize', {
      prompt: request.prompt,
      imageDataUrl: context.input.imageDataUrl,
    })

    return this.parseRiskAnalysisResponse(rawText, context)
  }

  async checkStatus() {
    const response = await fetch(`${this.state.codex.bridgeUrl}/health`, {
      headers: {
        'X-KWC-Bridge-Token': this.state.codex.bridgeToken,
      },
    })

    if (!response.ok) {
      throw new Error(`Codex 연결 상태 확인 실패: ${response.status}`)
    }

    const data = (await response.json()) as CodexBridgeResponse

    if (!data.ok) {
      throw new Error(data.error ?? 'Codex 상태 확인에 실패했습니다.')
    }

    return data.data
  }
}
