#!/usr/bin/env node
/**
 * Generate Chrome extension PNG icons from a source image.
 *
 * Usage:
 *   node scripts/generate-icons.mjs [source-image]
 *
 * Example:
 *   node scripts/generate-icons.mjs
 *   node scripts/generate-icons.mjs public/favicon.svg
 *
 * Uses macOS `sips` (no extra dependencies needed).
 * Outputs: public/icons/icon-16.png, icon-48.png, icon-128.png
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '..', 'public', 'icons')
const defaultSource = resolve(__dirname, '..', 'public', 'favicon.svg')
const sizes = [16, 48, 128]

const sourcePath = process.argv[2] ? resolve(process.argv[2]) : defaultSource
if (!existsSync(sourcePath)) {
  console.error(`Source image not found: ${sourcePath}`)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })

for (const size of sizes) {
  const outFile = resolve(outDir, `icon-${size}.png`)
  execSync(`sips -z ${size} ${size} -s format png "${sourcePath}" --out "${outFile}"`, { stdio: 'pipe' })
  console.log(`  Created ${outFile} (${size}x${size})`)
}

console.log('\nDone! Icons generated in public/icons/')
