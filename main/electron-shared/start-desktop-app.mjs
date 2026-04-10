import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain, nativeImage, screen, shell, systemPreferences } from 'electron'
import {
  codexStatus,
  deleteSecureStoreSecret,
  getBridgeConnectionInfo,
  getSecureStoreStatus,
  startBridge,
  startLogin,
  setSecureStoreSecret,
  validateSecureStoreSecret,
} from './codex-services.mjs'
import { invokeProviderBridge } from './provider-bridge.mjs'
import { deriveSecureStoreStatusFromState, mergeProviderState, sanitizePersistedState } from './provider-state.mjs'

const HISTORY_LIMIT = 50
const execFileAsync = promisify(execFile)
const MAC_SCREEN_CAPTURE_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallbackValue
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function resolveRendererEntry(shellDir, fileName) {
  const devBaseUrl = process.env.KWC_DESKTOP_RENDERER_URL
  if (devBaseUrl) {
    return `${devBaseUrl}/${fileName}`
  }

  const localRenderer = path.resolve(shellDir, '..', 'renderer', fileName)
  if (existsSync(localRenderer)) {
    return pathToFileURL(localRenderer).href
  }

  return pathToFileURL(path.resolve(shellDir, '..', '..', 'main', '.desktop-renderer', fileName)).href
}

function parseSafeExternalUrl(url) {
  let parsedUrl

  try {
    parsedUrl = new URL(String(url))
  } catch {
    throw new Error('외부 URL 형식을 해석하지 못했습니다.')
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('외부로 여는 URL은 HTTPS만 허용됩니다.')
  }

  return parsedUrl.toString()
}

async function readMacScreenAccessState() {
  if (process.platform !== 'darwin') {
    return {
      supported: false,
      granted: true,
      status: 'unsupported',
    }
  }

  const status = systemPreferences.getMediaAccessStatus('screen')

  return {
    supported: true,
    granted: status === 'granted',
    status,
  }
}

async function requestMacScreenAccessFromApp() {
  const currentAccess = await readMacScreenAccessState()

  if (currentAccess.granted || process.platform !== 'darwin') {
    return currentAccess
  }

  try {
    await desktopCapturer.getSources({
      types: ['screen'],
      fetchWindowIcons: false,
      thumbnailSize: {
        width: 16,
        height: 16,
      },
    })
  } catch {
    // 권한이 없으면 macOS가 내부적으로 막을 수 있으므로 후속 상태만 다시 확인합니다.
  }

  const requestedAccess = await readMacScreenAccessState()

  if (!requestedAccess.granted) {
    await openMacScreenCaptureSettings()
  }

  return requestedAccess
}

async function ensureScreenCapturePermission(shellDir) {
  if (process.platform !== 'darwin') {
    return
  }

  const currentAccess = await readMacScreenAccessState()

  if (currentAccess?.granted) {
    return
  }

  const requestedAccess = await requestMacScreenAccessFromApp()

  if (requestedAccess?.granted) {
    return
  }

  await openMacScreenCaptureSettings()

  throw new Error(
    '화면 영역 분석을 사용하려면 macOS 설정에서 이 앱의 화면 및 시스템 오디오 녹화 권한을 허용한 뒤 앱을 다시 실행하세요.',
  )
}

async function openMacScreenCaptureSettings() {
  if (process.platform !== 'darwin') {
    return
  }

  try {
    await shell.openExternal(MAC_SCREEN_CAPTURE_SETTINGS_URL)
  } catch {
    try {
      await shell.openPath('/System/Applications/System Settings.app')
    } catch {
      // 시스템 설정을 직접 열지 못한 경우는 무시합니다.
    }
  }
}

