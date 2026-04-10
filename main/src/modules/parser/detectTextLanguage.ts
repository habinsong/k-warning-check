import type { DetectedLanguage } from '@/shared/types'

const HANGUL_PATTERN = /[\u3131-\u318e\uac00-\ud7a3]/gu
const LATIN_LETTER_PATTERN = /[A-Za-z]/gu
const LATIN_WORD_PATTERN = /\b[A-Za-z]{2,}\b/gu

export function detectTextLanguage(text: string): DetectedLanguage {
  const normalized = String(text ?? '').trim()

  if (!normalized) {
    return 'ko'
  }

  const hangulCount = normalized.match(HANGUL_PATTERN)?.length ?? 0
  const latinLetterCount = normalized.match(LATIN_LETTER_PATTERN)?.length ?? 0
  const latinWordCount = normalized.match(LATIN_WORD_PATTERN)?.length ?? 0

  if (hangulCount >= 10 && hangulCount >= latinLetterCount) {
    return 'ko'
  }

  if (latinWordCount >= 5 && hangulCount < 10) {
    return 'en'
  }

  return 'mixed'
}
