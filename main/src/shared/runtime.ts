import type { RuntimeMessage, RuntimeResponse } from '@/shared/types'

export async function sendRuntimeMessage<T = unknown>(
  message: RuntimeMessage,
): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as RuntimeResponse<T>

  if (!response?.ok) {
    throw new Error(response?.error ?? '알 수 없는 오류가 발생했습니다.')
  }

  return response.data as T
}