function createDesktopStore(userDataDir) {
  const providerStatePath = path.join(userDataDir, 'provider-state.json')
  const historyPath = path.join(userDataDir, 'history.json')
  const currentDesktopBuildId = String(process.env.KWC_DESKTOP_BUILD_ID ?? '').trim()

  return {
    async getProviderState() {
      const rawState = await readJson(providerStatePath, undefined)
      const normalizedRawState =
        rawState && currentDesktopBuildId && rawState.desktopBuildId !== currentDesktopBuildId
          ? {
              ...rawState,
              onboardingCompleted: false,
              desktopBuildId: currentDesktopBuildId,
            }
          : rawState
      const bridgeInfo = await getBridgeConnectionInfo(normalizedRawState?.codex?.workspaceRoot).catch(
        () => null,
      )
      const resolvedRawState = normalizedRawState
        ? {
            ...normalizedRawState,
            codex: {
              ...(normalizedRawState.codex ?? {}),
              bridgeUrl: bridgeInfo?.bridgeUrl || normalizedRawState.codex?.bridgeUrl,
              bridgeToken: bridgeInfo?.bridgeToken || '',
              workspaceRoot: bridgeInfo?.workspaceRoot || normalizedRawState.codex?.workspaceRoot,
            },
          }
        : bridgeInfo
          ? {
              codex: {
                bridgeUrl: bridgeInfo.bridgeUrl,
                bridgeToken: bridgeInfo.bridgeToken,
                workspaceRoot: bridgeInfo.workspaceRoot,
              },
            }
          : rawState

      return mergeProviderState(
        resolvedRawState,
        deriveSecureStoreStatusFromState(resolvedRawState),
      )
    },
    async saveProviderState(state) {
      await writeJson(providerStatePath, {
        ...sanitizePersistedState(state),
        ...(currentDesktopBuildId ? { desktopBuildId: currentDesktopBuildId } : {}),
      })
      return this.getProviderState()
    },
    async getHistoryBundle() {
      const stored = await readJson(historyPath, {
        history: [],
        latestRecord: null,
      })

      return {
        history: Array.isArray(stored.history) ? stored.history : [],
        latestRecord: stored.latestRecord ?? null,
      }
    },
    async saveRecord(record) {
      const current = await this.getHistoryBundle()
      const history = [record, ...current.history.filter((item) => item.id !== record.id)].slice(
        0,
        HISTORY_LIMIT,
      )
      await writeJson(historyPath, {
        history,
        latestRecord: record,
      })
      return history
    },
    async deleteRecord(id) {
      const current = await this.getHistoryBundle()
      const history = current.history.filter((item) => item.id !== id)
      await writeJson(historyPath, {
        history,
        latestRecord: current.latestRecord?.id === id ? history[0] ?? null : current.latestRecord,
      })
      return history
    },
    async clearHistory() {
      await writeJson(historyPath, {
        history: [],
        latestRecord: null,
      })
    },
    async getRecordById(id) {
      const current = await this.getHistoryBundle()
      return current.history.find((item) => item.id === id) ?? null
    },
  }
}

