const OCR_CORRECTIONS: Array<[RegExp, string]> = [
  [/o픈채팅/giu, '오픈채팅'],
  [/테레그램/giu, '텔레그램'],
  [/원금보장/giu, '원금 보장'],
  [/본인인증/giu, '본인 인증'],
]

export function normalizeText(input: string) {
  let text = input
    .replace(/\u200b|\u200c|\u200d|\ufeff/gu, ' ')
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()

  for (const [pattern, replacement] of OCR_CORRECTIONS) {
    text = text.replace(pattern, replacement)
  }

  return text
}

export function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?]|다\.|요\.)\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}
