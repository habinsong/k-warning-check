import type { RuntimeResponse } from '@/shared/types'

declare global {
  interface Window {
    __kwcCaptureInstalled?: boolean
  }
}

if (!window.__kwcCaptureInstalled) {
  window.__kwcCaptureInstalled = true

  let overlay: HTMLDivElement | null = null
  let selectionBox: HTMLDivElement | null = null
  let startX = 0
  let startY = 0

  function showToast(message: string) {
    const toast = document.createElement('div')
    toast.textContent = message
    Object.assign(toast.style, {
      position: 'fixed',
      left: '50%',
      bottom: '24px',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      maxWidth: 'min(90vw, 420px)',
      background: '#7f1d1d',
      color: '#fff',
      padding: '10px 14px',
      borderRadius: '10px',
      boxShadow: '0 12px 28px rgba(15,23,42,0.2)',
      fontSize: '13px',
      lineHeight: '18px',
      fontFamily:
        'Inter, "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    })
    document.body.appendChild(toast)
    window.setTimeout(() => toast.remove(), 2600)
  }

  function cleanup() {
    overlay?.remove()
    overlay = null
    selectionBox = null
  }

  function updateSelectionBox(currentX: number, currentY: number) {
    if (!selectionBox) {
      return
    }

    const left = Math.min(startX, currentX)
    const top = Math.min(startY, currentY)
    const width = Math.abs(currentX - startX)
    const height = Math.abs(currentY - startY)

    Object.assign(selectionBox.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    })
  }

  function startCapture() {
    cleanup()

    overlay = document.createElement('div')
    overlay.style.position = 'fixed'
    overlay.style.inset = '0'
    overlay.style.zIndex = '2147483647'
    overlay.style.cursor = 'crosshair'
    overlay.style.background = 'rgba(15, 23, 42, 0.18)'
    overlay.style.backdropFilter = 'blur(1px)'

    const badge = document.createElement('div')
    badge.textContent = '드래그해서 분석할 영역을 선택하세요. ESC로 취소합니다.'
    Object.assign(badge.style, {
      position: 'fixed',
      top: '16px',
      left: '16px',
      background: '#0f172a',
      color: '#fff',
      padding: '10px 12px',
      borderRadius: '8px',
      fontSize: '13px',
      fontFamily:
        'Inter, "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    })

    selectionBox = document.createElement('div')
    Object.assign(selectionBox.style, {
      position: 'fixed',
      border: '2px solid #ef4444',
      background: 'rgba(239, 68, 68, 0.12)',
      borderRadius: '8px',
      pointerEvents: 'none',
    })

    overlay.append(badge, selectionBox)
    document.body.appendChild(overlay)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        window.removeEventListener('keydown', onKeyDown)
        cleanup()
      }
    }

    window.addEventListener('keydown', onKeyDown, { once: false })

    overlay.addEventListener('mousedown', (event) => {
      startX = event.clientX
      startY = event.clientY

      const onMove = (moveEvent: MouseEvent) => {
        updateSelectionBox(moveEvent.clientX, moveEvent.clientY)
      }

      const onUp = async (upEvent: MouseEvent) => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        window.removeEventListener('keydown', onKeyDown)

        const rect = {
          x: Math.min(startX, upEvent.clientX),
          y: Math.min(startY, upEvent.clientY),
          width: Math.abs(upEvent.clientX - startX),
          height: Math.abs(upEvent.clientY - startY),
          devicePixelRatio: window.devicePixelRatio,
        }

        cleanup()

        if (rect.width < 12 || rect.height < 12) {
          return
        }

        const response = (await chrome.runtime.sendMessage({
          type: 'capture-finished',
          rect,
          title: document.title,
        })) as RuntimeResponse

        if (!response?.ok) {
          showToast(response?.error ?? '영역 분석에 실패했습니다.')
        }
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    })
  }

  chrome.runtime.onMessage.addListener((message: { type?: string }) => {
    if (message.type === 'start-capture-overlay') {
      startCapture()
    }

    if (message.type === 'cancel-capture-overlay') {
      cleanup()
    }
  })
}
