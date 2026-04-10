import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import { DesktopApp } from '@/desktop/renderer/DesktopApp'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('데스크톱 앱 루트 노드를 찾지 못했습니다.')
}

createRoot(rootElement).render(
  <StrictMode>
    <DesktopApp />
  </StrictMode>,
)
