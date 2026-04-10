import { rm } from 'node:fs/promises'

await rm(new URL('../.desktop-renderer', import.meta.url), {
  recursive: true,
  force: true,
})
