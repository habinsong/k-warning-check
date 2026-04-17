import { execFile, spawn } from 'node:child_process'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { createConnection } from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const BRIDGE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'codex-bridge.mjs')
const WORKSPACE_ROOT = realpathSync(
  process.env.KWC_ALLOW_ANY_WORKSPACE === '1'
    ? (process.env.KWC_DEFAULT_WORKSPACE_ROOT || process.cwd() || os.homedir())
    : path.resolve(REPO_ROOT, '..'),
)
const SECURE_STORE_SERVICE_NAME = 'K-WarningCheck'
const HOME_DIR = process.env.HOME ?? os.homedir()
const USER_PROFILE_DIR = process.env.USERPROFILE ?? HOME_DIR
const LOCAL_APP_DATA_DIR = process.env.LOCALAPPDATA ?? ''
const APP_DATA_DIR = process.env.APPDATA ?? ''
const KWC_HOME_DIR = path.join(HOME_DIR, '.k-warning-check')
const BRIDGE_STATE_PATH = path.join(KWC_HOME_DIR, 'codex-bridge.json')
const SECURE_STORE_METADATA_PATH = path.join(KWC_HOME_DIR, 'secure-store-metadata.json')
const SECURE_STORE_CACHE_PATH = path.join(KWC_HOME_DIR, 'secure-store-cache.json')
const RUNTIME_BRIDGE_SCRIPT_PATH = path.join(KWC_HOME_DIR, 'runtime', 'codex-bridge.mjs')
const BRIDGE_HOST = '127.0.0.1'
const BRIDGE_PORT = 4317
const BRIDGE_URL = `http://${BRIDGE_HOST}:${BRIDGE_PORT}`
const CHROME_EXTENSION_ORIGIN = 'chrome-extension://lmacmoffmdjjabkdkabfpfefdamlkcgg'
const CODEX_PATH_CANDIDATES = [
  process.env.CODEX_BIN,
  process.platform === 'win32' ? path.join(APP_DATA_DIR, 'npm', 'codex.cmd') : '',
  process.platform === 'win32' ? path.join(APP_DATA_DIR, 'npm', 'codex') : '',
  process.platform === 'win32' ? path.join(LOCAL_APP_DATA_DIR, 'Programs', 'Codex', 'codex.exe') : '',
  process.platform === 'win32' ? path.join(LOCAL_APP_DATA_DIR, 'Microsoft', 'WindowsApps', 'codex.exe') : '',
  process.platform === 'win32' ? path.join(USER_PROFILE_DIR, 'AppData', 'Roaming', 'npm', 'codex.cmd') : '',
  process.platform === 'win32' ? path.join(USER_PROFILE_DIR, 'AppData', 'Roaming', 'npm', 'codex') : '',
  process.platform === 'win32' ? path.join(HOME_DIR, 'AppData', 'Roaming', 'npm', 'codex.cmd') : '',
  process.platform === 'win32' ? path.join(HOME_DIR, 'AppData', 'Roaming', 'npm', 'codex') : '',
  path.join(HOME_DIR, '.npm-global', 'bin', 'codex'),
  path.join(HOME_DIR, '.npm-global', 'bin', 'codex.cmd'),
  '/usr/local/bin/codex',
  '/opt/homebrew/bin/codex',
].filter(Boolean)
const CODEX_BIN = CODEX_PATH_CANDIDATES.find((candidate) => existsSync(candidate)) ?? 'codex'
const NODE_BIN = process.execPath || 'node'
const TOOL_ENV = {
  ...process.env,
  PATH: [
    path.dirname(process.execPath),
    process.platform === 'win32' ? path.join(LOCAL_APP_DATA_DIR, 'Programs', 'nodejs') : '',
    process.platform === 'win32' ? path.join(LOCAL_APP_DATA_DIR, 'Microsoft', 'WindowsApps') : '',
    process.platform === 'win32' ? path.join(APP_DATA_DIR, 'npm') : '',
    process.platform === 'win32' ? path.join(USER_PROFILE_DIR, 'AppData', 'Roaming', 'npm') : '',
    process.platform === 'win32' ? path.join(HOME_DIR, 'AppData', 'Roaming', 'npm') : '',
    process.platform === 'win32' ? path.join(process.env.ProgramFiles ?? '', 'nodejs') : '',
    process.platform === 'win32' ? path.join(process.env['ProgramFiles(x86)'] ?? '', 'nodejs') : '',
    path.join(HOME_DIR, '.npm-global', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    process.env.PATH ?? '',
  ]
    .filter(Boolean)
    .join(path.delimiter),
}
const SECRET_PROVIDERS = new Set(['gemini', 'groq'])
let keytarModulePromise

function isWindowsCommandScript(program) {
  const normalized = String(program ?? '').trim().toLowerCase()
  return normalized.endsWith('.cmd') || normalized.endsWith('.bat')
}

function execToolAsync(program, args, options = {}) {
  if (process.platform === 'win32' && isWindowsCommandScript(program)) {
    return execFileAsync(process.env.ComSpec || 'cmd.exe', ['/C', program, ...args], {
      windowsHide: true,
      ...options,
    })
  }

  return execFileAsync(program, args, {
    windowsHide: true,
    ...options,
  })
}

function spawnTool(program, args, options = {}) {
  if (process.platform === 'win32' && isWindowsCommandScript(program)) {
    return spawn(process.env.ComSpec || 'cmd.exe', ['/C', program, ...args], {
      windowsHide: true,
      ...options,
    })
  }

  return spawn(program, args, {
    windowsHide: true,
    ...options,
  })
}

function isFileSystemRoot(candidatePath) {
  if (!candidatePath) {
    return false
  }

  const parsed = path.parse(candidatePath)
  return parsed.root === candidatePath
}

function normalizeExistingPath(candidate) {
  const target = String(candidate ?? '').trim()

  if (!target || !existsSync(target)) {
    return null
  }

  try {
    return realpathSync(target)
  } catch {
    return null
  }
}

function isAllowedWorkspacePath(candidatePath) {
  if (process.env.KWC_ALLOW_ANY_WORKSPACE === '1') {
    return true
  }

  const relative = path.relative(WORKSPACE_ROOT, candidatePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function readBridgeState() {
  try {
    return JSON.parse(await readFile(BRIDGE_STATE_PATH, 'utf8'))
  } catch {
    return null
  }
}

async function writeBridgeState(state) {
  await mkdir(path.dirname(BRIDGE_STATE_PATH), { recursive: true })
  await writeFile(BRIDGE_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function readSecureStoreMetadataState() {
  try {
    return JSON.parse(await readFile(SECURE_STORE_METADATA_PATH, 'utf8'))
  } catch {
    return {}
  }
}

async function writeSecureStoreMetadataState(state) {
  await mkdir(path.dirname(SECURE_STORE_METADATA_PATH), { recursive: true })
  await writeFile(SECURE_STORE_METADATA_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function readSecureStoreCacheState() {
  try {
    return JSON.parse(await readFile(SECURE_STORE_CACHE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

async function writeSecureStoreCacheState(state) {
  await mkdir(path.dirname(SECURE_STORE_CACHE_PATH), { recursive: true })
  await writeFile(SECURE_STORE_CACHE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function resolveBridgeScriptExecutable() {
  if (!BRIDGE_SCRIPT.includes('.asar/')) {
    return BRIDGE_SCRIPT
  }

  await mkdir(path.dirname(RUNTIME_BRIDGE_SCRIPT_PATH), { recursive: true })
  const source = await readFile(BRIDGE_SCRIPT, 'utf8')
  const existing = await readFile(RUNTIME_BRIDGE_SCRIPT_PATH, 'utf8').catch(() => '')
  if (existing !== source) {
    await writeFile(RUNTIME_BRIDGE_SCRIPT_PATH, source, 'utf8')
  }
  return RUNTIME_BRIDGE_SCRIPT_PATH
}

function resolveExecutionCwd() {
  return (
    normalizeExistingPath(process.env.KWC_DEFAULT_WORKSPACE_ROOT) ||
    (isFileSystemRoot(normalizeExistingPath(process.cwd())) ? null : normalizeExistingPath(process.cwd())) ||
    (isFileSystemRoot(normalizeExistingPath(WORKSPACE_ROOT)) ? null : normalizeExistingPath(WORKSPACE_ROOT)) ||
    normalizeExistingPath(os.homedir()) ||
    os.homedir()
  )
}

function getBridgeAllowedOrigins() {
  const allowedOrigins = new Set([CHROME_EXTENSION_ORIGIN, 'null'])
  const desktopRendererUrl = String(process.env.KWC_DESKTOP_RENDERER_URL ?? '').trim()

  if (desktopRendererUrl) {
    try {
      allowedOrigins.add(new URL(desktopRendererUrl).origin)
    } catch {
      // 잘못된 개발용 렌더러 URL은 무시합니다.
    }
  }

  return [...allowedOrigins]
}

async function getBridgeToken() {
  const state = await readBridgeState()
  const existingToken = typeof state?.token === 'string' ? state.token.trim() : ''

  if (existingToken) {
    return existingToken
  }

  const token = randomBytes(24).toString('hex')
  await writeBridgeState({
    token,
    updatedAt: new Date().toISOString(),
  })
  return token
}

function retentionMs(retention) {
  if (retention === 'hourly') {
    return 60 * 60 * 1000
  }

  return Number(String(retention).replace('d', '')) * 24 * 60 * 60 * 1000
}

function getSecureStorageBackend() {
  if (process.platform === 'darwin') {
    return 'keychain'
  }

  if (process.platform === 'win32') {
    return 'credential-locker'
  }

  return 'secret-service'
}

function getSecretAccount(provider) {
  return provider
}

function getLocalSecretCacheKey() {
  return createHash('sha256')
    .update(
      [
        SECURE_STORE_SERVICE_NAME,
        process.platform,
        os.homedir(),
        HOME_DIR,
        os.hostname(),
        os.userInfo().username,
      ].join(':'),
    )
    .digest()
}

function encryptSecretForLocalCache(secret) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getLocalSecretCacheKey(), iv)
  const encrypted = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    iv: iv.toString('base64'),
    cipherText: encrypted.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

function decryptSecretFromLocalCache(record) {
  if (
    !record ||
    typeof record !== 'object' ||
    typeof record.iv !== 'string' ||
    typeof record.cipherText !== 'string' ||
    typeof record.authTag !== 'string'
  ) {
    return ''
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getLocalSecretCacheKey(),
      Buffer.from(record.iv, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(record.cipherText, 'base64')),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch {
    return ''
  }
}

function assertProvider(provider) {
  if (!SECRET_PROVIDERS.has(provider)) {
    const error = new Error('지원하지 않는 provider입니다.')
    error.code = 'UNSUPPORTED_PROVIDER'
    throw error
  }
}

function secureStoreError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

async function getKeytar() {
  if (!keytarModulePromise) {
    keytarModulePromise = import('keytar')
      .then((module) => module.default ?? module)
      .catch((error) => {
        throw secureStoreError(
          'SECURE_STORE_UNAVAILABLE',
          error instanceof Error ? error.message : 'keytar 모듈을 불러오지 못했습니다.',
        )
      })
  }

  return keytarModulePromise
}

async function safeDeleteCredential(account) {
  try {
    const keytar = await getKeytar()
    await keytar.deletePassword(SECURE_STORE_SERVICE_NAME, account)
  } catch {
    // 삭제 실패는 무시합니다.
  }
}

async function readSecretMetadata(provider) {
  const metadataState = await readSecureStoreMetadataState()
  const metadata = metadataState?.[provider]

  if (!metadata || typeof metadata !== 'object') {
    return null
  }

  return {
    provider,
    retention: metadata.retention,
    createdAt: Number(metadata.createdAt) || Date.now(),
    expiresAt: Number(metadata.expiresAt) || null,
    lastValidationAt: Number(metadata.lastValidationAt) || null,
  }
}

async function writeSecretMetadata(provider, retention) {
  const now = Date.now()
  const metadata = {
    provider,
    retention,
    createdAt: now,
    expiresAt: now + retentionMs(retention),
    lastValidationAt: now,
  }

  const metadataState = await readSecureStoreMetadataState()
  await writeSecureStoreMetadataState({
    ...metadataState,
    [provider]: metadata,
  })

  return metadata
}

async function updateLastValidationAt(provider, metadata) {
  if (!metadata) {
    return null
  }

  const nextMetadata = {
    ...metadata,
    lastValidationAt: Date.now(),
  }

  const metadataState = await readSecureStoreMetadataState()
  await writeSecureStoreMetadataState({
    ...metadataState,
    [provider]: nextMetadata,
  })

  return nextMetadata
}

async function deleteSecretMetadata(provider) {
  const metadataState = await readSecureStoreMetadataState()

  if (!(provider in metadataState)) {
    return
  }

  const nextState = { ...metadataState }
  delete nextState[provider]
  await writeSecureStoreMetadataState(nextState)
}

async function readCachedSecret(provider) {
  const cacheState = await readSecureStoreCacheState()
  const secret = decryptSecretFromLocalCache(cacheState?.[provider])

  if (secret) {
    return secret
  }

  if (cacheState?.[provider]) {
    const nextState = { ...cacheState }
    delete nextState[provider]
    await writeSecureStoreCacheState(nextState)
  }

  return ''
}

async function writeCachedSecret(provider, secret) {
  const cacheState = await readSecureStoreCacheState()
  await writeSecureStoreCacheState({
    ...cacheState,
    [provider]: encryptSecretForLocalCache(secret),
  })
}

async function deleteCachedSecret(provider) {
  const cacheState = await readSecureStoreCacheState()

  if (!(provider in cacheState)) {
    return
  }

  const nextState = { ...cacheState }
  delete nextState[provider]
  await writeSecureStoreCacheState(nextState)
}

async function getProviderSecureStatus(provider) {
  assertProvider(provider)
  const backend = getSecureStorageBackend()

  try {
    const [cachedSecret, metadata] = await Promise.all([
      readCachedSecret(provider),
      readSecretMetadata(provider),
    ])

    if (metadata?.expiresAt && metadata.expiresAt <= Date.now()) {
      await Promise.all([
        safeDeleteCredential(getSecretAccount(provider)),
        deleteSecretMetadata(provider),
        deleteCachedSecret(provider),
      ])

      return {
        provider,
        hasSecret: false,
        storageBackend: backend,
        expiresAt: null,
        lastValidationAt: metadata.lastValidationAt ?? null,
      }
    }

    return {
      provider,
      hasSecret: Boolean(cachedSecret || metadata),
      storageBackend: backend,
      expiresAt: metadata?.expiresAt ?? null,
      lastValidationAt: metadata?.lastValidationAt ?? null,
    }
  } catch (error) {
    throw secureStoreError(
      'SECURE_STORE_UNAVAILABLE',
      error instanceof Error ? error.message : 'OS 보안 저장소를 사용할 수 없습니다.',
    )
  }
}

async function getSecureStoreStatus() {
  const backend = getSecureStorageBackend()

  try {
    await getKeytar()
    const [gemini, groq] = await Promise.all([
      getProviderSecureStatus('gemini'),
      getProviderSecureStatus('groq'),
    ])

    return {
      available: true,
      backend,
      providers: {
        gemini,
        groq,
      },
    }
  } catch (error) {
    return {
      available: false,
      backend: null,
      providers: {
        gemini: {
          provider: 'gemini',
          hasSecret: false,
          storageBackend: null,
          expiresAt: null,
          lastValidationAt: null,
        },
        groq: {
          provider: 'groq',
          hasSecret: false,
          storageBackend: null,
          expiresAt: null,
          lastValidationAt: null,
        },
      },
      error: error instanceof Error ? error.message : 'OS 보안 저장소를 사용할 수 없습니다.',
    }
  }
}

async function setSecureStoreSecret(provider, secret, retention) {
  assertProvider(provider)

  if (!String(secret ?? '').trim()) {
    throw secureStoreError('SECRET_NOT_FOUND', '빈 API 키는 저장할 수 없습니다.')
  }

  try {
    const keytar = await getKeytar()
    await keytar.setPassword(SECURE_STORE_SERVICE_NAME, getSecretAccount(provider), secret)
    const metadata = await writeSecretMetadata(provider, retention)
    await writeCachedSecret(provider, secret)
    return {
      provider,
      hasSecret: true,
      storageBackend: getSecureStorageBackend(),
      expiresAt: metadata.expiresAt,
      lastValidationAt: metadata.lastValidationAt,
    }
  } catch (error) {
    throw secureStoreError(
      'SECURE_STORE_UNAVAILABLE',
      error instanceof Error ? error.message : 'OS 보안 저장소에 API 키를 저장하지 못했습니다.',
    )
  }
}

async function getSecureStoreSecret(provider) {
  assertProvider(provider)

  try {
    const metadata = await readSecretMetadata(provider)

    if (metadata?.expiresAt && metadata.expiresAt <= Date.now()) {
      await Promise.all([
        safeDeleteCredential(getSecretAccount(provider)),
        deleteSecretMetadata(provider),
        deleteCachedSecret(provider),
      ])
      throw secureStoreError('SECRET_NOT_FOUND', 'API 키 보관 기간이 만료되었습니다.')
    }

    const cachedSecret = await readCachedSecret(provider)

    if (cachedSecret) {
      return cachedSecret
    }

    throw secureStoreError(
      'SECRET_CACHE_MISSING',
      '런타임 API 키 캐시가 없습니다. 설정에서 API 키를 다시 저장해 주세요.',
    )
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      throw error
    }

    throw secureStoreError(
      'SECURE_STORE_UNAVAILABLE',
      error instanceof Error ? error.message : 'OS 보안 저장소에서 API 키를 읽지 못했습니다.',
    )
  }
}

async function deleteSecureStoreSecret(provider) {
  assertProvider(provider)

  try {
    await Promise.all([
      safeDeleteCredential(getSecretAccount(provider)),
      deleteSecretMetadata(provider),
      deleteCachedSecret(provider),
    ])
    return {
      provider,
      hasSecret: false,
      storageBackend: getSecureStorageBackend(),
      expiresAt: null,
      lastValidationAt: null,
    }
  } catch (error) {
    throw secureStoreError(
      'SECURE_STORE_UNAVAILABLE',
      error instanceof Error ? error.message : 'OS 보안 저장소에서 API 키를 삭제하지 못했습니다.',
    )
  }
}

async function validateSecureStoreSecret(provider) {
  const status = await getProviderSecureStatus(provider)

  if (!status.hasSecret) {
    throw secureStoreError('SECRET_NOT_FOUND', '저장된 API 키가 없습니다.')
  }

  const metadata = await readSecretMetadata(provider)
  const nextMetadata = await updateLastValidationAt(provider, metadata)

  return {
    ...status,
    lastValidationAt: nextMetadata?.lastValidationAt ?? Date.now(),
  }
}

async function killBridgeOnPort(port = 4317) {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp'], {
        env: TOOL_ENV,
        maxBuffer: 1024 * 1024,
      })
      const pids = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.includes(`:${port}`))
        .map((line) => line.split(/\s+/u).at(-1))
        .filter(Boolean)

      for (const pid of new Set(pids)) {
        await execFileAsync('taskkill', ['/PID', pid, '/F'], {
          env: TOOL_ENV,
          maxBuffer: 1024 * 1024,
        }).catch(() => {})
      }
    } catch {
      // 찾지 못한 경우는 무시합니다.
    }

    return
  }

  try {
    const { stdout } = await execFileAsync('/usr/sbin/lsof', ['-ti', `tcp:${port}`], {
      env: TOOL_ENV,
      maxBuffer: 1024 * 1024,
    })
    const pids = stdout
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)

    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM')
      } catch {
        // 이미 종료된 프로세스는 무시합니다.
      }
    }
  } catch {
    // 찾지 못한 경우는 무시합니다.
  }
}

async function codexStatus() {
  if (process.platform === 'win32') {
    throw new Error('Windows에서는 Codex를 지원하지 않습니다.')
  }

  const { stdout, stderr } = await execToolAsync(CODEX_BIN, ['login', 'status'], {
    env: TOOL_ENV,
    maxBuffer: 1024 * 1024,
  })
  return (stdout || stderr).trim()
}

function isLoggedInStatus(statusText) {
  return /\blogged in\b/i.test(String(statusText || ''))
}

function extractAuthUrl(output) {
  return String(output || '').match(/https:\/\/auth\.openai\.com\/\S+/u)?.[0] ?? ''
}

function isBridgeOpen(port = 4317, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host })
    socket.setTimeout(500)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
  })
}

