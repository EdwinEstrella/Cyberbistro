import { contextBridge, ipcRenderer } from 'electron'

function isPrintThermalPayload(v: unknown): v is {
  html: string
  deviceName?: string
  silent?: boolean
  paperWidthMm?: number
} {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (typeof o.html !== 'string' || o.html.length === 0) return false
  if (o.html.length > 5_000_000) return false
  if (o.deviceName !== undefined && typeof o.deviceName !== 'string') return false
  if (o.silent !== undefined && typeof o.silent !== 'boolean') return false
  if (
    o.paperWidthMm !== undefined &&
    (typeof o.paperWidthMm !== 'number' || !Number.isFinite(o.paperWidthMm))
  ) {
    return false
  }
  return true
}

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => {
    console.log('preload: minimize called')
    ipcRenderer.send('window-minimize')
  },
  maximize: () => {
    console.log('preload: maximize called')
    ipcRenderer.send('window-maximize')
  },
  close: () => {
    console.log('preload: close called')
    ipcRenderer.send('window-close')
  },
  getVersions: () => process.versions,
  onWindowMaximized: (callback: (isMaximized: boolean) => void) => {
    const listener = (_: any, isMaximized: boolean) => callback(isMaximized)
    ipcRenderer.on('window-maximized', listener)
    return () => {
      ipcRenderer.removeListener('window-maximized', listener)
    }
  },
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  printThermal: (opts: unknown) => {
    if (!isPrintThermalPayload(opts)) {
      return Promise.resolve({ ok: false, error: 'Payload de impresión inválido' })
    }
    return ipcRenderer.invoke('print:thermal', opts)
  },
  checkForUpdates: () => {
    ipcRenderer.send('check-for-updates')
  },
  downloadUpdate: () => {
    ipcRenderer.send('download-update')
  },
  installUpdate: () => {
    ipcRenderer.send('install-update')
  },
  getUpdateState: () => ipcRenderer.invoke('get-update-state'),
  onUpdateEvents(handlers: {
    onChecking?: () => void
    onUpdateAvailable?: (info: unknown) => void
    onUpdateNotAvailable?: () => void
    onDownloadProgress?: (progress: unknown) => void
    onUpdateDownloaded?: (info: unknown) => void
    onUpdateError?: (payload: unknown) => void
  }) {
    const onChecking = () => handlers.onChecking?.()
    const onAvailable = (_e: unknown, info: unknown) => handlers.onUpdateAvailable?.(info)
    const onNotAvailable = () => handlers.onUpdateNotAvailable?.()
    const onProgress = (_e: unknown, progress: unknown) => handlers.onDownloadProgress?.(progress)
    const onDownloaded = (_e: unknown, info: unknown) => handlers.onUpdateDownloaded?.(info)
    const onError = (_e: unknown, payload: unknown) => handlers.onUpdateError?.(payload)

    if (handlers.onChecking) ipcRenderer.on('checking-for-update', onChecking)
    if (handlers.onUpdateAvailable) ipcRenderer.on('update-available', onAvailable)
    if (handlers.onUpdateNotAvailable) ipcRenderer.on('update-not-available', onNotAvailable)
    if (handlers.onDownloadProgress) ipcRenderer.on('download-progress', onProgress)
    if (handlers.onUpdateDownloaded) ipcRenderer.on('update-downloaded', onDownloaded)
    if (handlers.onUpdateError) ipcRenderer.on('update-error', onError)

    return () => {
      if (handlers.onChecking) ipcRenderer.removeListener('checking-for-update', onChecking)
      if (handlers.onUpdateAvailable) ipcRenderer.removeListener('update-available', onAvailable)
      if (handlers.onUpdateNotAvailable) ipcRenderer.removeListener('update-not-available', onNotAvailable)
      if (handlers.onDownloadProgress) ipcRenderer.removeListener('download-progress', onProgress)
      if (handlers.onUpdateDownloaded) ipcRenderer.removeListener('update-downloaded', onDownloaded)
      if (handlers.onUpdateError) ipcRenderer.removeListener('update-error', onError)
    }
  },
})

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector: string, text: string) => {
    const element = document.getElementById(selector)
    if (element) element.textContent = text
  }

  for (const type of ['chrome', 'node', 'electron'] as const) {
    replaceText(`${type}-version`, process.versions[type])
  }
})