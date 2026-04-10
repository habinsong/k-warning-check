import { describe, expect, it } from 'vitest'
import { detectTextLanguage } from '@/modules/parser/detectTextLanguage'

describe('detectTextLanguage', () => {
  it('한국어 입력을 ko로 감지한다', () => {
    expect(detectTextLanguage('이 문장은 한국어 경고 메시지와 사기성 표현을 설명하는 예시입니다.')).toBe('ko')
  })

  it('영어 입력을 en으로 감지한다', () => {
    expect(
      detectTextLanguage(
        'This message uses multiple English words and suspicious hook phrases for a language detection test.',
      ),
    ).toBe('en')
  })

  it('한국어와 영어가 섞인 입력을 mixed로 감지한다', () => {
    expect(
      detectTextLanguage(
        '이 글은 한국어 문장도 충분히 길게 들어 있고 Mac Mini alone can run your AI stack with hype.',
      ),
    ).toBe('mixed')
  })
})
