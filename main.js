import { app, BrowserWindow, ipcMain } from 'electron/main'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow = null

// Detect if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Load from Vite dev server in development, or from files in production
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile('index.html')
  }

  // Maximize window on startup
  mainWindow.maximize()

  // Notify renderer when window is maximized/unmaximized
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized', false)
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