export async function startDesktopApp({ appId, shellDir, title, preloadPath }) {
  if (!app.isReady()) {
    await app.whenReady()
  }

  if (appId) {
    app.setAppUserModelId(appId)
  }

  const userDataDir = path.join(app.getPath('userData'), 'k-warning-check')
  const store = createDesktopStore(userDataDir)
  const mainEntryUrl = resolveRendererEntry(shellDir, 'desktop.html')
  const captureEntryUrl = resolveRendererEntry(shellDir, 'capture-overlay.html')

  let mainWindow = null
  let captureSession = null

  async function createMainWindow() {
    mainWindow = new BrowserWindow({
      width: 1360,
      height: 920,
      minWidth: 880,
      minHeight: 620,
      title,
      backgroundColor: '#eef2f7',
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      try {
        void shell.openExternal(parseSafeExternalUrl(url))
      } catch {
        // 허용되지 않은 외부 URL은 무시합니다.
      }
      return { action: 'deny' }
    })

    if (process.env.KWC_DESKTOP_RENDERER_URL) {
      await mainWindow.loadURL(mainEntryUrl)
    } else {
      await mainWindow.loadFile(fileURLToPath(mainEntryUrl))
    }
  }

  async function captureDisplayRegion() {
    if (captureSession) {
      throw new Error('이미 화면 영역 선택이 진행 중입니다.')
    }

    await ensureScreenCapturePermission(shellDir)

    const cursorPoint = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursorPoint)
    const overlayWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      transparent: true,
      frame: false,
      movable: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow.setIgnoreMouseEvents(false)
    overlayWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    })

    captureSession = {
      overlayWindow,
      display,
    }

    overlayWindow.on('closed', () => {
      if (captureSession?.overlayWindow === overlayWindow) {
        captureSession = null
      }
    })

    if (process.env.KWC_DESKTOP_RENDERER_URL) {
      await overlayWindow.loadURL(captureEntryUrl)
    } else {
      await overlayWindow.loadFile(fileURLToPath(captureEntryUrl))
    }

    overlayWindow.show()
    overlayWindow.moveTop()
    overlayWindow.focus()

    return await new Promise((resolve, reject) => {
      captureSession.resolve = resolve
      captureSession.reject = reject
    })
  }

  ipcMain.handle('kwc:history:get-bundle', () => store.getHistoryBundle())
  ipcMain.handle('kwc:history:save-record', (_, record) => store.saveRecord(record))
  ipcMain.handle('kwc:history:delete-record', (_, id) => store.deleteRecord(id))
  ipcMain.handle('kwc:history:clear', () => store.clearHistory())
  ipcMain.handle('kwc:history:get-record', (_, id) => store.getRecordById(id))

  ipcMain.handle('kwc:provider-state:get', () => store.getProviderState())
  ipcMain.handle('kwc:provider-state:save', (_, state) => store.saveProviderState(state))

  ipcMain.handle('kwc:secure-store:status', () => getSecureStoreStatus())
  ipcMain.handle('kwc:secure-store:set-secret', (_, provider, secret, retention) =>
    setSecureStoreSecret(provider, secret, retention),
  )
  ipcMain.handle('kwc:secure-store:delete-secret', (_, provider) => deleteSecureStoreSecret(provider))
  ipcMain.handle('kwc:secure-store:validate-secret', (_, provider) => validateSecureStoreSecret(provider))
  ipcMain.handle('kwc:provider-bridge:invoke', (_, provider, operation, payload) =>
    invokeProviderBridge({
      store,
      provider,
      operation,
      payload,
    }),
  )

  ipcMain.handle('kwc:codex:get-status', async () => ({
    status: await codexStatus().catch(() => '미확인'),
    bridgeRunning: false,
    message: 'Codex 상태를 확인했습니다.',
  }))
  ipcMain.handle('kwc:codex:start-bridge', (_, force) => startBridge(Boolean(force)))
  ipcMain.handle('kwc:codex:start-login', () => startLogin())

  ipcMain.handle('kwc:system:read-clipboard-text', () => clipboard.readText())
  ipcMain.handle('kwc:system:open-external', (_, url) => shell.openExternal(parseSafeExternalUrl(url)))
  ipcMain.handle('kwc:system:capture-screen-region', () => captureDisplayRegion())
  ipcMain.handle('kwc:system:get-screen-capture-permission-status', () =>
    readMacScreenAccessState(),
  )
  ipcMain.handle('kwc:system:request-screen-capture-permission', () =>
    requestMacScreenAccessFromApp(),
  )

  ipcMain.handle('kwc:capture-overlay:cancel', async (event) => {
    if (!captureSession || captureSession.overlayWindow.webContents.id !== event.sender.id) {
      return
    }

    const { overlayWindow, reject } = captureSession
    captureSession = null
    if (!overlayWindow.isDestroyed()) {
      overlayWindow.close()
    }
    reject(new Error('화면 영역 선택을 취소했습니다.'))
  })

  ipcMain.handle('kwc:capture-overlay:complete', async (event, rect) => {
    if (!captureSession || captureSession.overlayWindow.webContents.id !== event.sender.id) {
      return
    }

    const { overlayWindow, display, resolve } = captureSession
    const scale = display.scaleFactor || 1
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.floor(display.bounds.width * scale),
        height: Math.floor(display.bounds.height * scale),
      },
    })
    const matchedSource =
      sources.find((source) => source.display_id === String(display.id)) ?? sources[0]

    if (!matchedSource) {
      throw new Error('화면 캡처 이미지를 가져오지 못했습니다.')
    }

    const image = nativeImage.createFromDataURL(matchedSource.thumbnail.toDataURL())
    const cropped = image.crop({
      x: Math.max(0, Math.round(rect.x * scale)),
      y: Math.max(0, Math.round(rect.y * scale)),
      width: Math.max(1, Math.round(rect.width * scale)),
      height: Math.max(1, Math.round(rect.height * scale)),
    })

    captureSession = null
    if (!overlayWindow.isDestroyed()) {
      overlayWindow.close()
    }

    resolve({
      imageDataUrl: cropped.toDataURL(),
      rect: {
        ...rect,
        devicePixelRatio: scale,
      },
      title: display.label || '화면 캡처',
    })
  })

  await createMainWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
