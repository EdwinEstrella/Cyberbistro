import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupAutoUpdater } from './autoUpdater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | null = null

/** Debe coincidir con `build.appId` en package.json (atajos NSIS + barra de tareas Windows). */
const WINDOWS_APP_USER_MODEL_ID = 'com.edwin.cyberbistro'

function resolveWindowsTrayIconPath(): string {
  return path.resolve(
    app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(__dirname, '../icon.ico')
  )
}

function applyWindowsTaskbarIdentity(win: BrowserWindow) {
  if (process.platform !== 'win32') return
  const iconPath = resolveWindowsTrayIconPath()
  try {
    win.setAppDetails({
      appId: WINDOWS_APP_USER_MODEL_ID,
      appIconPath: iconPath,
      relaunchCommand: process.execPath,
      relaunchDisplayName: 'Cyberbistro',
    })
  } catch (e) {
    console.warn('setAppDetails failed:', e)
  }
}

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
      const printWin = new BrowserWindow({
        width: 420,
        height: 900,
        show: false,
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
          const silent = Boolean(opts.silent && opts.deviceName)
          printWin.webContents.print(
            {
              silent,
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

// Detect if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    titleBarStyle: 'hidden',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(__dirname, '../icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

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

  // Maximize window on startup
  mainWindow.maximize()

  // Notify renderer when window is maximized/unmaximized
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized', false)
  })

  applyWindowsTaskbarIdentity(mainWindow)
}

// Window controls handlers
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
  if (process.platform === 'win32') {
    app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID)
  }

  createWindow()

  if (app.isPackaged) {
    setupAutoUpdater(() => mainWindow)
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