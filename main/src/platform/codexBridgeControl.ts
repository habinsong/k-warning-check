type RestartHandler = () => Promise<void>

let restartHandler: RestartHandler | null = null

export function setCodexBridgeRestartHandler(handler: RestartHandler | null) {
  restartHandler = handler
}

export async function restartCodexBridge() {
  if (!restartHandler) {
    throw new Error('Codex 연결 재시작 핸들러가 연결되지 않았습니다.')
  }

  await restartHandler()
}
