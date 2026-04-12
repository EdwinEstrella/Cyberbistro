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
