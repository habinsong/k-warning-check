import { execFileSync } from 'node:child_process'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(appRoot, '..')
const buildRoot = path.join(appRoot, '.app-build')
const buildId = new Date().toISOString()
const workspacePackage = JSON.parse(await readFile(path.join(workspaceRoot, 'package.json'), 'utf8'))
const mainPackage = JSON.parse(await readFile(path.join(workspaceRoot, 'main', 'package.json'), 'utf8'))

await rm(buildRoot, { recursive: true, force: true })
await mkdir(buildRoot, { recursive: true })
await mkdir(path.join(buildRoot, 'bin'), { recursive: true })
await cp(path.join(appRoot, 'electron'), path.join(buildRoot, 'electron'), { recursive: true })
await cp(path.join(workspaceRoot, 'main', 'electron-shared'), path.join(buildRoot, 'electron-shared'), {
  recursive: true,
})
await cp(path.join(workspaceRoot, 'main', '.desktop-renderer'), path.join(buildRoot, 'renderer'), {
  recursive: true,
})
await cp(path.join(workspaceRoot, 'main', 'scripts'), path.join(buildRoot, 'scripts'), {
  recursive: true,
})

// Remove unused Tesseract WASM variants (keep only simd-lstm and relaxedsimd-lstm)
const tesseractDir = path.join(buildRoot, 'renderer', 'tesseract')
const KEEP_PREFIXES = ['tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm', 'worker']
try {
  const files = await readdir(tesseractDir)
  for (const file of files) {
    if (file === 'lang') continue
    if (KEEP_PREFIXES.some((prefix) => file.startsWith(prefix))) continue
    await rm(path.join(tesseractDir, file))
    console.log(`  Removed unused tesseract file: ${file}`)
  }
} catch { /* tesseract dir may not exist */ }

execFileSync(
  'xcrun',
  [
    'swiftc',
    path.join(appRoot, 'native', 'screen-access.swift'),
    '-framework',
    'CoreGraphics',
    '-framework',
    'Foundation',
    '-framework',
    'ScreenCaptureKit',
    '-o',
    path.join(buildRoot, 'bin', 'kwc-screen-access'),
  ],
  {
    stdio: 'inherit',
  },
)
await writeFile(
  path.join(buildRoot, 'package.json'),
  `${JSON.stringify(
    {
      name: 'k-warning-check-desktop-mac',
      version: workspacePackage.version,
      kwcDesktopBuildId: buildId,
      description: 'K-WarningCheck Desktop for macOS',
      productName: 'K-WarningCheck Desktop',
      main: 'electron/main.cjs',
      type: 'module',
      dependencies: {
        keytar: mainPackage.dependencies.keytar,
      },
    },
    null,
    2,
  )}\n`,
  'utf8',
)
await writeFile(
  path.join(buildRoot, 'README.txt'),
  'electron mac-app/.app-build/electron/main.mjs 명령으로 스테이징된 macOS 앱을 실행할 수 있습니다.\n',
  'utf8',
)
