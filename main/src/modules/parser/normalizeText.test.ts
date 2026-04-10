import { describe, expect, it } from 'vitest'
import { normalizeText } from '@/modules/parser/normalizeText'

describe('normalizeText', () => {
  it('공백과 OCR 오인식을 정리한다', () => {
    const result = normalizeText('  o픈채팅  으로  문의\n\n본인인증 필요  ')
    expect(result).toContain('오픈채팅')
    expect(result).toContain('본인 인증')
  })
})
