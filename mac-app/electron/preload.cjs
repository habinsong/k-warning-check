const { existsSync } = require('node:fs')
const path = require('node:path')

const shellDir = __dirname
const localSharedEntry = path.resolve(shellDir, '..', 'electron-shared', 'shared-preload.cjs')
const sourceSharedEntry = path.resolve(shellDir, '..', '..', 'main', 'electron-shared', 'shared-preload.cjs')
const sharedEntry = existsSync(localSharedEntry) ? localSharedEntry : sourceSharedEntry

require(sharedEntry)
