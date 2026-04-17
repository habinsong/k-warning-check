import { describe, expect, it } from 'vitest'
import { AI_HOOKING_CHECKLIST_DEFINITIONS } from '@/data/aiHookingChecklist'
import { analyzeText } from '@/modules/analyzer/analyzeText'

describe('analyzeText', () => {
  it('AI 저품질 후킹글 내부 체크리스트 107개를 유지한다', () => {
    expect(AI_HOOKING_CHECKLIST_DEFINITIONS).toHaveLength(107)

    const categoryCounts = AI_HOOKING_CHECKLIST_DEFINITIONS.reduce<Record<string, number>>(
      (counts, definition) => ({
        ...counts,
        [definition.category]: (counts[definition.category] ?? 0) + 1,
      }),
      {},
    )

    expect(Object.values(categoryCounts)).toEqual([10, 11, 11, 10, 11, 13, 10, 10, 11, 10])
  })

  it('외부 메신저 + 선입금 + 수익 보장을 위험 이상으로 판정한다', () => {
    const result = analyzeText(
      '텔레그램으로 문의 주세요. 선입금 후 진행되며 원금 보장 수익 보장 가능합니다.',
    )

    expect(['위험', '매우 위험', '경고']).toContain(result.grade)
    expect(result.primaryType).toBe('투자/코인/리딩방')
  })

  it('기관 사칭 + 링크 + 인증 유도를 경고로 판정한다', () => {
    const result = analyzeText(
      '금감원 안내입니다. bit.ly/test 링크에서 본인 인증 후 계정 복구를 진행하세요.',
    )

    expect(result.grade).toBe('경고')
    expect(result.primaryType).toBe('피싱/기관 사칭')
  })

  it('정상 안내 문구는 감점이 적용된다', () => {
    const result = analyzeText('주문이 정상적으로 접수되었습니다. 보안 주의 안내를 확인하세요.')
    expect(result.score).toBeLessThan(30)
  })

  it('대환대출 선상환 요구를 위험 이상으로 판정한다', () => {
    const result = analyzeText(
      '정부지원 대환대출이 가능합니다. 기존 대출을 먼저 상환하시면 저금리로 전환해드립니다.',
    )

    expect(['위험', '매우 위험', '경고']).toContain(result.grade)
    expect(result.matchedBaselines.some((baseline) => baseline.id === 'police-loan-repay-first')).toBe(
      true,
    )
  })

  it('AI 딸깍형 저품질 후킹글을 감지한다', () => {
    const result = analyzeText(
      '개발자 없이 1인 창업할 때 딱 이 4개 조합이면 끝납니다. Claude 3.5 Sonnet 원탑이고 0원 듭니다. 30초 뒤 결과물 보면 진짜 헛웃음 납니다. 예전 같으면 외주 개발자한테 200만 원 줬어야 합니다.',
    )

    expect(['주의', '위험', '매우 위험', '경고']).toContain(result.grade)
    expect(result.primaryType).toBe('AI 저품질 후킹글')
    expect(result.aiHookingChecklist.normalizedScore).toBeGreaterThanOrEqual(25)
    expect(new Set(result.aiHookingChecklist.topFindings.map((finding) => finding.userLabel)).size).toBe(
      result.aiHookingChecklist.topFindings.length,
    )
    expect(result.aiHookingChecklist.tags).toContain('구식 정보 재탕')
    expect(result.aiHookingChecklist.tags).toContain('비용/성과 과장')
    expect(result.dimensionScores.aiSmell).toBeGreaterThanOrEqual(55)
    expect(result.dimensionScores.virality).toBeGreaterThanOrEqual(38)
    expect(result.dimensionScores.factualityRisk).toBeGreaterThanOrEqual(55)
    expect(result.dimensionScores.hookingStyle).toBeGreaterThanOrEqual(52)
    expect(result.matchedBaselines.some((baseline) => baseline.id === 'ai-outdated-model-hype')).toBe(
      true,
    )
  })

  it('로컬 LLM 성능 과장과 하드웨어 바이럴 문맥을 감지한다', () => {
    const result = analyzeText(
      'Mac Mini 하나면 AI를 로컬에서 돌릴 수 있다. Google Gemma 4 26B + Ollama 조합. 설치부터 API 연동까지 10분이면 끝남. 4B급 속도로 26B급 성능이 나옴. 내 Mac이 AI 서버가 되는 시대.',
    )

    expect(['위험', '매우 위험', '경고']).toContain(result.grade)
    expect(result.primaryType).toBe('AI 바이럴/기기 바이럴')
    expect(result.signals).not.toContain('구형 AI 모델명을 현역 추천처럼 제시')
    expect(result.aiHookingChecklist.topFindings.some((finding) => finding.userLabel === '특정 제품만 과하게 띄움')).toBe(
      true,
    )
    expect(result.dimensionScores.comparisonRisk).toBeGreaterThanOrEqual(60)
    expect(result.matchedBaselines.some((baseline) => baseline.id === 'ai-local-llm-viral-overclaim')).toBe(
      true,
    )
  })

  it('AI 바이럴 반박 문맥은 과잉 경고하지 않는다', () => {
    const result = analyzeText(
      '병렬 AI AGENT로 FULL AUTOMATION 된다고 홍보하더니 코드 품질 개판이었다. 결국 그냥 돌아만 가는 코드였고, 이게 바이브 코딩의 허와 실이다.',
    )

    expect(result.score).toBeLessThan(30)
  })

  it('AI 권위팔이 반박글도 내부 사례 일반화는 주의로 잡는다', () => {
    const result = analyzeText(
      '엔트로픽에서 우리 직원들은 수개월전부터 코드 1도 안 짜요. 병렬 AI AGENT로 FULL AUTOMATION 돌립니다. 하네스 모르면 트렌드에 뒤떨어지는 개발자예요. 그런데 50만 라인 코드가 유실됐다는 말도 있어 사실 확인이 필요합니다.',
    )

    expect(['주의', '위험', '매우 위험']).toContain(result.grade)
    expect(result.primaryType).toBe('권위팔이 AI 담론')
    expect(result.aiHookingChecklist.tags).toContain('권위팔이')
    expect(result.dimensionScores.authorityAppeal).toBeGreaterThanOrEqual(60)
    expect(result.dimensionScores.factualityRisk).toBeGreaterThanOrEqual(42)
    expect(result.matchedBaselines.some((baseline) => baseline.id === 'ai-authority-trend-claim')).toBe(
      true,
    )
  })

  it('이모티콘 남발과 설명식 말투를 AI 저품질 문체로 감지한다', () => {
    const result = analyzeText(
      '✨✨ 핵심은 이겁니다. 쉽게 말하면 이 조합이면 끝입니다. 정리하면 누구나 가능하고 바로 시작하면 됩니다 🚀✅',
    )

    expect(['주의', '위험', '매우 위험', '경고']).toContain(result.grade)
    expect(result.primaryType).toBe('AI 저품질 후킹글')
    expect(result.dimensionScores.aiSmell).toBeGreaterThanOrEqual(40)
    expect(result.aiHookingChecklist.categoryScores['AI 특유 저품질 문체']).toBeGreaterThan(0)
    expect(result.aiHookingChecklist.tags).toContain('AI 냄새 강함')
  })

  it('맥·Apple Silicon·설명식 개인 서사형 AI 바이럴 글을 감지한다', () => {
    const result = analyzeText(
      'AI 개발하려면 시간당 수만 원씩 하는 엔비디아 H100 GPU부터 빌려야 한다? 솔직히 저 같은 1인 개발자한텐 시작도 전에 서버비부터 숨이 턱 막히거든요. 💸 근데 이제 비싼 클라우드 서버 없이, 책상 위 맥 하나로 대규모 멀티모달 모델을 직접 깎아보는 시대가 터졌습니다. 진짜 놀라운 건 이 다음이에요. 최근 해커뉴스에서 난리 난 프로젝트를 보면서 제 눈을 의심했는데요. 그것도 비싼 CUDA 환경이 아니라, 제 맥북 같은 Apple Silicon 환경에서요! 🤯 이 엄청난 변화의 흐름을 딱 3가지로 요약해 볼게요. 결국 이 모든 게 가리키는 건 하나입니다. 거대 자본이 독점하던 기술이 개인의 무기로 내려오고 있다는 거예요. 생각만 해도 너무 짜릿하지 않나요? 😉 관심 생기신 분들은 아래 원문 링크들 꼭 한 번 읽어보세요! 진짜 인사이트가 쏟아집니다. 👇',
    )

    expect(['주의', '위험', '매우 위험', '경고']).toContain(result.grade)
    expect(['AI 저품질 후킹글', 'AI 바이럴/기기 바이럴']).toContain(result.primaryType)
    expect(result.dimensionScores.aiSmell).toBeGreaterThanOrEqual(60)
    expect(result.dimensionScores.virality).toBeGreaterThanOrEqual(60)
    expect(result.aiHookingChecklist.tags).toContain('AI 냄새 강함')
    expect(result.aiHookingChecklist.tags).toContain('기기 바이럴 가능성')
    expect(result.dimensionScores.hookingStyle).toBeGreaterThanOrEqual(52)
  })

  it('최신 모델 최강 표현만으로 구식 정보 재탕으로 오탐하지 않는다', () => {
    const result = analyzeText(
      "'Mythos'의 정체: 현존 최강의 성능. Mythos Preview는 이전의 플래그십이었던 Claude Opus 4.6을 모든 벤치마크에서 압도합니다. 특히 에이전트 능력에서 비약적인 발전을 이루었습니다.",
    )

    expect(result.aiHookingChecklist.tags).not.toContain('구식 정보 재탕')
    expect(
      result.aiHookingChecklist.topFindings.some(
        (finding) => finding.userLabel === '구식 정보 재탕 가능성',
      ),
    ).toBe(false)
  })

  it('정부지원금 선정 대행과 성공보수를 사기성 축에 강하게 반영한다', () => {
    const result = analyzeText(
      '예비창업패키지 선정 대행 가능합니다. 전담기관 평가위원 출신이 사업계획서 대필과 발표평가 코칭까지 해드립니다. 착수금 300만원, 최종 선정 시 성공보수 별도입니다.',
    )

    expect(['위험', '매우 위험', '경고']).toContain(result.grade)
    expect(result.dimensionScores.scam).toBeGreaterThanOrEqual(70)
    expect(result.signals).toContain('정부지원금·창업지원 선정 대행/브로커성 표현')
    expect(result.signals).toContain('지원사업·창업 컨설팅 수수료 또는 성공보수 요구')
    expect(result.matchedBaselines.some((baseline) => baseline.id === 'kstartup-brokered-support-sales')).toBe(
      true,
    )
  })

  it('강의형 창업 후킹과 외부 문의 유도를 사기성에 반영한다', () => {
    const result = analyzeText(
      '정부지원금 특강 오늘만 모집합니다. 창업지원금 합격 전략 설명회 참석 후 오픈채팅으로 상담 신청 주세요.',
    )

    expect(['주의', '위험', '매우 위험', '경고']).toContain(result.grade)
    expect(result.dimensionScores.scam).toBeGreaterThanOrEqual(35)
    expect(result.signals).toContain('강의·강연·설명회형 고수익/창업 후킹')
  })

  it('영문 기관 사칭 + 링크 + OTP 요구를 고위험으로 판정한다', () => {
    const result = analyzeText(
      'Official bank security notice. Verify your account immediately at bit.ly/reset and enter the OTP code to unlock your account.',
    )

    expect(result.detectedLanguage).toBe('en')
    expect(['위험', '매우 위험', '경고']).toContain(result.grade)
    expect(result.primaryType).toBe('피싱/기관 사칭')
    expect(result.signals).toContain('기관 또는 플랫폼 사칭 가능성')
    expect(result.signals).toContain('로그인 또는 인증 정보 요구')
  })

  it('영문 AI 기기 바이럴과 구식 모델 후킹을 감지한다', () => {
    const result = analyzeText(
      'Mac Mini alone can run your AI stack. Claude 3.5 Sonnet is still the best model, you can set everything up in 10 minutes, and your Mac becomes an AI server without expensive cloud costs.',
    )

    expect(result.detectedLanguage).toBe('en')
    expect(['주의', '위험', '매우 위험', '경고']).toContain(result.grade)
    expect(['AI 저품질 후킹글', 'AI 바이럴/기기 바이럴', '구식 모델/최신성 부족']).toContain(
      result.primaryType,
    )
    expect(result.aiHookingChecklist.tags).toContain('기기 바이럴 가능성')
    expect(
      result.aiHookingChecklist.tags.includes('구식 정보 재탕') ||
        result.aiHookingChecklist.tags.includes('모델 정보 최신성 낮음'),
    ).toBe(true)
  })

  it('영문 권위팔이와 내부 사례 일반화를 감지한다', () => {
    const result = analyzeText(
      'Every serious team already uses this. If you do not know this, you are behind. Our team stopped writing code months ago and insiders at big labs already moved on.',
    )

    expect(result.detectedLanguage).toBe('en')
    expect(['주의', '위험', '매우 위험']).toContain(result.grade)
    expect(result.primaryType).toBe('권위팔이 AI 담론')
    expect(result.aiHookingChecklist.tags).toContain('권위팔이')
  })

  it('혼합 입력에서는 한국어와 영어 규칙을 함께 적용한다', () => {
    const result = analyzeText(
      '요즘은 다 이렇게 합니다. 이 문장은 한국어 길이를 충분히 늘려 둡니다. Mac Mini alone can run your AI stack, and if you do not know this, you are behind.',
    )

    expect(result.detectedLanguage).toBe('mixed')
    expect(result.aiHookingChecklist.tags).toContain('권위팔이')
    expect(result.aiHookingChecklist.tags).toContain('기기 바이럴 가능성')
  })
})
