import { useState } from 'react'
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Languages,
  Link2,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { LocaleToggle } from '@/shared/LocaleToggle'
import type { ProviderState, RuntimeCapabilities, UiLocale } from '@/shared/types'

interface OnboardingFlowProps {
  locale: UiLocale
  providerState: ProviderState
  runtimeCapabilities: RuntimeCapabilities
  geminiApiKeyDraft: string
  groqApiKeyDraft: string
  statusMessage?: string
  codexStatus?: string
  screenPermissionSupported?: boolean
  screenPermissionGranted?: boolean
  onLocaleChange: (locale: UiLocale) => void
  onGeminiApiKeyChange: (value: string) => void
  onGroqApiKeyChange: (value: string) => void
  onSaveGemini: () => Promise<void> | void
  onSaveGroq: () => Promise<void> | void
  onRequestScreenPermission?: () => Promise<void> | void
  onStartCodexLogin: () => Promise<void> | void
  onStartCodexBridge: () => Promise<void> | void
  onRefreshCodexStatus?: () => Promise<void> | void
  onComplete: () => Promise<void> | void
}

function onboardingCopy(locale: UiLocale, supportsCodex: boolean) {
  if (locale === 'en') {
    return {
      badge: 'K-WarningCheck',
      heroes: [
        {
          title: 'If it looks convincing, doubt it first.',
          body: 'K-WarningCheck checks suspicious text, links, screenshots, and AI-heavy hype language across Chrome, Windows, and macOS.',
        },
        {
          title: 'Read the warnings in the language you know best.',
          body: 'Choose Korean or English for the interface and result rendering. Input analysis still auto-detects Korean, English, or mixed text.',
        },
        {
          title: 'The more polished it sounds, the more critically it should be read.',
          body: supportsCodex
            ? 'Your selected AI provider helps K-WarningCheck critique hype, AI slop, outdated claims, and suspiciously polished wording. This step is optional and can be changed later.'
            : 'Optional Gemini or Groq providers help K-WarningCheck critique hype, AI slop, outdated claims, and suspiciously polished wording. This step is optional and can be changed later.',
        },
      ],
      languageTitle: 'Choose your language',
      languageBody:
        'This controls the app interface and result rendering. Input analysis still auto-detects Korean, English, or mixed text.',
      settingsTitle: 'Connect providers',
      settingsBody:
        supportsCodex
          ? 'Connect optional providers for deeper critique, freshness checks, and Codex-assisted refinement. You can skip all of them and start right away.'
          : 'Connect optional providers for deeper critique and freshness checks. You can skip all of them and start right away.',
      back: 'Back',
      next: 'Next',
      start: 'Start',
      korean: 'Korean',
      english: 'English',
      geminiLabel: 'Gemini API key',
      groqLabel: 'Groq API key',
      saveKey: 'Save key',
      screenPermissionTitle: 'Screen capture permission',
      screenPermissionBody:
        'Allow macOS screen recording during setup so screen-area analysis works immediately when you need it.',
      screenPermissionGranted: 'Allowed',
      screenPermissionAction: 'Allow now',
      codexTitle: 'Codex connection',
      codexLogin: 'Codex OAuth login',
      codexBridge: 'Start connection',
      codexStatus: 'Current status',
      refresh: 'Refresh',
      savedSecret: 'Saved in OS secure storage',
      starting: 'Starting...',
      unknown: 'Unknown',
      demoLabel: 'Demo analysis',
      demoSignalScore: 'Signal Score',
      demoCards: [
        {
          icon: ShieldAlert,
          iconTone: 'text-[#bb3c2e]',
          score: 86,
          grade: 'High risk',
          title: 'Impersonation + account reset',
          summary: 'Urgency language, a masked domain, and a forced verification step all stack risk upward.',
          tags: ['Phishing', 'Masked URL', 'Urgency'],
          scoreTone: 'text-[#bb3c2e]',
          badgeClass: 'border-[#f2c7c1] bg-[#fff4f1] text-[#bb3c2e]',
        },
        {
          icon: Bot,
          iconTone: 'text-[#5f56d8]',
          score: 72,
          grade: 'Hooking copy',
          title: 'AI-heavy certainty without proof',
          summary: 'The sentence is polished, but the evidence density is low and the promise is too absolute.',
          tags: ['AI slop', 'Authority push', 'Low evidence'],
          scoreTone: 'text-[#5f56d8]',
          badgeClass: 'border-[#d8d4ff] bg-[#f3f1ff] text-[#5f56d8]',
        },
        {
          icon: Link2,
          iconTone: 'text-[#0f766e]',
          score: 64,
          grade: 'Needs review',
          title: 'Short-link landing page',
          summary: 'The link hides the destination and leans on scarcity phrasing before showing any verifiable details.',
          tags: ['Short link', 'Scarcity', 'Trust check'],
          scoreTone: 'text-[#0f766e]',
          badgeClass: 'border-[#b7e5de] bg-[#eefcf9] text-[#0f766e]',
        },
      ],
    }
  }

  return {
    badge: 'K-WarningCheck',
    heroes: [
      {
        title: '그럴듯할수록, 먼저 의심하세요.',
        body: 'K-WarningCheck는 크롬, 윈도우, macOS에서 수상한 문구, 링크, 스크린샷, AI 과장 문체를 함께 분석합니다.',
      },
      {
        title: '익숙한 언어로, 더 선명하게 확인하세요.',
        body: '워닝 점수, 체크리스트, 근거 문장을 한국어 또는 영어로 확인할 수 있습니다. 실제 분석은 한국어, 영어, 혼합 입력을 자동 감지합니다.',
      },
      {
        title: '그럴듯한 문구일수록, 더 비판적으로 보십시오.',
        body: supportsCodex
          ? '선택한 AI 제공자는 과장된 주장, AI 슬롭, 구식 정보, 수상한 후킹 문체를 더 날카롭게 분석하는 데 사용됩니다. 연결은 선택 사항이며, 나중에 다시 설정할 수 있습니다.'
          : '선택한 Gemini 또는 Groq 제공자는 과장된 주장, AI 슬롭, 구식 정보, 수상한 후킹 문체를 더 날카롭게 분석하는 데 사용됩니다. 연결은 선택 사항이며, 나중에 다시 설정할 수 있습니다.',
      },
    ],
    languageTitle: '언어를 선택하세요',
    languageBody:
      '이 설정은 앱 UI와 결과 렌더링에 적용됩니다. 실제 분석은 한국어, 영어, 혼합 입력을 자동 감지합니다.',
    settingsTitle: '제공자를 연결하세요',
    settingsBody:
      supportsCodex
        ? '웹 최신성 검증, Codex 보조 설명 품질을 높여 줍니다. 아무것도 연결하지 않고 바로 시작해도 됩니다.'
        : '웹 최신성 검증과 설명 품질을 높여 줍니다. 아무것도 연결하지 않고 바로 시작해도 됩니다.',
    back: '뒤로',
    next: '다음',
    start: '시작',
    korean: '한국어',
    english: '영어',
    geminiLabel: 'Gemini API 키',
    groqLabel: 'Groq API 키',
    saveKey: '키 저장',
    screenPermissionTitle: '화면 캡처 권한',
    screenPermissionBody:
      '화면 영역 분석을 바로 쓰려면 셋업 중에 macOS 화면 및 시스템 오디오 녹화 권한을 허용하세요.',
    screenPermissionGranted: '허용됨',
    screenPermissionAction: '지금 허용',
    codexTitle: 'Codex 연결',
    codexLogin: 'Codex OAuth 로그인',
    codexBridge: '연결 시작',
    codexStatus: '현재 상태',
    refresh: '상태 확인',
    savedSecret: 'OS 보안 저장소에 저장됨',
    starting: '시작 중...',
    unknown: '미확인',
    demoLabel: '데모 분석',
    demoSignalScore: '시그널 스코어',
    demoCards: [
      {
        icon: ShieldAlert,
        iconTone: 'text-[#bb3c2e]',
        score: 86,
        grade: '고위험',
        title: '기관 사칭 + 계정 재인증',
        summary: '긴급성 문구, 마스킹된 도메인, 강제 인증 흐름이 함께 겹쳐 위험도를 끌어올립니다.',
        tags: ['피싱', '마스킹 URL', '긴급 압박'],
        scoreTone: 'text-[#bb3c2e]',
        badgeClass: 'border-[#f2c7c1] bg-[#fff4f1] text-[#bb3c2e]',
      },
      {
        icon: Bot,
        iconTone: 'text-[#5f56d8]',
        score: 72,
        grade: '후킹 문체',
        title: '근거 없는 AI 확신형 문구',
        summary: '말투는 매끈하지만 근거 밀도는 낮고, 결과 약속은 지나치게 절대적입니다.',
        tags: ['AI 슬롭', '권위 압박', '근거 부족'],
        scoreTone: 'text-[#5f56d8]',
        badgeClass: 'border-[#d8d4ff] bg-[#f3f1ff] text-[#5f56d8]',
      },
      {
        icon: Link2,
        iconTone: 'text-[#0f766e]',
        score: 64,
        grade: '추가 확인',
        title: '단축 링크 랜딩 페이지',
        summary: '실제 목적지를 숨긴 링크가 검증 가능한 정보보다 희소성 문구를 먼저 밀어붙입니다.',
        tags: ['단축 링크', '희소성', '신뢰 확인'],
        scoreTone: 'text-[#0f766e]',
        badgeClass: 'border-[#b7e5de] bg-[#eefcf9] text-[#0f766e]',
      },
    ],
  }
}

