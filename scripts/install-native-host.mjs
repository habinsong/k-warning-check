import { chmod, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const hostScript = path.join(repoRoot, 'native', 'codex-native-host.mjs')
const hostWrapper = path.join(repoRoot, 'native', 'codex-native-host')
const targetDir = path.join(
  process.env.HOME,
  'Library',
  'Application Support',
  'Google',
  'Chrome',
  'NativeMessagingHosts',
)
const targetManifest = path.join(targetDir, 'kr.k_warning_check.codex.json')
const manifest = {
  name: 'kr.k_warning_check.codex',
  description: 'K-워닝체크 Codex Native Host',
  path: hostWrapper,
  type: 'stdio',
  allowed_origins: ['chrome-extension://lmacmoffmdjjabkdkabfpfefdamlkcgg/'],
}

const wrapperScript = `#!/bin/zsh
export PATH="${path.dirname(process.execPath)}:${process.env.HOME}/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
exec "${process.execPath}" "${hostScript}"
`

await chmod(hostScript, 0o755)
await writeFile(hostWrapper, wrapperScript, 'utf8')
await chmod(hostWrapper, 0o755)
await mkdir(targetDir, { recursive: true })
await writeFile(targetManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(`네이티브 호스트를 설치했습니다: ${targetManifest}`)
console.log(`네이티브 호스트 실행 래퍼: ${hostWrapper}`)
