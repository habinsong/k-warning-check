import type { RuntimeMessage, RuntimeResponse } from '@/shared/types'

export async function extractTextFromImage(imageDataUrl: string) {
  const response = (await chrome.runtime.sendMessage({
    type: 'run-ocr',
    imageDataUrl,
  } satisfies RuntimeMessage)) as RuntimeResponse<string>

  if (!response.ok || !response.data?.trim()) {
    throw new Error(response.error ?? '이미지에서 텍스트를 추출하지 못했습니다.')
  }

  return response.data.trim()
}
