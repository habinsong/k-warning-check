import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { ArrowUp } from 'lucide-react'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { desktopAnalysisService } from '@/desktop/renderer/services'
import { translateAiTag, translateGrade } from '@/shared/localization'
import type { StoredAnalysisRecord, UiLocale } from '@/shared/types'

const LAUNCHER_SHOWN_EVENT = 'kwc:launcher-shown'

function resolveLauncherTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value.trim())
}

function scoreBarClass(score: number) {
  if (score >= 85) {
    return 'bg-[#d64c2f]'
  }

  if (score >= 65) {
    return 'bg-[#e1663f]'
  }

  if (score >= 45) {
    return 'bg-[#e89042]'
  }

  if (score >= 25) {
    return 'bg-[#e7c45f]'
  }

  return 'bg-[#62b69f]'
}

function gradeTextClass(grade: StoredAnalysisRecord['result']['grade']) {
  switch (grade) {
    case '경고':
      return 'text-[#ff8d84]'
    case '매우 위험':
      return 'text-[#ff9f8b]'
    case '위험':
      return 'text-[#ffc08c]'
    case '주의':
      return 'text-[#f8db8a]'
    case '낮음':
    default:
      return 'text-[#9fe6d4]'
  }
}

function compactTypeLabel(record: StoredAnalysisRecord, locale: UiLocale) {
  const type = record.result.primaryType

  if (type.includes('피싱') || type.includes('사칭')) {
    return locale === 'ko' ? '피싱' : 'Phish'
  }

  if (type.includes('투자') || type.includes('코인')) {
    return locale === 'ko' ? '투자' : 'Invest'
  }

  if (type.includes('환급') || type.includes('복구')) {
    return locale === 'ko' ? '환급' : 'Refund'
  }

  if (type.includes('부업') || type.includes('재택')) {
    return locale === 'ko' ? '부업' : 'Side Job'
  }

  if (type.includes('바이럴')) {
    return locale === 'ko' ? '바이럴' : 'Viral'
  }

  if (type.includes('권위')) {
    return locale === 'ko' ? '권위팔이' : 'Authority'
  }

  if (type.includes('구식') || type.includes('최신성')) {
    return locale === 'ko' ? '구식 정보' : 'Outdated'
  }

  if (type.includes('비교') || type.includes('왜곡')) {
    return locale === 'ko' ? '비교 왜곡' : 'Compare'
  }

  if (type.includes('중고거래') || type.includes('에스크로')) {
    return locale === 'ko' ? '거래 사칭' : 'Trade'
  }

  if (type.includes('AI')) {
    return locale === 'ko' ? 'AI 후킹' : 'AI Hook'
  }

  return locale === 'ko' ? '일반' : 'General'
}

