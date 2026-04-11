/**
 * Genera icon.ico multi-resolución desde icon.svg (requisito habitual en Windows / electron-builder).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import toIco from 'to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const svgPath = path.join(root, 'icon.svg')
const outPath = path.join(root, 'icon.ico')

// Orden de menor a mayor (convención ICO)
const sizes = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.error('No existe icon.svg en la raíz del proyecto.')
    process.exit(1)
  }

  const buffers = await Promise.all(
    sizes.map((s) => sharp(svgPath).resize(s, s).png().toBuffer())
  )

  const ico = await toIco(buffers)
  fs.writeFileSync(outPath, ico)
  console.log(`icon.ico escrito (${sizes.length} tamaños): ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
