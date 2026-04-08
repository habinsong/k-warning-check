export function findEvidenceSentence(sentences: string[], matchedText: string) {
  const normalizedMatched = matchedText.trim().toLowerCase()

  return (
    sentences.find((sentence) => sentence.toLowerCase().includes(normalizedMatched)) ??
    sentences[0] ??
    matchedText
  )
}
