/**
 * Genera icon.ico multi-resolución desde icon.svg (requisito habitual en Windows / electron-builder).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const svgPath = path.join(root, 'icon.svg')
const outPath = path.join(root, 'icon.ico')

// Orden de menor a mayor (convención ICO)
const sizes = [16, 24, 32, 48, 64, 128, 256]

/**
 * ICO con entradas PNG (Windows Vista+), sin dependencias con jimp/request.
 * @param {Array<{ w: number; h: number; png: Buffer }>} entries
 */
function icoFromPngEntries(entries) {
  const n = entries.length
  const headerSize = 6 + 16 * n
  let dataOffset = headerSize
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(n, 4)
  for (let i = 0; i < n; i++) {
    const { w, h, png } = entries[i]
    const dir = 6 + i * 16
    header.writeUInt8(w >= 256 ? 0 : w, dir)
    header.writeUInt8(h >= 256 ? 0 : h, dir + 1)
    header.writeUInt8(0, dir + 2)
    header.writeUInt8(0, dir + 3)
    header.writeUInt16LE(1, dir + 4)
    header.writeUInt16LE(32, dir + 6)
    header.writeUInt32LE(png.length, dir + 8)
    header.writeUInt32LE(dataOffset, dir + 12)
    dataOffset += png.length
  }
  return Buffer.concat([header, ...entries.map((e) => e.png)])
}

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.error('No existe icon.svg en la raíz del proyecto.')
    process.exit(1)
  }

  const entries = await Promise.all(
    sizes.map(async (s) => ({
      w: s,
      h: s,
      png: await sharp(svgPath).resize(s, s).png().toBuffer(),
    }))
  )

  const ico = icoFromPngEntries(entries)
  fs.writeFileSync(outPath, ico)
  console.log(`icon.ico escrito (${sizes.length} tamaños): ${outPath}`)

  // Favicon para Vite (public/ → raíz del sitio; evita icono por defecto de React/Vite en la pestaña)
  const publicDir = path.join(root, 'public')
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })
  const faviconPath = path.join(publicDir, 'favicon.ico')
  fs.copyFileSync(outPath, faviconPath)
  console.log(`public/favicon.ico actualizado (copia de icon.ico)`)

  // Linux / fallback ventana: PNG 512×512 en assets/icons/
  const assetsIcons = path.join(root, 'assets', 'icons')
  if (!fs.existsSync(assetsIcons)) fs.mkdirSync(assetsIcons, { recursive: true })
  const png512 = path.join(assetsIcons, 'icon.png')
  await sharp(svgPath).resize(512, 512).png().toFile(png512)
  console.log(`assets/icons/icon.png (512×512): ${png512}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
