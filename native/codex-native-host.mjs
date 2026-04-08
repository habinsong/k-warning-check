#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { open, readFile } from 'node:fs/promises'
import os from 'node:os'
import { createConnection } from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const BRIDGE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'codex-bridge.mjs')
const HOME_DIR = process.env.HOME ?? ''
const CODEX_PATH_CANDIDATES = [
  process.env.CODEX_BIN,
  path.join(HOME_DIR, '.npm-global', 'bin', 'codex'),
  '/usr/local/bin/codex',
  '/opt/homebrew/bin/codex',
].filter(Boolean)
const CODEX_BIN = CODEX_PATH_CANDIDATES.find((candidate) => existsSync(candidate)) ?? 'codex'
const TOOL_ENV = {
  ...process.env,
  PATH: [
    path.dirname(process.execPath),
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
    .join(':'),
}

function readNativeMessage() {
  return new Promise((resolve, reject) => {
    const chunks = []
    let expectedLength = null
    let totalLength = 0

    process.stdin.on('data', (chunk) => {
      chunks.push(chunk)
      totalLength += chunk.length
      const buffer = Buffer.concat(chunks, totalLength)

      if (expectedLength === null && buffer.length >= 4) {
        expectedLength = buffer.readUInt32LE(0)
      }

      if (expectedLength !== null && buffer.length >= expectedLength + 4) {
        const message = JSON.parse(buffer.subarray(4, 4 + expectedLength).toString('utf8'))
        resolve(message)
      }
    })

    process.stdin.on('error', reject)
    process.stdin.on('end', () => {
      if (expectedLength === null) {
        reject(new Error('네이티브 메시지를 읽지 못했습니다.'))
      }
    })
  })
}

function writeNativeMessage(message) {
  const json = Buffer.from(JSON.stringify(message), 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32LE(json.length, 0)
  process.stdout.write(Buffer.concat([header, json]))
}

async function codexStatus() {
  const { stdout, stderr } = await execFileAsync(CODEX_BIN, ['login', 'status'], {
    env: TOOL_ENV,
    maxBuffer: 1024 * 1024,
  })
  return (stdout || stderr).trim()
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

async function startBridge() {
  if (await isBridgeOpen()) {
    return 'Codex 브리지가 이미 실행 중입니다.'
  }

  const child = spawn(process.execPath, [BRIDGE_SCRIPT], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      CODEX_BRIDGE_HOST: '127.0.0.1',
      CODEX_BRIDGE_PORT: '4317',
    },
  })

  child.unref()
  await new Promise((resolve) => setTimeout(resolve, 600))

  return (await isBridgeOpen())
    ? 'Codex 브리지를 시작했습니다.'
    : 'Codex 브리지 시작 요청을 보냈지만 아직 연결되지 않았습니다.'
}

async function startLogin() {
  const logPath = path.join(os.tmpdir(), `kwc-codex-oauth-${Date.now()}.log`)
  const outputHandle = await open(logPath, 'a')
  const child = spawn(CODEX_BIN, ['login'], {
    cwd: REPO_ROOT,
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
    authUrl = output.match(/https:\/\/auth\.openai\.com\/oauth\/authorize\S+/u)?.[0] ?? ''

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

async function main() {
  const message = await readNativeMessage()

  if (message.type === 'codex-status') {
    const status = await codexStatus()
    writeNativeMessage({
      ok: true,
      data: {
        status,
        bridgeRunning: await isBridgeOpen(),
      },
    })
    return
  }

  if (message.type === 'start-codex-bridge') {
    writeNativeMessage({
      ok: true,
      data: {
        message: await startBridge(),
        bridgeRunning: await isBridgeOpen(),
      },
    })
    return
  }

  if (message.type === 'start-codex-login') {
    writeNativeMessage({
      ok: true,
      data: await startLogin(),
    })
    return
  }

  writeNativeMessage({ ok: false, error: '지원하지 않는 네이티브 메시지입니다.' })
}

main().catch((error) => {
  writeNativeMessage({
    ok: false,
    error: error instanceof Error ? error.message : '네이티브 호스트 처리 실패',
  })
})
