import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupAutoUpdater } from './autoUpdater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | null = null

/** Una sola instancia: evita iconos duplicados en la barra de tareas (Windows) y re-enfoca la ventana. */
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

/** Debe coincidir con `build.appId` en package.json (atajos NSIS + barra de tareas Windows). */
const WINDOWS_APP_USER_MODEL_ID = 'com.edwin.cloudix'

/** Antes de `ready`: el shell de Windows asocia mejor el icono del botón de la barra de tareas. */
if (gotTheLock && process.platform === 'win32') {
  app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID)
}

/**
 * RelaunchIconResource: el shell usa el icono embebido en el .exe.
 * - Instalado: Cloudix.exe (afterPack + rcedit).
 * - Dev: electron.exe parcheado en postinstall con scripts/patch-dev-electron-icon.cjs.
 */
function windowsTaskbarRelaunchIcon(): { appIconPath: string; appIconIndex: number } {
  return { appIconPath: process.execPath, appIconIndex: 0 }
}

function applyWindowsTaskbarIdentity(win: BrowserWindow) {
  if (process.platform !== 'win32') return
  const { appIconPath, appIconIndex } = windowsTaskbarRelaunchIcon()
  try {
    win.setAppDetails({
      appId: WINDOWS_APP_USER_MODEL_ID,
      appIconPath,
      appIconIndex,
      relaunchCommand: process.execPath,
      relaunchDisplayName: 'Cloudix',
    })
  } catch (e) {
    console.warn('setAppDetails failed:', e)
  }
}

function loadWindowIconImage(): NativeImage | undefined {
  const raw = resolveWindowIconPath()
  const abs = path.resolve(raw)
  if (!fs.existsSync(abs)) return undefined
  const img = nativeImage.createFromPath(abs)
  return img.isEmpty() ? undefined : img
}

/**
 * Windows/macOS: ruta fija a icon.ico (comportamiento alineado con b112a4a; evita fallos de icono en
 * acceso directo / barra de tareas por comprobar exists y caer en PNG dentro del asar).
 * Linux: PNG empaquetado o en dev si existe.
 */
function resolveWindowIconPath(): string {
  if (process.platform === 'linux') {
    const pngPackaged = path.join(process.resourcesPath, 'icon.png')
    const pngDev = path.join(__dirname, '../assets/icons/icon.png')
    if (app.isPackaged && fs.existsSync(pngPackaged)) return pngPackaged
    if (!app.isPackaged && fs.existsSync(pngDev)) return pngDev
  }

  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico')
  }
  const fromAppRoot = path.join(app.getAppPath(), 'icon.ico')
  if (fs.existsSync(fromAppRoot)) return fromAppRoot
  return path.join(__dirname, '../icon.ico')
}

function createWindow() {
  const iconImage = loadWindowIconImage()

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    titleBarStyle: 'hidden',
    ...(iconImage ? { icon: iconImage } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  applyWindowsTaskbarIdentity(mainWindow)

  // Load from Vite dev server in development, or from files in production
  // VITE_DEV_SERVER_URL is set by vite-plugin-electron during development
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html')
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('loadFile failed:', indexPath, err)
    })
    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error('did-fail-load:', { code, desc, url })
    })
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    applyWindowsTaskbarIdentity(mainWindow)
    const img = loadWindowIconImage()
    if (img) mainWindow.setIcon(img)
  })

  // Maximize window on startup
  mainWindow.maximize()

  // Notify renderer when window is maximized/unmaximized
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized', false)
  })
}

if (gotTheLock) {
  ipcMain.handle('printers:list', async () => {
    const w = mainWindow || BrowserWindow.getAllWindows()[0]
    if (!w) return []
    try {
      const list = await w.webContents.getPrintersAsync()
      return list.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        description: p.description || '',
        isDefault: Boolean((p as { isDefault?: boolean }).isDefault),
      }))
    } catch (e) {
      console.error('printers:list', e)
      return []
    }
  })

  ipcMain.handle(
    'print:thermal',
    async (
      _event,
      opts: { html: string; deviceName?: string; silent?: boolean; paperWidthMm?: number }
    ): Promise<{ ok: boolean; error?: string }> => {
      return new Promise((resolve) => {
        // Ventana oculta solo para cargar data: URL e invocar webContents.print().
        // sandbox: false — requerido en algunos entornos para loadURL(data:) + impresión.
        // webSecurity/contextIsolation activos (sin nodeIntegration) limitan riesgo frente a HTML arbitrario del renderer.
        const printWin = new BrowserWindow({
          width: 420,
          height: 900,
          show: false,
          backgroundColor: '#ffffff',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
          },
        })

        const fail = (msg: string) => {
          if (!printWin.isDestroyed()) printWin.close()
          resolve({ ok: false, error: msg })
        }

        const timer = setTimeout(() => fail('Tiempo de impresión agotado'), 45000)

        printWin.webContents.once('did-fail-load', (_e, code, desc) => {
          clearTimeout(timer)
          fail(`Carga fallida: ${code} ${desc}`)
        })

        printWin.webContents.once('did-finish-load', () => {
          setTimeout(() => {
            // Siempre con diálogo de impresión (no silencioso), para elegir impresora y opciones en cada ticket.
            printWin.webContents.print(
              {
                silent: false,
                printBackground: true,
                deviceName: opts.deviceName || undefined,
              },
              (success, failureReason) => {
                clearTimeout(timer)
                if (!printWin.isDestroyed()) printWin.close()
                if (success) resolve({ ok: true })
                else resolve({ ok: false, error: String(failureReason || 'Error de impresión') })
              }
            )
          }, 450)
        })

        const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(opts.html)
        printWin.loadURL(url).catch((err) => {
          clearTimeout(timer)
          fail(err instanceof Error ? err.message : String(err))
        })
      })
    }
  )

  // Window controls handlers (solo instancia principal)
  ipcMain.on('window-minimize', () => {
    console.log('main: window-minimize received')
    if (mainWindow) {
      mainWindow.minimize()
      console.log('main: window minimized')
    }
  })

  ipcMain.on('window-maximize', () => {
    console.log('main: window-maximize received')
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
        console.log('main: window unmaximized')
      } else {
        mainWindow.maximize()
        console.log('main: window maximized')
      }
    }
  })

  ipcMain.on('window-close', () => {
    console.log('main: window-close received')
    if (mainWindow) {
      mainWindow.close()
      console.log('main: window closed')
    }
  })

  app.whenReady().then(() => {
    createWindow()

    if (app.isPackaged) {
      setupAutoUpdater(() => mainWindow)
    } else {
      // En dev `setupAutoUpdater` no corre; el renderer igual llama `getUpdateState()` → IPC sin handler.
      ipcMain.removeHandler('get-update-state')
      ipcMain.handle('get-update-state', () => ({
        phase: 'unsupported' as const,
        remoteVersion: null,
        downloadedVersion: null,
        percent: 0,
        error: '',
      }))
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}