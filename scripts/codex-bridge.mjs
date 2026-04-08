import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PORT = Number(process.env.CODEX_BRIDGE_PORT || 4317)
const HOST = process.env.CODEX_BRIDGE_HOST || '127.0.0.1'
const CODEX_PATH_CANDIDATES = [
  process.env.CODEX_BIN,
  path.join(process.env.HOME ?? '', '.npm-global', 'bin', 'codex'),
  '/usr/local/bin/codex',
  '/opt/homebrew/bin/codex',
].filter(Boolean)
const CODEX_BIN = CODEX_PATH_CANDIDATES.find((candidate) => existsSync(candidate)) ?? 'codex'
const TOOL_ENV = {
  ...process.env,
  PATH: [
    path.dirname(process.execPath),
    path.join(process.env.HOME ?? '', '.npm-global', 'bin'),
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

async function runCodex(prompt, workspaceRoot, options = {}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'kwc-codex-'))
  const outputFile = path.join(tempDir, 'output.txt')
  const images = Array.isArray(options.images) ? options.images : []
  const model = typeof options.model === 'string' && options.model.trim() ? options.model.trim() : ''
  const reasoningEffort =
    typeof options.reasoningEffort === 'string' && options.reasoningEffort.trim()
      ? options.reasoningEffort.trim()
      : ''
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--ephemeral',
    '--output-last-message',
    outputFile,
    '-C',
    workspaceRoot,
  ]

  for (const image of images) {
    args.push('--image', image)
  }

  if (images.length > 0) {
    args.push('--add-dir', tempDir)
  }

  if (model) {
    args.push('-m', model)
  }

  if (reasoningEffort) {
    args.push('-c', `model_reasoning_effort="${reasoningEffort}"`)
  }

  args.push('-')

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(CODEX_BIN, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: TOOL_ENV,
      })

      let stderr = ''
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk)
      })

      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) {
          resolve(undefined)
          return
        }

        reject(new Error(stderr.trim() || `Codex 실행 실패: ${code}`))
      })

      child.stdin.write(prompt)
      child.stdin.end()
    })

    return (await readFile(outputFile, 'utf8')).trim()
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function parseDataUrl(imageDataUrl) {
  const match = String(imageDataUrl).match(/^data:(.+?);base64,(.+)$/)

  if (!match) {
    throw new Error('이미지 데이터 URL 형식을 해석하지 못했습니다.')
  }

  const mimeType = match[1]
  const base64 = match[2]
  const extension =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/webp'
        ? 'webp'
        : mimeType === 'image/gif'
          ? 'gif'
          : 'jpg'

  return {
    mimeType,
    buffer: Buffer.from(base64, 'base64'),
    extension,
  }
}

async function getCodexStatus() {
  const { stdout, stderr } = await execFileAsync(CODEX_BIN, ['login', 'status'], {
    env: TOOL_ENV,
    maxBuffer: 1024 * 1024,
  })
  return (stdout || stderr).trim()
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  response.end(JSON.stringify(body))
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { ok: false, error: 'URL이 없습니다.' })
    return
  }

  if (request.method === 'OPTIONS') {
    sendJson(response, 200, { ok: true })
    return
  }

  try {
    if (request.method === 'GET' && request.url === '/health') {
      const status = await getCodexStatus()
      sendJson(response, 200, {
        ok: true,
        data: {
          status,
          command: 'codex login',
          message: 'Codex CLI 로그인 상태를 확인했습니다.',
        },
      })
      return
    }

    if (request.method === 'POST' && request.url === '/summarize') {
      const chunks = []
      for await (const chunk of request) {
        chunks.push(chunk)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const message = await runCodex(body.prompt, body.workspaceRoot || process.cwd(), {
        model: body.model,
        reasoningEffort: body.reasoningEffort,
      })
      sendJson(response, 200, { ok: true, data: { message } })
      return
    }

    if (request.method === 'POST' && request.url === '/ocr-image') {
      const chunks = []
      for await (const chunk of request) {
        chunks.push(chunk)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'kwc-codex-image-'))

      try {
        const { buffer, extension } = parseDataUrl(body.imageDataUrl)
        const imagePath = path.join(tempDir, `input.${extension}`)
        await writeFile(imagePath, buffer)

        const message = await runCodex(
          [
            '첨부한 이미지를 OCR처럼 읽고 보이는 글자를 한국어로 그대로 추출해 주세요.',
            '설명, 요약, 해설 없이 텍스트만 반환하세요.',
            '줄바꿈은 원문 구조를 최대한 유지하세요.',
          ].join(' '),
          body.workspaceRoot || process.cwd(),
          {
            model: body.model,
            reasoningEffort: body.reasoningEffort,
            images: [imagePath],
          },
        )

        sendJson(response, 200, { ok: true, data: { message } })
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
      return
    }

    sendJson(response, 404, { ok: false, error: '지원하지 않는 경로입니다.' })
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Codex 브리지 처리 실패',
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`KWC Codex bridge listening on http://${HOST}:${PORT}`)
})
