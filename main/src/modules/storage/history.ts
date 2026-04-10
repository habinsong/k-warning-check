import { HISTORY_LIMIT, STORAGE_KEYS } from '@/shared/constants'
import type { StoredAnalysisRecord } from '@/shared/types'

export async function getHistory() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.history,
    STORAGE_KEYS.latestRecord,
  ])

  return {
    history: (stored[STORAGE_KEYS.history] as StoredAnalysisRecord[] | undefined) ?? [],
    latestRecord:
      (stored[STORAGE_KEYS.latestRecord] as StoredAnalysisRecord | undefined) ?? undefined,
  }
}

export async function saveRecord(record: StoredAnalysisRecord) {
  const { history } = await getHistory()
  const nextHistory = [record, ...history].slice(0, HISTORY_LIMIT)

  await chrome.storage.local.set({
    [STORAGE_KEYS.history]: nextHistory,
    [STORAGE_KEYS.latestRecord]: record,
  })

  return nextHistory
}

export async function deleteRecord(id: string) {
  const { history, latestRecord } = await getHistory()
  const nextHistory = history.filter((record) => record.id !== id)

  await chrome.storage.local.set({
    [STORAGE_KEYS.history]: nextHistory,
    [STORAGE_KEYS.latestRecord]:
      latestRecord?.id === id ? nextHistory[0] ?? null : latestRecord ?? null,
  })

  return nextHistory
}

export async function clearHistory() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.history]: [],
    [STORAGE_KEYS.latestRecord]: null,
  })
}

export async function getRecordById(id: string) {
  const { history } = await getHistory()
  return history.find((record) => record.id === id)
}
