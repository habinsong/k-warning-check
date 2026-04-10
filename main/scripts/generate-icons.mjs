#!/usr/bin/env node
/**
 * Generate Chrome extension PNG icons from a source image.
 *
 * Usage:
 *   node scripts/generate-icons.mjs <source-image>
 *
 * Example:
 *   node scripts/generate-icons.mjs ~/Downloads/app-logo.png
 *
 * Uses macOS `sips` (no extra dependencies needed).
 * Outputs: public/icons/icon-16.png, icon-48.png, icon-128.png
 */

import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '..', 'public', 'icons')
const sizes = [16, 48, 128]

const source = process.argv[2]
if (!source) {
  console.error('Usage: node scripts/generate-icons.mjs <source-image>')
  console.error('  e.g. node scripts/generate-icons.mjs ~/Downloads/app-logo.png')
  process.exit(1)
}

const sourcePath = resolve(source)
if (!existsSync(sourcePath)) {
  console.error(`Source image not found: ${sourcePath}`)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })

for (const size of sizes) {
  const outFile = resolve(outDir, `icon-${size}.png`)
  cpSync(sourcePath, outFile)
  execSync(`sips -z ${size} ${size} -s format png "${outFile}"`, { stdio: 'pipe' })
  console.log(`  Created ${outFile} (${size}x${size})`)
}

console.log('\nDone! Icons generated in public/icons/')
