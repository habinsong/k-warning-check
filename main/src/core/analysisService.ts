import type {
  CaptureReader,
  ClipboardReader,
  HistoryRepository,
  ProviderStateRepository,
  SecureStoreService,
  AnalysisReadyNotifier,
} from '@/core/contracts'
import { analyzeInput } from '@/modules/analyzer/analyzeInput'
import type { AnalysisInput, CaptureRect } from '@/shared/types'

interface CreateAnalysisServiceOptions {
  historyRepository: HistoryRepository
  providerStateRepository: ProviderStateRepository
  secureStoreService: SecureStoreService
  clipboardReader?: ClipboardReader
  captureReader?: CaptureReader
  analysisReadyNotifier?: AnalysisReadyNotifier
}

export function createAnalysisService({
  historyRepository,
  providerStateRepository,
  secureStoreService,
  clipboardReader,
  captureReader,
  analysisReadyNotifier,
}: CreateAnalysisServiceOptions) {
  async function analyzeAndPersist(input: AnalysisInput) {
    const providerState = await providerStateRepository.getProviderState()
    const providerSecrets = await secureStoreService.resolveProviderSecrets()
    const record = await analyzeInput(input, providerState, providerSecrets)
    await historyRepository.saveRecord(record)
    await analysisReadyNotifier?.notify(record)
    return record
  }

  return {
    analyzeAndPersist,
    analyzeText(rawText: string, metadata?: AnalysisInput['metadata']) {
      return analyzeAndPersist({
        source: 'text',
        rawText,
        createdAt: new Date().toISOString(),
        metadata,
      })
    },
    analyzeUrl(url: string, metadata?: AnalysisInput['metadata']) {
      return analyzeAndPersist({
        source: 'url',
        rawText: url,
        pageUrl: url,
        createdAt: new Date().toISOString(),
        metadata,
      })
    },
    analyzeImage(imageDataUrl: string, title?: string, metadata?: AnalysisInput['metadata']) {
      return analyzeAndPersist({
        source: 'image',
        imageDataUrl,
        title,
        createdAt: new Date().toISOString(),
        metadata,
      })
    },
    async analyzeClipboard(rawTextOrMetadata?: string | AnalysisInput['metadata'], metadata?: AnalysisInput['metadata']) {
      if (!clipboardReader) {
        throw new Error('클립보드 분석을 지원하지 않는 환경입니다.')
      }

      const rawText =
        typeof rawTextOrMetadata === 'string'
          ? rawTextOrMetadata.trim()
          : (await clipboardReader.readClipboardText()).trim()
      const resolvedMetadata =
        typeof rawTextOrMetadata === 'string'
          ? metadata
          : rawTextOrMetadata

      if (!rawText) {
        throw new Error('클립보드에 분석할 텍스트가 없습니다.')
      }

      return analyzeAndPersist({
        source: 'clipboard',
        rawText,
        createdAt: new Date().toISOString(),
        metadata: resolvedMetadata,
      })
    },
    async analyzeCapturedRegion(request: {
      rect: CaptureRect
      title?: string
      pageUrl?: string
    }) {
      if (!captureReader) {
        throw new Error('영역 캡처 분석을 지원하지 않는 환경입니다.')
      }

      const input = await captureReader.captureRegion(request)
      return analyzeAndPersist(input)
    },
    async getLatestRecord() {
      return (await historyRepository.getHistoryBundle()).latestRecord ?? null
    },
    async getHistory() {
      return (await historyRepository.getHistoryBundle()).history
    },
    deleteHistoryRecord(id: string) {
      return historyRepository.deleteRecord(id)
    },
    async clearHistory() {
      await historyRepository.clearHistory()
      return []
    },
    async reanalyzeRecord(id: string) {
      const record = await historyRepository.getRecordById(id)

      if (!record) {
        throw new Error('기록을 찾을 수 없습니다.')
      }

      return analyzeAndPersist({
        ...record.input,
        createdAt: new Date().toISOString(),
      })
    },
  }
}
