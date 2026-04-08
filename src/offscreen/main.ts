import { createWorker } from 'tesseract.js'
import type { RuntimeMessage, RuntimeResponse } from '@/shared/types'

let ocrWorkerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('kor+eng', 1, {
      logger: () => {},
      errorHandler: (error) => console.error('KWC OCR worker error:', error),
      workerBlobURL: false,
      workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
      corePath: chrome.runtime.getURL('tesseract'),
      langPath: chrome.runtime.getURL('tesseract/lang'),
      cacheMethod: 'none',
    })
  }

  return ocrWorkerPromise
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _, sendResponse) => {
  if (message.type === 'read-clipboard') {
    void (async () => {
      try {
        const text = await navigator.clipboard.readText()
        sendResponse({
          ok: true,
          data: text,
        } satisfies RuntimeResponse<string>)
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : '클립보드 읽기에 실패했습니다.',
        } satisfies RuntimeResponse)
      }
    })()

    return true
  }

  if (message.type === 'run-ocr') {
    void (async () => {
      try {
        const worker = await getOcrWorker()
        const result = await worker.recognize(message.imageDataUrl)
        sendResponse({
          ok: true,
          data: result.data.text.trim(),
        } satisfies RuntimeResponse<string>)
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'OCR 처리에 실패했습니다.',
        } satisfies RuntimeResponse)
      }
    })()

    return true
  }

  return undefined
})
