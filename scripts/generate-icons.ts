/*
  Generates PNG icons from the DevWallet SVG logo for all required sizes, replacing existing icon@* files.
  Requires `sharp` as a dependency. Install with: yarn add -D sharp
*/

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const projectRoot = resolve(__dirname, '..')
const svgPath = resolve(projectRoot, 'public', 'icons', 'devwallet-logo.svg')

// Files to generate: both normal and -dev variants to keep manifest mappings intact
const sizes = [16, 32, 48, 128]
const outputs = [
  ...sizes.map((s) => ({ size: s, file: `icon@${s}w.png` })),
  ...sizes.map((s) => ({ size: s, file: `icon-dev@${s}w.png` })),
]

async function ensureDirFor(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true })
}

async function run() {
  const svgBuffer = await readFile(svgPath)

  await Promise.all(
    outputs.map(async ({ size, file }) => {
      const outPath = resolve(projectRoot, 'public', 'icons', file)
      await ensureDirFor(outPath)
      const png = await sharp(svgBuffer, { density: 384 })
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer()
      await writeFile(outPath, png)
      // eslint-disable-next-line no-console
      console.log(`Wrote ${file}`)
    }),
  )
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate icons', err)
  process.exit(1)
})
