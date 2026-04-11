'use strict'

const { contextBridge, ipcRenderer } = require('electron')

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
  onWindowMaximized: (callback) => {
    const listener = (_, isMaximized) => callback(isMaximized)
    ipcRenderer.on('window-maximized', listener)
    return () => {
      ipcRenderer.removeListener('window-maximized', listener)
    }
  },
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  printThermal: (opts) => ipcRenderer.invoke('print:thermal', opts),
  checkForUpdates: () => {
    ipcRenderer.send('check-for-updates')
  },
  installUpdate: () => {
    ipcRenderer.send('install-update')
  },
  onUpdateEvents(handlers) {
    const onAvailable = (_e, info) => handlers.onUpdateAvailable?.(info)
    const onNotAvailable = () => handlers.onUpdateNotAvailable?.()
    const onProgress = (_e, progress) => handlers.onDownloadProgress?.(progress)
    const onDownloaded = (_e, info) => handlers.onUpdateDownloaded?.(info)
    const onError = (_e, message) => handlers.onUpdateError?.(message)

    if (handlers.onUpdateAvailable) ipcRenderer.on('update-available', onAvailable)
    if (handlers.onUpdateNotAvailable) ipcRenderer.on('update-not-available', onNotAvailable)
    if (handlers.onDownloadProgress) ipcRenderer.on('download-progress', onProgress)
    if (handlers.onUpdateDownloaded) ipcRenderer.on('update-downloaded', onDownloaded)
    if (handlers.onUpdateError) ipcRenderer.on('update-error', onError)

    return () => {
      if (handlers.onUpdateAvailable) ipcRenderer.removeListener('update-available', onAvailable)
      if (handlers.onUpdateNotAvailable) ipcRenderer.removeListener('update-not-available', onNotAvailable)
      if (handlers.onDownloadProgress) ipcRenderer.removeListener('download-progress', onProgress)
      if (handlers.onUpdateDownloaded) ipcRenderer.removeListener('update-downloaded', onDownloaded)
      if (handlers.onUpdateError) ipcRenderer.removeListener('update-error', onError)
    }
  },
})

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.textContent = text
  }
  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }
})
