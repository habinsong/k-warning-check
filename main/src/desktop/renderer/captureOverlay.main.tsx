import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import { CaptureOverlayApp } from '@/desktop/renderer/CaptureOverlayApp'

if ('__TAURI_INTERNALS__' in window) {
  await import('@/desktop/renderer/tauri-bridge')
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('캡처 오버레이 루트 노드를 찾지 못했습니다.')
}

createRoot(rootElement).render(
  <StrictMode>
    <CaptureOverlayApp />
  </StrictMode>,
)