export function OnboardingFlow({
  locale,
  providerState,
  runtimeCapabilities,
  geminiApiKeyDraft,
  groqApiKeyDraft,
  statusMessage,
  codexStatus,
  screenPermissionSupported = false,
  screenPermissionGranted = false,
  onLocaleChange,
  onGeminiApiKeyChange,
  onGroqApiKeyChange,
  onSaveGemini,
  onSaveGroq,
  onRequestScreenPermission,
  onStartCodexLogin,
  onStartCodexBridge,
  onRefreshCodexStatus,
  onComplete,
}: OnboardingFlowProps) {
  const [step, setStep] = useState(0)
  const [starting, setStarting] = useState(false)
  const copy = onboardingCopy(locale, runtimeCapabilities.supportsCodex)
  const hero = copy.heroes[step]

  const heroPills = [
    {
      icon: ShieldCheck,
      label: locale === 'en' ? 'Phishing + scam' : '피싱 + 사기',
    },
    {
      icon: Languages,
      label: locale === 'en' ? 'KO / EN UI' : '한영 UI',
    },
    {
      icon: KeyRound,
      label: locale === 'en' ? 'Optional AI providers' : '선택형 AI 제공자',
    },
  ]

  async function handleComplete() {
    setStarting(true)
    try {
      await onComplete()
    } finally {
      setStarting(false)
    }
  }

  const progressHeader = (
    <div className="mb-6 flex items-center justify-between gap-3">
      <div className="text-sm font-medium text-slate-500">
        {locale === 'en' ? `Step ${step + 1} of 3` : `${step + 1} / 3 단계`}
      </div>
      <LocaleToggle locale={locale} onChange={onLocaleChange} />
    </div>
  )

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(109,120,214,0.18),_transparent_40%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_30px_90px_rgba(37,48,97,0.12)]">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
            <div className="flex min-h-[800px] flex-col justify-center bg-[linear-gradient(140deg,#1f2952_0%,#33418c_65%,#5f73d7_100%)] px-8 py-10 text-white">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffd79b]">
                  {copy.badge}
                </div>
                <h1 className="mt-4 text-4xl font-semibold leading-tight">{hero.title}</h1>
                <p className="mt-4 max-w-xl text-sm leading-7 text-[#d9e1ff]">{hero.body}</p>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {heroPills.map(({ icon: Icon, label }) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/12 bg-white/10 px-4 py-4 text-sm font-medium text-[#edf2ff]"
                    >
                      <Icon className="h-5 w-5 text-[#ffd79b]" />
                      <div className="mt-3">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex min-h-[800px] flex-col px-6 py-6 sm:px-8 sm:py-8">
              {progressHeader}

              {step === 0 ? (
                <div className="flex flex-1 flex-col">
                  <div className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-[420px] space-y-4">
                      {copy.demoCards.map(({ icon: Icon, iconTone, score, grade, title, summary, tags, scoreTone, badgeClass }) => (
                        <article
                          key={`${title}-${locale}`}
                          className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 ${iconTone}`}>
                                <Icon className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  {copy.demoLabel}
                                </div>
                                <div className="mt-1 text-sm font-semibold text-slate-900">{title}</div>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                {copy.demoSignalScore}
                              </div>
                              <div className={`mt-1 text-3xl font-semibold ${scoreTone}`}>{score}</div>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
                              <TriangleAlert className="mr-1.5 h-3.5 w-3.5" />
                              {grade}
                            </span>
                          </div>

                          <p className="mt-4 text-sm leading-6 text-slate-600">{summary}</p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                  <div className="mt-auto flex justify-center pt-6">
                    <button
                      aria-label={copy.next}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm"
                      onClick={() => setStep(1)}
                      type="button"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="flex flex-1 flex-col">
                  <div className="flex flex-1 flex-col justify-center">
                    <div>
                      <h2 className="text-2xl font-semibold">{copy.languageTitle}</h2>
                      <p className="mt-3 text-sm leading-7 text-slate-600">{copy.languageBody}</p>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      {([
                        ['ko', copy.korean],
                        ['en', copy.english],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={`rounded-3xl border px-5 py-5 text-left transition-colors ${locale === value
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-700'
                            }`}
                          onClick={() => onLocaleChange(value)}
                        >
                          <div className="text-lg font-semibold">{label}</div>
                          <div className="mt-2 text-sm opacity-80">
                            {value === 'ko'
                              ? locale === 'en'
                                ? 'Show the app and the results in Korean.'
                                : '앱과 결과를 한국어로 표시합니다.'
                              : locale === 'en'
                                ? 'Show the app and the results in English.'
                                : '앱과 결과를 영어로 표시합니다.'}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-auto flex justify-center gap-3 pt-6">
                    <button
                      aria-label={copy.back}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
                      onClick={() => setStep(0)}
                      type="button"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      aria-label={copy.next}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm"
                      onClick={() => setStep(2)}
                      type="button"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="flex flex-1 flex-col">
                  <div className="flex flex-1 flex-col justify-center">
                    <div>
                      <h2 className="text-2xl font-semibold">{copy.settingsTitle}</h2>
                      <p className="mt-3 text-sm leading-7 text-slate-600">{copy.settingsBody}</p>
                    </div>

                    <div className="mt-6 grid gap-4">
                      <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-semibold text-slate-900">Gemini</div>
                        <input
                          type="password"
                          value={geminiApiKeyDraft}
                          onChange={(event) => onGeminiApiKeyChange(event.target.value)}
                          placeholder={
                            providerState.gemini.hasSecret ? copy.savedSecret : copy.geminiLabel
                          }
                          className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                        />
                        <button
                          className="mt-3 inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                          onClick={() => void onSaveGemini()}
                          type="button"
                        >
                          {copy.saveKey}
                        </button>
                      </section>

                      <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-semibold text-slate-900">Groq</div>
                        <input
                          type="password"
                          value={groqApiKeyDraft}
                          onChange={(event) => onGroqApiKeyChange(event.target.value)}
                          placeholder={
                            providerState.groq.hasSecret ? copy.savedSecret : copy.groqLabel
                          }
                          className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                        />
                        <button
                          className="mt-3 inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                          onClick={() => void onSaveGroq()}
                          type="button"
                        >
                          {copy.saveKey}
                        </button>
                      </section>

                      {screenPermissionSupported ? (
                        <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm font-semibold text-slate-900">
                            {copy.screenPermissionTitle}
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-600">
                            {copy.screenPermissionBody}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              className="inline-flex rounded-2xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                              disabled={screenPermissionGranted}
                              onClick={() => void onRequestScreenPermission?.()}
                              type="button"
                            >
                              {screenPermissionGranted ? copy.screenPermissionGranted : copy.screenPermissionAction}
                            </button>
                          </div>
                        </section>
                      ) : null}

                      {runtimeCapabilities.supportsCodex ? (
                        <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {copy.codexTitle}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {copy.codexStatus}: {codexStatus || copy.unknown}
                              </div>
                            </div>

                            {onRefreshCodexStatus ? (
                              <button
                                className="inline-flex rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                                onClick={() => void onRefreshCodexStatus()}
                                type="button"
                              >
                                {copy.refresh}
                              </button>
                            ) : null}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                              onClick={() => void onStartCodexBridge()}
                              type="button"
                            >
                              {copy.codexBridge}
                            </button>
                            <button
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                              onClick={() => void onStartCodexLogin()}
                              type="button"
                            >
                              <ExternalLink className="h-4 w-4" />
                              {copy.codexLogin}
                            </button>
                          </div>
                        </section>
                      ) : null}
                    </div>

                    {statusMessage ? (
                      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        {statusMessage}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-auto flex justify-center gap-3 pt-6">
                    <button
                      aria-label={copy.back}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm"
                      onClick={() => setStep(1)}
                      type="button"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#f2a14a] px-5 py-3 text-sm font-semibold text-[#253061] disabled:cursor-not-allowed disabled:bg-slate-200"
                      disabled={starting}
                      onClick={() => void handleComplete()}
                      type="button"
                    >
                      {starting ? copy.starting : copy.start}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
