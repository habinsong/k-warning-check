import { useEffect, useRef, useState } from 'react'
import type { CaptureRect } from '@/shared/types'

interface DragPoint {
  x: number
  y: number
}

function normalizeRect(start: DragPoint, end: DragPoint): CaptureRect {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const width = Math.abs(end.x - start.x)
  const height = Math.abs(end.y - start.y)

  return {
    x,
    y,
    width,
    height,
    devicePixelRatio: window.devicePixelRatio,
  }
}

export function CaptureOverlayApp() {
  const [dragStart, setDragStart] = useState<DragPoint | null>(null)
  const [dragEnd, setDragEnd] = useState<DragPoint | null>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<DragPoint | null>(null)
  const dragEndRef = useRef<DragPoint | null>(null)

  const selectionRect =
    dragStart && dragEnd
      ? normalizeRect(dragStart, dragEnd)
      : null

  function resetSelection() {
    isDraggingRef.current = false
    dragStartRef.current = null
    dragEndRef.current = null
    setDragStart(null)
    setDragEnd(null)
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        void window.kwcCaptureOverlay.cancelSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!isDraggingRef.current || !dragStartRef.current) {
        return
      }

      const point = { x: event.clientX, y: event.clientY }
      dragEndRef.current = point
      setDragEnd(point)
    }

    function handleMouseUp(event: MouseEvent) {
      if (!isDraggingRef.current || !dragStartRef.current) {
        return
      }

      const endPoint = { x: event.clientX, y: event.clientY }
      dragEndRef.current = endPoint
      const nextSelectionRect = normalizeRect(dragStartRef.current, endPoint)

      if (nextSelectionRect.width < 12 || nextSelectionRect.height < 12) {
        resetSelection()
        return
      }

      setDragEnd(endPoint)
      isDraggingRef.current = false
      void window.kwcCaptureOverlay.completeSelection(nextSelectionRect)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  function handleMouseDown(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault()
    const point = { x: event.clientX, y: event.clientY }
    isDraggingRef.current = true
    dragStartRef.current = point
    dragEndRef.current = point
    setDragStart(point)
    setDragEnd(point)
  }

  return (
    <main
      className="relative h-screen w-screen cursor-crosshair overflow-hidden bg-slate-950/12 select-none touch-none"
      onMouseDown={handleMouseDown}
    >
      <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center px-6">
        <div className="rounded-2xl border border-white/30 bg-slate-950/80 px-5 py-3 text-sm font-medium text-white shadow-[0_18px_50px_rgba(15,23,42,0.35)]">
          드래그해서 분석할 화면 영역을 선택하세요. 취소는 Esc
        </div>
      </div>

      {selectionRect ? (
        <div
          className="absolute border-2 border-sky-400 bg-sky-400/15 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]"
          style={{
            left: selectionRect.x,
            top: selectionRect.y,
            width: selectionRect.width,
            height: selectionRect.height,
          }}
        />
      ) : null}
    </main>
  )
}
