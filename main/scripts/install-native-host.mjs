import { chmod, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const hostScript = path.join(repoRoot, 'native', 'codex-native-host.mjs')
const unixHostWrapper = path.join(repoRoot, 'native', 'codex-native-host')
const windowsHostWrapper = path.join(repoRoot, 'native', 'codex-native-host.cmd')
const hostName = 'kr.k_warning_check.codex'

function targetManifestPath() {
  if (process.platform === 'darwin') {
    return path.join(
      process.env.HOME,
      'Library',
      'Application Support',
      'Google',
      'Chrome',
      'NativeMessagingHosts',
      `${hostName}.json`,
    )
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
    return path.join(
      localAppData,
      'Google',
      'Chrome',
      'User Data',
      'NativeMessagingHosts',
      `${hostName}.json`,
    )
  }

  return path.join(
    process.env.HOME ?? os.homedir(),
    '.config',
    'google-chrome',
    'NativeMessagingHosts',
    `${hostName}.json`,
  )
}

async function ensureWrapper() {
  if (process.platform === 'win32') {
    const wrapperScript = `@echo off\r
setlocal\r
set "SCRIPT_DIR=%~dp0"\r
set "NODE_BIN="\r
for %%I in ("%SCRIPT_DIR%node.exe" "%LOCALAPPDATA%\\Programs\\nodejs\\node.exe" "%ProgramFiles%\\nodejs\\node.exe" "%ProgramFiles(x86)%\\nodejs\\node.exe") do (\r
  if not defined NODE_BIN if exist "%%~fI" set "NODE_BIN=%%~fI"\r
)\r
if not defined NODE_BIN (\r
  for /f "delims=" %%I in ('where node 2^>nul') do (\r
    if not defined NODE_BIN set "NODE_BIN=%%~fI"\r
  )\r
)\r
if not defined NODE_BIN (\r
  >&2 echo Node.js 실행 파일을 찾지 못했습니다. Node.js를 설치한 뒤 다시 시도하세요.\r
  exit /b 1\r
)\r
set "PATH=%SCRIPT_DIR%;%APPDATA%\\npm;%LOCALAPPDATA%\\Programs\\nodejs;%PATH%"\r
"%NODE_BIN%" "%SCRIPT_DIR%codex-native-host.mjs"\r
`
    await writeFile(windowsHostWrapper, wrapperScript, 'utf8')
    return windowsHostWrapper
  }

  const wrapperScript = `#!/bin/sh
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
export PATH="$SCRIPT_DIR:$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
exec "$(command -v node)" "$SCRIPT_DIR/codex-native-host.mjs"
`
  await writeFile(unixHostWrapper, wrapperScript, 'utf8')
  await chmod(hostScript, 0o755)
  await chmod(unixHostWrapper, 0o755)
  return unixHostWrapper
}

async function registerWindowsHost(manifestPath) {
  const keyPath = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`
  await execFileAsync('reg', ['add', keyPath, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'])
}

const manifestPath = targetManifestPath()
const hostWrapper = await ensureWrapper()
const manifest = {
  name: hostName,
  description: 'K-워닝체크 Local Native Host',
  path: hostWrapper,
  type: 'stdio',
  allowed_origins: ['chrome-extension://lmacmoffmdjjabkdkabfpfefdamlkcgg/'],
}

await mkdir(path.dirname(manifestPath), { recursive: true })
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

if (process.platform === 'win32') {
  await registerWindowsHost(manifestPath)
}

console.log(`로컬 네이티브 호스트를 설치했습니다: ${manifestPath}`)
console.log(`로컬 네이티브 호스트 실행 래퍼: ${hostWrapper}`)