export function LauncherApp() {
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(resolveLauncherTheme)
  const locale: UiLocale = 'ko'
  const [errorMessage, setErrorMessage] = useState('')
  const [latestRecord, setLatestRecord] = useState<StoredAnalysisRecord | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    startCursorX: number
    startCursorY: number
    startWindowX: number
    startWindowY: number
    lastCursorX: number
    lastCursorY: number
    frameRequested: boolean
  } | null>(null)

  function focusInput() {
    window.focus()
    const input = inputRef.current
    if (!input) {
      return
    }

    input.focus()
    const selectionEnd = input.value.length
    input.setSelectionRange(selectionEnd, selectionEnd)
  }

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(resolveLauncherTheme())
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    focusInput()

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.removeProperty('background')
      document.body.style.removeProperty('background')
      document.body.style.removeProperty('overflow')
    }
  }, [])

  useEffect(() => {
    function handleLauncherFocused() {
      focusInput()
    }

    let disposeLauncherShown: (() => void) | undefined

    window.addEventListener('focus', handleLauncherFocused)
    document.addEventListener('visibilitychange', handleLauncherFocused)
    void listen(LAUNCHER_SHOWN_EVENT, () => {
      requestAnimationFrame(() => focusInput())
    })
      .then((dispose) => {
        disposeLauncherShown = dispose
      })
      .catch(() => {
        // 런처 표시 이벤트를 수신하지 못해도 기본 포커스 로직으로 동작한다.
      })

    return () => {
      window.removeEventListener('focus', handleLauncherFocused)
      document.removeEventListener('visibilitychange', handleLauncherFocused)
      disposeLauncherShown?.()
    }
  }, [])

  useEffect(() => {
    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      void getCurrentWindow().hide()
    }

    document.addEventListener('keydown', handleWindowKeyDown, true)
    window.addEventListener('keydown', handleWindowKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleWindowKeyDown, true)
      window.removeEventListener('keydown', handleWindowKeyDown, true)
    }
  }, [])

  function queueDragUpdate() {
    const dragState = dragStateRef.current
    if (!dragState || dragState.frameRequested) {
      return
    }

    dragState.frameRequested = true
    requestAnimationFrame(() => {
      const nextDragState = dragStateRef.current
      if (!nextDragState) {
        return
      }

      nextDragState.frameRequested = false
      const nextX = Math.round(nextDragState.startWindowX + (nextDragState.lastCursorX - nextDragState.startCursorX))
      const nextY = Math.round(nextDragState.startWindowY + (nextDragState.lastCursorY - nextDragState.startCursorY))
      void getCurrentWindow().setPosition(new PhysicalPosition(nextX, nextY))
    })
  }

  async function handleDragPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return
    }

    focusInput()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)

    const currentPosition = await getCurrentWindow().outerPosition()
    dragStateRef.current = {
      pointerId: event.pointerId,
      startCursorX: event.screenX,
      startCursorY: event.screenY,
      startWindowX: currentPosition.x,
      startWindowY: currentPosition.y,
      lastCursorX: event.screenX,
      lastCursorY: event.screenY,
      frameRequested: false,
    }
  }

  function handleDragPointerMove(event: PointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    dragState.lastCursorX = event.screenX
    dragState.lastCursorY = event.screenY
    queueDragUpdate()
  }

  function handleDragPointerEnd(event: PointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null
    }
  }

  async function handleAnalyze() {
    const trimmedPrompt = prompt.trim()

    if (!trimmedPrompt) {
      setLatestRecord(null)
      setErrorMessage('분석할 문구나 URL을 입력하세요.')
      return
    }

    setSubmitting(true)
    setErrorMessage('')
    setLatestRecord(null)

    try {
      const record = looksLikeUrl(trimmedPrompt)
        ? await desktopAnalysisService.analyzeUrl(trimmedPrompt, { surface: 'launcher' })
        : await desktopAnalysisService.analyzeText(trimmedPrompt, { surface: 'launcher' })

      setLatestRecord(record)
    } catch (error) {
      setLatestRecord(null)
      setErrorMessage(error instanceof Error ? error.message : '분석에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      await getCurrentWindow().hide()
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      await handleAnalyze()
    }
  }

  const isDark = theme === 'dark'
  const shellStyle = {
    background: isDark ? 'rgba(18, 22, 32, 0.78)' : 'rgba(255, 255, 255, 0.76)',
    border: isDark ? '1px solid rgba(98, 110, 140, 0.22)' : '1px solid rgba(255, 255, 255, 0.68)',
    boxShadow: isDark
      ? '0 24px 72px rgba(0, 0, 0, 0.38)'
      : '0 22px 64px rgba(49, 63, 96, 0.12)',
    color: isDark ? '#eef2ff' : '#1f2940',
    backdropFilter: 'blur(28px) saturate(170%)',
    WebkitBackdropFilter: 'blur(28px) saturate(170%)',
  } satisfies CSSProperties

  const inputFrameStyle = {
    background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.5)',
    border: isDark ? '1px solid rgba(86, 98, 126, 0.34)' : '1px solid rgba(255, 255, 255, 0.68)',
    boxShadow: isDark
      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
      : 'inset 0 1px 0 rgba(255, 255, 255, 0.72)',
  } satisfies CSSProperties

  const inputSurfaceStyle = {
    background: isDark ? 'rgba(12, 16, 26, 0.92)' : 'rgba(246, 249, 255, 0.92)',
    border: isDark ? '1px solid rgba(64, 75, 101, 0.82)' : '1px solid rgba(220, 228, 242, 0.96)',
    color: isDark ? '#f3f6ff' : '#253061',
  } satisfies CSSProperties

  const panelStyle = {
    background: isDark ? 'rgba(34, 44, 61, 0.52)' : 'rgba(255, 255, 255, 0.4)',
    border: isDark ? '1px solid rgba(92, 104, 133, 0.24)' : '1px solid rgba(255, 255, 255, 0.58)',
  } satisfies CSSProperties

  const metricCardStyle = {
    background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.28)',
    border: isDark ? '1px solid rgba(111, 123, 152, 0.3)' : '1px solid rgba(255, 255, 255, 0.54)',
    boxShadow: isDark
      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.04)'
      : 'inset 0 1px 0 rgba(255, 255, 255, 0.66)',
  } satisfies CSSProperties

  const tagWrapStyle = {
    background: isDark ? 'rgba(13, 18, 29, 0.38)' : 'rgba(255, 255, 255, 0.34)',
    border: isDark ? '1px solid rgba(80, 93, 122, 0.28)' : '1px solid rgba(255, 255, 255, 0.54)',
  } satisfies CSSProperties

  const actionButtonStyle = {
    background: isDark ? 'rgba(236, 240, 250, 0.96)' : 'rgba(242, 244, 250, 0.92)',
    color: '#253061',
    boxShadow: isDark
      ? '0 16px 34px rgba(0, 0, 0, 0.3)'
      : '0 12px 28px rgba(37, 48, 97, 0.14)',
  } satisfies CSSProperties

  const hintColor = isDark ? '#b8c2dc' : '#66748b'
  const strongTextColor = isDark ? '#eef2ff' : '#253061'
  const visibleTags = latestRecord ? latestRecord.result.aiHookingChecklist.tags.slice(0, 2) : []
  const overflowTags = latestRecord ? Math.max(latestRecord.result.aiHookingChecklist.tags.length - visibleTags.length, 0) : 0

  function shouldStartDrag(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false
    }

    return !target.closest('textarea, input, button, select, [role="button"], a')
  }

  return (
    <main className="flex h-screen w-screen items-end justify-center overflow-hidden bg-transparent px-4 pb-4 pt-4">
      <section
        className="relative flex h-[436px] w-full max-w-[820px] cursor-grab flex-col gap-3 overflow-hidden rounded-[32px] px-4 py-4 active:cursor-grabbing"
        style={shellStyle}
        onPointerDown={(event) => {
          if (shouldStartDrag(event.target)) {
            void handleDragPointerDown(event)
          }
        }}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerEnd}
        onPointerCancel={handleDragPointerEnd}
      >
        <div className="h-5 w-full rounded-full" />
        <div className="rounded-[28px] p-2" style={inputFrameStyle}>
          <textarea
            ref={inputRef}
            rows={3}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value)
              setErrorMessage('')
              setLatestRecord(null)
            }}
            onKeyDown={(event) => void handleKeyDown(event)}
            placeholder="수상한 문구나 URL을 붙여넣고 Enter를 누르세요"
            className="h-[84px] w-full resize-none rounded-[22px] px-4 py-3 text-[24px] leading-[1.35] outline-none placeholder:text-[#8d96ab] sm:text-[28px]"
            style={inputSurfaceStyle}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] px-4 pt-4 pb-[5.25rem]" style={panelStyle}>
          {latestRecord ? (
            <div className="grid h-full min-h-0 grid-rows-[104px_minmax(92px,1fr)_10px] gap-3">
              <div className="grid grid-cols-[minmax(0,1fr)_92px_92px] items-center gap-2">
                <div className="flex min-h-[104px] min-w-0 items-center rounded-[24px] px-4 py-4" style={metricCardStyle}>
                  <div className="flex min-w-0 flex-col justify-center">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f2a14a]">
                      SIGNAL SCORE
                    </div>
                    <div className="mt-1 text-[38px] font-semibold leading-none tabular-nums" style={{ color: strongTextColor }}>
                      {Math.round(latestRecord.result.score)}%
                    </div>
                  </div>
                </div>
                <div className="flex h-[104px] flex-col items-center justify-center rounded-[24px] px-2 py-2 text-center" style={metricCardStyle}>
                  <div className="text-[10px] font-semibold tracking-[0.12em] text-[#8190aa]">유형</div>
                  <div className="mt-1 truncate text-[13px] font-semibold leading-4" style={{ color: strongTextColor }}>
                    {compactTypeLabel(latestRecord, locale)}
                  </div>
                </div>
                <div className="flex h-[104px] flex-col items-center justify-center rounded-[24px] px-2 py-2 text-center" style={metricCardStyle}>
                  <div className="text-[10px] font-semibold tracking-[0.12em] text-[#8190aa]">등급</div>
                  <div className={`mt-1 truncate text-[13px] font-extrabold leading-4 ${gradeTextClass(latestRecord.result.grade)}`}>
                    {translateGrade(latestRecord.result.grade, locale)}
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 items-start rounded-[24px] px-3 py-3" style={tagWrapStyle}>
                <div className="flex w-full flex-wrap items-start justify-start gap-2">
                  {visibleTags.length > 0 ? (
                    <>
                      {visibleTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex max-w-[220px] items-center justify-center truncate whitespace-nowrap rounded-full border border-white/20 bg-white/12 px-2.5 py-1.5 text-center text-[11px] font-semibold"
                          style={{ color: strongTextColor }}
                        >
                          {translateAiTag(tag, locale)}
                        </span>
                      ))}
                      {overflowTags > 0 ? (
                        <span
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/20 bg-white/12 px-2.5 py-1.5 text-center text-[11px] font-semibold"
                          style={{ color: strongTextColor }}
                        >
                          +{overflowTags}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/20 bg-white/12 px-2.5 py-1.5 text-center text-[11px] font-semibold"
                      style={{ color: strongTextColor }}
                    >
                      없음
                    </span>
                  )}
                </div>
              </div>

              <div className="h-2.5 overflow-hidden rounded-full bg-white/18">
                <div
                  className={`h-full rounded-full transition-all ${scoreBarClass(latestRecord.result.score)}`}
                  style={{ width: `${Math.min(latestRecord.result.score, 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col justify-center rounded-[24px] px-4 py-4" style={metricCardStyle}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f2a14a]">
                SIGNAL SCORE
              </div>
              <div className="mt-2 text-sm font-medium leading-6" style={{ color: errorMessage ? '#b9382d' : hintColor }}>
                {submitting
                  ? '분석 중입니다. 잠시만 기다리세요.'
                  : errorMessage || 'Enter를 누르면 런처 안에서 바로 분석하고 결과만 표시합니다.'}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="분석 실행"
          disabled={submitting}
          className="absolute bottom-5 right-5 inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition disabled:cursor-wait disabled:opacity-70"
          style={actionButtonStyle}
          onClick={() => void handleAnalyze()}
        >
          <ArrowUp className="h-6 w-6" />
        </button>
      </section>
    </main>
  )
}
