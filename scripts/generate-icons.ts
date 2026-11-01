/*
  Generates the extension's PNG icons from the DevWallet SVG logo, replacing the icon@* and icon-dev@* files.
  The -dev build uses devwallet-logo-dev.svg: the same mark with a Signal Blue rim, so both builds can be told apart
  in the toolbar. Requires `sharp`. Run with: bun scripts/generate-icons.ts
*/

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const projectRoot = resolve(__dirname, '..')
const iconsDir = resolve(projectRoot, 'public', 'icons')

const sizes = [16, 32, 48, 128]
const variants = [
  { svg: 'devwallet-logo.svg', prefix: 'icon' },
  { svg: 'devwallet-logo-dev.svg', prefix: 'icon-dev' },
]

async function ensureDirFor(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true })
}

async function run() {
  await Promise.all(
    variants.flatMap(({ svg, prefix }) =>
      sizes.map(async (size) => {
        const svgBuffer = await readFile(resolve(iconsDir, svg))
        const file = `${prefix}@${size}w.png`
        const outPath = resolve(iconsDir, file)
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
    ),
  )
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate icons', err)
  process.exit(1)
})