async function getBridgeConnectionInfo(preferredRoot) {
  return {
    workspaceRoot: resolveWorkspaceRoot(preferredRoot),
    bridgeUrl: BRIDGE_URL,
    bridgeToken: await getBridgeToken(),
  }
}

async function startBridge(force = false) {
  if (process.platform === 'win32') {
    throw new Error('Windows에서는 Codex를 지원하지 않습니다.')
  }

  if (force) {
    await killBridgeOnPort()
  }

  if (await isBridgeOpen()) {
    return {
      message: 'Codex 연결이 이미 실행 중입니다.',
      bridgeRunning: true,
      status: await codexStatus().catch(() => '미확인'),
    }
  }

  const bridgeWorkspaceRoot = resolveWorkspaceRoot()
  const child = spawn(NODE_BIN, [await resolveBridgeScriptExecutable()], {
    cwd: resolveExecutionCwd(),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...TOOL_ENV,
      CODEX_BRIDGE_HOST: BRIDGE_HOST,
      CODEX_BRIDGE_PORT: String(BRIDGE_PORT),
      CODEX_BRIDGE_TOKEN: await getBridgeToken(),
      CODEX_BRIDGE_ALLOWED_ORIGINS: getBridgeAllowedOrigins().join(','),
      CODEX_BRIDGE_WORKSPACE_ROOT: bridgeWorkspaceRoot,
    },
  })

  child.unref()
  await new Promise((resolve) => setTimeout(resolve, 600))

  return {
    message: (await isBridgeOpen())
      ? 'Codex 연결을 시작했습니다.'
      : 'Codex 연결 시작 요청을 보냈지만 아직 연결되지 않았습니다.',
    bridgeRunning: await isBridgeOpen(),
    status: await codexStatus().catch(() => '미확인'),
  }
}

