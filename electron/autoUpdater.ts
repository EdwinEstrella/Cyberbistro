import { BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

let listenersAttached = false

type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'unsupported'

type UpdateState = {
  phase: UpdatePhase
  remoteVersion: string | null
  downloadedVersion: string | null
  percent: number
  error: string
}

const updateState: UpdateState = {
  phase: 'idle',
  remoteVersion: null,
  downloadedVersion: null,
  percent: 0,
  error: '',
}

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
  autoUpdater.autoDownload = false
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
      updateState.phase = 'available'
      updateState.remoteVersion = info.version ?? null
      updateState.downloadedVersion = null
      updateState.percent = 0
      updateState.error = ''
      send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      })
    })

    autoUpdater.on('update-not-available', () => {
      if (updateState.phase !== 'ready') {
        updateState.phase = 'idle'
        updateState.percent = 0
      }
      send('update-not-available')
    })

    autoUpdater.on('download-progress', (progress) => {
      updateState.phase = 'downloading'
      updateState.percent = Math.round(progress.percent)
      updateState.error = ''
      send('download-progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      updateState.phase = 'ready'
      updateState.downloadedVersion = info.version ?? null
      updateState.percent = 100
      updateState.error = ''
      send('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      })
    })

    autoUpdater.on('error', (err) => {
      log.error('autoUpdater error', err)
      if (updateState.phase !== 'ready') {
        updateState.phase = 'error'
        updateState.error = err?.message ? String(err.message) : String(err)
      }
      send('update-error', err.message)
    })

    ipcMain.on('install-update', () => {
      autoUpdater.quitAndInstall(false, true)
    })

    ipcMain.on('download-update', () => {
      updateState.phase = 'downloading'
      updateState.percent = Math.max(0, updateState.percent || 0)
      updateState.error = ''
      void autoUpdater.downloadUpdate().catch((err: Error) => {
        log.warn('downloadUpdate (IPC) failed', err)
        updateState.phase = 'error'
        updateState.error = err?.message ? String(err.message) : String(err)
        send('update-error', updateState.error)
      })
    })

    ipcMain.on('check-for-updates', () => {
      updateState.phase = 'checking'
      updateState.percent = 0
      updateState.error = ''
      send('checking-for-update')
      void autoUpdater
        .checkForUpdates()
        .then((result) => {
          // Tras un check previo (p. ej. al abrir la app), a veces el promise resuelve
          // sin volver a emitir `update-not-available` y el renderer queda en "Buscando…".
          if (result?.isUpdateAvailable === false) send('update-not-available')
        })
        .catch((err: Error) => {
          log.warn('checkForUpdates (IPC) failed', err)
          updateState.phase = 'error'
          updateState.error = err?.message ? String(err.message) : String(err)
          send('update-error', err?.message ? String(err.message) : String(err))
        })
    })

    ipcMain.handle('get-update-state', () => ({ ...updateState }))
  }

  setTimeout(() => {
    void autoUpdater
      .checkForUpdates()
      .then((result) => {
        if (result?.isUpdateAvailable === false) send('update-not-available')
      })
      .catch((err) => {
        log.warn('checkForUpdates failed', err)
      })
  }, 3000)
}
