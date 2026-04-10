import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localSharedEntry = path.resolve(__dirname, '..', 'electron-shared', 'shared-preload.mjs')
const sourceSharedEntry = path.resolve(__dirname, '..', '..', 'main', 'electron-shared', 'shared-preload.mjs')
const sharedEntry = existsSync(localSharedEntry) ? localSharedEntry : sourceSharedEntry

await import(pathToFileURL(sharedEntry).href)
