import { BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

let listenersAttached = false

function getTargetWindow(getMain: () => BrowserWindow | null) {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) return focused
  const main = getMain()
  if (main && !main.isDestroyed()) return main
  const all = BrowserWindow.getAllWindows()
  return all.find((w) => !w.isDestroyed()) ?? null
}

export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null) {
  autoUpdater.logger = log
  autoUpdater.logger.transports.file.level = 'info'
  autoUpdater.autoDownload = true
  if (process.platform === 'win32' && !process.env.CSC_LINK && !process.env.WIN_CSC_LINK) {
    autoUpdater.verifyUpdateCodeSignature = false
  }

  const send = (channel: string, payload?: unknown) => {
    const win = getTargetWindow(getMainWindow)
    if (win) win.webContents.send(channel, payload)
  }

  if (!listenersAttached) {
    listenersAttached = true

    autoUpdater.on('update-available', (info) => {
      send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      })
    })

    autoUpdater.on('update-not-available', () => {
      send('update-not-available')
    })

    autoUpdater.on('download-progress', (progress) => {
      send('download-progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      send('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      })
    })

    autoUpdater.on('error', (err) => {
      log.error('autoUpdater error', err)
      send('update-error', err.message)
    })

    ipcMain.on('install-update', () => {
      autoUpdater.quitAndInstall(false, true)
    })

    ipcMain.on('check-for-updates', () => {
      autoUpdater.checkForUpdates().catch((err) => {
        log.warn('checkForUpdates (IPC) failed', err)
      })
    })
  }

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('checkForUpdates failed', err)
    })
  }, 3000)
}
