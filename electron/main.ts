import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | null = null

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
      preload: path.join(__dirname, 'preload.js'), // preload.js en el mismo dir que main.js
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
    // When packaged with Electron Forge, load the built index.html
    // The dist folder should be in the root of app.asar
    const indexPath = path.join(__dirname, '../dist/index.html')
    mainWindow.loadFile(indexPath)
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
  createWindow()

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