import { BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

let listenersAttached = false
let installPending = false
let installStarted = false

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

function installDownloadedUpdate() {
  if (installStarted) return
  if (updateState.phase !== 'ready') {
    installPending = true
    return
  }

  installPending = false
  installStarted = true

  setTimeout(() => {
    try {
      // Silent NSIS install avoids the Windows installer wizard swallowing the first attempt.
      autoUpdater.quitAndInstall(true, true)
    } catch (err) {
      installStarted = false
      updateState.phase = 'error'
      updateState.error = err instanceof Error ? err.message : String(err)
      log.error('quitAndInstall failed', err)
    }
  }, 250)
}

function isTransientUpdateError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return /\b(408|429|500|502|503|504)\b|timeout|network|ECONNRESET|ETIMEDOUT/i.test(message)
}

function updateErrorMessage(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (isTransientUpdateError(err)) {
    return 'No se pudo contactar GitHub para buscar actualizaciones. Verifica tu internet e intenta de nuevo en unos minutos.'
  }
  return message
}

async function checkForUpdatesWithRetry(send: (channel: string, payload?: unknown) => void, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (result?.isUpdateAvailable === false) send('update-not-available')
      return
    } catch (err) {
      const shouldRetry = attempt < attempts && isTransientUpdateError(err)
      log.warn(`checkForUpdates attempt ${attempt} failed`, err)
      if (!shouldRetry) throw err
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt))
    }
  }
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
      if (installPending) installDownloadedUpdate()
    })

    autoUpdater.on('error', (err) => {
      log.error('autoUpdater error', err)
      const message = updateErrorMessage(err)
      if (updateState.phase !== 'ready') {
        updateState.phase = 'error'
        updateState.error = message
      }
      send('update-error', message)
    })

    ipcMain.on('install-update', () => {
      if (updateState.phase !== 'ready') {
        installPending = true
        if (updateState.phase === 'available' || updateState.phase === 'error') {
          updateState.phase = 'downloading'
          updateState.error = ''
          void autoUpdater.downloadUpdate().catch((err: Error) => {
            installPending = false
            updateState.phase = 'error'
            updateState.error = updateErrorMessage(err)
            send('update-error', updateState.error)
          })
        }
        return
      }

      installDownloadedUpdate()
    })

    ipcMain.on('download-update', () => {
      updateState.phase = 'downloading'
      updateState.percent = Math.max(0, updateState.percent || 0)
      updateState.error = ''
      void autoUpdater.downloadUpdate().catch((err: Error) => {
        log.warn('downloadUpdate (IPC) failed', err)
        updateState.phase = 'error'
        updateState.error = updateErrorMessage(err)
        send('update-error', updateState.error)
      })
    })

    ipcMain.on('check-for-updates', () => {
      updateState.phase = 'checking'
      updateState.percent = 0
      updateState.error = ''
      send('checking-for-update')
      void checkForUpdatesWithRetry(send)
        .catch((err: Error) => {
          log.warn('checkForUpdates (IPC) failed', err)
          updateState.phase = 'error'
          updateState.error = updateErrorMessage(err)
          send('update-error', updateState.error)
        })
    })

    ipcMain.handle('get-update-state', () => ({ ...updateState }))
  }

  setTimeout(() => {
    void checkForUpdatesWithRetry(send)
      .catch((err) => {
        log.warn('checkForUpdates failed', err)
      })
  }, 3000)
}
