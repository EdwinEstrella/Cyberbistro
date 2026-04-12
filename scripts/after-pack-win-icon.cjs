'use strict'

/**
 * Con `win.signAndEditExecutable: false`, electron-builder no ejecuta rcedit en el .exe
 * principal (evita winCodeSign/symlinks), y el binario queda con el icono por defecto de Electron.
 * Este hook aplica solo el .ico al ejecutable empaquetado, sin tocar la cadena de firma.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const fs = require('node:fs')
  const path = require('node:path')
  // rcedit@5 es ESM: require() devuelve { rcedit }, no la función (antes el hook fallaba y el .exe quedaba con icono de Electron).
  const { rcedit } = require('rcedit')

  const projectDir = context.packager.info.projectDir
  const iconPath = path.join(projectDir, 'icon.ico')
  if (!fs.existsSync(iconPath)) {
    console.warn('[after-pack-win-icon] No se encontró icon.ico en la raíz del proyecto.')
    return
  }

  const name = context.packager.appInfo.productFilename
  const exePath = path.join(context.appOutDir, `${name}.exe`)
  if (!fs.existsSync(exePath)) {
    console.warn('[after-pack-win-icon] No se encontró ejecutable:', exePath)
    return
  }

  await rcedit(exePath, { icon: iconPath })
  console.log('[after-pack-win-icon] Icono aplicado a', path.basename(exePath))
}