async function startLogin() {
  if (process.platform === 'win32') {
    throw new Error('Windows에서는 Codex를 지원하지 않습니다.')
  }

  const currentStatus = await codexStatus().catch(() => '')
  if (isLoggedInStatus(currentStatus)) {
    return {
      output: currentStatus,
      authUrl: '',
      logPath: '',
      alreadyLoggedIn: true,
      message: 'Codex는 이미 로그인되어 있습니다.',
    }
  }

  const logPath = path.join(os.tmpdir(), `kwc-codex-oauth-${Date.now()}.log`)
  const outputHandle = await open(logPath, 'a')
  const child = spawnTool(CODEX_BIN, ['login', '--device-auth'], {
    cwd: resolveExecutionCwd(),
    detached: true,
    stdio: ['ignore', outputHandle.fd, outputHandle.fd],
    env: TOOL_ENV,
  })

  child.unref()
  await outputHandle.close()

  let output = ''
  let authUrl = ''

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    output = await readFile(logPath, 'utf8').catch(() => '')
    authUrl = extractAuthUrl(output)

    if (authUrl) {
      break
    }
  }

  return {
    output: output.trim(),
    authUrl,
    logPath,
    message: authUrl
      ? 'Codex OAuth 로그인을 시작했습니다.'
      : 'Codex OAuth 로그인 프로세스를 시작했지만 인증 URL을 아직 읽지 못했습니다.',
  }
}

function resolveWorkspaceRoot(preferredRoot) {
  const preferred = normalizeExistingPath(preferredRoot)

  if (preferred && !isFileSystemRoot(preferred) && isAllowedWorkspacePath(preferred)) {
    return preferred
  }

  const defaultWorkspaceRoot = normalizeExistingPath(process.env.KWC_DEFAULT_WORKSPACE_ROOT)

  if (defaultWorkspaceRoot && !isFileSystemRoot(defaultWorkspaceRoot) && isAllowedWorkspacePath(defaultWorkspaceRoot)) {
    return defaultWorkspaceRoot
  }

  if (!isFileSystemRoot(WORKSPACE_ROOT)) {
    return WORKSPACE_ROOT
  }

  return os.homedir()
}

export {
  codexStatus,
  deleteSecureStoreSecret,
  getBridgeConnectionInfo,
  getSecureStoreSecret,
  getSecureStoreStatus,
  isBridgeOpen,
  resolveWorkspaceRoot,
  WORKSPACE_ROOT,
  startBridge,
  startLogin,
  setSecureStoreSecret,
  validateSecureStoreSecret,
}
