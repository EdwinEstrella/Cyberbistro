'use strict'

const { contextBridge, ipcRenderer } = require('electron')

function isPrintThermalPayload(v) {
  if (v === null || typeof v !== 'object') return false
  if (typeof v.html !== 'string' || v.html.length === 0) return false
  if (v.html.length > 5_000_000) return false
  if (v.deviceName !== undefined && typeof v.deviceName !== 'string') return false
  if (v.silent !== undefined && typeof v.silent !== 'boolean') return false
  if (
    v.paperWidthMm !== undefined &&
    (typeof v.paperWidthMm !== 'number' || !Number.isFinite(v.paperWidthMm))
  ) {
    return false
  }
  return true
}

function isOpenCashDrawerPayload(v) {
  if (v === undefined) return true
  if (v === null || typeof v !== 'object') return false
  if (v.deviceName !== undefined && typeof v.deviceName !== 'string') return false
  if (
    v.paperWidthMm !== undefined &&
    (typeof v.paperWidthMm !== 'number' || !Number.isFinite(v.paperWidthMm))
  ) {
    return false
  }
  return true
}

function isEcfCertificatePayload(v) {
  if (v === null || typeof v !== 'object') return false
  return (
    typeof v.tenantId === 'string' && /^[0-9a-f-]{36}$/i.test(v.tenantId) &&
    typeof v.environment === 'string' && ['test', 'certification', 'production'].includes(v.environment) &&
    typeof v.certificateBase64 === 'string' && v.certificateBase64.length > 0 && v.certificateBase64.length <= 20_000_000 &&
    typeof v.passphrase === 'string' && v.passphrase.length > 0 && v.passphrase.length <= 1024
  )
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
  ensureInputFocus: () => ipcRenderer.invoke('window:ensure-input-focus'),
  getTenantStoreStatus: () => ipcRenderer.invoke('tenant-store:status'),
  listSavedAccounts: () => ipcRenderer.invoke('saved-accounts:list'),
  saveSavedAccount: (account) => ipcRenderer.invoke('saved-accounts:save', account),
  getSavedAccountCredential: (id) => ipcRenderer.invoke('saved-accounts:credential', { id }),
  deleteSavedAccount: (id) => ipcRenderer.invoke('saved-accounts:delete', { id }),
  saveDeviceSessionPreference: (preference) => ipcRenderer.invoke('device-session:save-preference', preference),
  getDeviceSessionPreference: (identity) => ipcRenderer.invoke('device-session:read-preference', identity),
  executeCatalogCommand: (command) => ipcRenderer.invoke('catalog-repository:execute', command),
  executeOrdersCommand: (command) => ipcRenderer.invoke('orders-repository:execute', command),
  executeSalesFiscalCommand: (command) => ipcRenderer.invoke('sales-fiscal-repository:execute', command),
  executeCashPurchaseCommand: (command) => ipcRenderer.invoke('cash-purchase-repository:execute', command),
  executePayrollCommand: (command) => ipcRenderer.invoke('payroll-repository:execute', command),
  setPayrollSyncAccessToken: (accessToken) => ipcRenderer.invoke('payroll-sync:set-access-token', accessToken === null ? null : { accessToken }),
  executeReceivablesCommand: (command) => ipcRenderer.invoke('receivables-repository:execute', command),
  executePayablesCommand: (command) => ipcRenderer.invoke('payables-repository:execute', command),
  executeExpenseCommand: (command) => ipcRenderer.invoke('expense-repository:execute', command),
  listExpenses: (filter) => ipcRenderer.invoke('expenses:list', filter),
  listExpenseCategories: () => ipcRenderer.invoke('expense-categories:list'),
  importLegacyIndexedDb: (payload) => ipcRenderer.invoke('tenant-store:import-indexeddb', payload),
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
  printThermal: (opts) => {
    if (!isPrintThermalPayload(opts)) {
      return Promise.resolve({ ok: false, error: 'Payload de impresión inválido' })
    }
    return ipcRenderer.invoke('print:thermal', opts)
  },
  openCashDrawer: (opts) => {
    if (!isOpenCashDrawerPayload(opts)) {
      return Promise.resolve({ ok: false, error: 'Payload de caja inválido' })
    }
    return ipcRenderer.invoke('cash-drawer:open', opts ?? {})
  },
  lookupBusinessRnc: (rnc) => {
    if (typeof rnc !== 'string' || rnc.length > 32) {
      return Promise.resolve({ data: null, error: 'RNC inválido.' })
    }
    return ipcRenderer.invoke('rnc:lookup', rnc)
  },
  openCertificationPortal: () => ipcRenderer.invoke('external:open-portal'),
  validateEcfCertificate: (payload) => {
    if (!isEcfCertificatePayload(payload)) {
      return Promise.resolve({ data: null, error: 'Datos de certificado inválidos.' })
    }
    return ipcRenderer.invoke('ecf:validate-certificate', payload)
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
  onUpdateEvents(handlers) {
    const onChecking = () => handlers.onChecking?.()
    const onAvailable = (_e, info) => handlers.onUpdateAvailable?.(info)
    const onNotAvailable = () => handlers.onUpdateNotAvailable?.()
    const onProgress = (_e, progress) => handlers.onDownloadProgress?.(progress)
    const onDownloaded = (_e, info) => handlers.onUpdateDownloaded?.(info)
    const onError = (_e, payload) => handlers.onUpdateError?.(payload)

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
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.textContent = text
  }
  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }
})
