'use strict'

/**
 * Sustituye el icono de node_modules/electron/dist/electron.exe (Windows) por icon.ico.
 * Así `npm run dev` ya no muestra el logo de Electron en barra de tareas / administrador de tareas.
 */
const fs = require('node:fs')
const path = require('node:path')
const { rcedit } = require('rcedit')

if (process.platform !== 'win32') {
  process.exit(0)
}

const root = path.join(__dirname, '..')
const iconPath = path.join(root, 'icon.ico')
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')

if (!fs.existsSync(electronExe)) {
  console.warn(
    '[patch-dev-electron-icon] No se encontró electron.exe; se omite (instalación incompleta o sin Electron).'
  )
  process.exit(0)
}

if (!fs.existsSync(iconPath)) {
  console.warn(
    '[patch-dev-electron-icon] Falta icon.ico en la raíz. Ejecuta: npm run icon:build'
  )
  process.exit(0)
}

;(async () => {
  try {
    await rcedit(electronExe, { icon: iconPath })
    console.log('[patch-dev-electron-icon] Icono de Cyberbistro aplicado a electron.exe (modo dev).')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[patch-dev-electron-icon] No se pudo parchear electron.exe:', msg)
    process.exit(0)
  }
})()
