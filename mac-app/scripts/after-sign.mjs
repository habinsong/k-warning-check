import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

function readBundleIdentifier(appPath) {
  const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist')

  return execFileSync(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print:CFBundleIdentifier', infoPlistPath],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  )
    .trim()
}

export default async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  )
  const helperPath = path.join(
    appPath,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'bin',
    'kwc-screen-access',
  )
  const appIdentifier =
    readBundleIdentifier(appPath) ||
    String(context.packager.appInfo.id || 'kr.kwarningcheck.desktop.mac')

  if (!existsSync(appPath) || !existsSync(helperPath)) {
    return
  }

  execFileSync(
    'codesign',
    [
      '--force',
      '--sign',
      '-',
      '--options',
      'runtime',
      '--identifier',
      appIdentifier,
      helperPath,
    ],
    {
      stdio: 'inherit',
    },
  )

}
