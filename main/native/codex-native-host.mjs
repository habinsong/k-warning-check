#!/usr/bin/env node
import {
  codexStatus,
  deleteSecureStoreSecret,
  getBridgeConnectionInfo,
  getSecureStoreSecret,
  getSecureStoreStatus,
  isBridgeOpen,
  setSecureStoreSecret,
  startBridge,
  startLogin,
  validateSecureStoreSecret,
} from '../electron-shared/codex-services.mjs'

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

async function main() {
  const message = await readNativeMessage()

  if (message.type === 'secure-store-status') {
    writeNativeMessage({
      ok: true,
      data: await getSecureStoreStatus(),
    })
    return
  }

  if (message.type === 'secure-store-set-secret') {
    writeNativeMessage({
      ok: true,
      data: await setSecureStoreSecret(message.provider, message.secret, message.retention),
    })
    return
  }

  if (message.type === 'secure-store-get-secret') {
    writeNativeMessage({
      ok: true,
      data: {
        provider: message.provider,
        secret: await getSecureStoreSecret(message.provider),
      },
    })
    return
  }

  if (message.type === 'secure-store-delete-secret') {
    writeNativeMessage({
      ok: true,
      data: await deleteSecureStoreSecret(message.provider),
    })
    return
  }

  if (message.type === 'secure-store-validate') {
    writeNativeMessage({
      ok: true,
      data: await validateSecureStoreSecret(message.provider),
    })
    return
  }

  if (message.type === 'codex-status') {
    writeNativeMessage({
      ok: true,
      data: {
        status: await codexStatus(),
        bridgeRunning: await isBridgeOpen(),
      },
    })
    return
  }

  if (message.type === 'get-host-info') {
    writeNativeMessage({
      ok: true,
      data: await getBridgeConnectionInfo(),
    })
    return
  }

  if (message.type === 'resolve-workspace-root') {
    writeNativeMessage({
      ok: true,
      data: await getBridgeConnectionInfo(message.preferredRoot),
    })
    return
  }

  if (message.type === 'start-codex-bridge') {
    writeNativeMessage({
      ok: true,
      data: await startBridge(Boolean(message.force)),
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
