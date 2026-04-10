import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.KWC_ALLOW_ANY_WORKSPACE = '1'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localSharedEntry = path.resolve(__dirname, '..', 'electron-shared', 'start-desktop-app.mjs')
const sourceSharedEntry = path.resolve(__dirname, '..', '..', 'main', 'electron-shared', 'start-desktop-app.mjs')
const sharedEntry = existsSync(localSharedEntry) ? localSharedEntry : sourceSharedEntry

const { startDesktopApp } = await import(pathToFileURL(sharedEntry).href)

await startDesktopApp({
  appId: 'kr.k_warning_check.desktop.windows',
  shellDir: __dirname,
  preloadPath: path.resolve(__dirname, 'preload.cjs'),
  title: 'K-워닝체크 Desktop (Windows)',
})
