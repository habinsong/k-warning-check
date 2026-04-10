const { existsSync } = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

process.env.KWC_ALLOW_ANY_WORKSPACE = '1'

function findWorkspaceRoot(startPath) {
  let currentPath = startPath

  while (currentPath && currentPath !== path.dirname(currentPath)) {
    if (
      existsSync(path.join(currentPath, 'package.json')) &&
      existsSync(path.join(currentPath, 'main', 'package.json'))
    ) {
      return currentPath
    }

    currentPath = path.dirname(currentPath)
  }

  return null
}

const detectedWorkspaceRoot =
  findWorkspaceRoot(process.cwd()) ||
  findWorkspaceRoot(__dirname) ||
  findWorkspaceRoot(path.dirname(process.execPath))

if (detectedWorkspaceRoot) {
  process.env.KWC_DEFAULT_WORKSPACE_ROOT = detectedWorkspaceRoot
}

const shellDir = __dirname
const packageJsonPath = path.resolve(shellDir, '..', 'package.json')
const packageJson = existsSync(packageJsonPath) ? require(packageJsonPath) : null
const localSharedEntry = path.resolve(shellDir, '..', 'electron-shared', 'start-desktop-app.mjs')
const sourceSharedEntry = path.resolve(shellDir, '..', '..', 'main', 'electron-shared', 'start-desktop-app.mjs')
const sharedEntry = existsSync(localSharedEntry) ? localSharedEntry : sourceSharedEntry

if (packageJson?.kwcDesktopBuildId) {
  process.env.KWC_DESKTOP_BUILD_ID = String(packageJson.kwcDesktopBuildId)
}

;(async () => {
  const { startDesktopApp } = await import(pathToFileURL(sharedEntry).href)

  await startDesktopApp({
    appId: 'kr.kwarningcheck.desktop.mac',
    shellDir,
    preloadPath: path.resolve(shellDir, 'preload.cjs'),
    title: 'K-워닝체크 Desktop (macOS)',
  })
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
