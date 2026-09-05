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

function isOpenCashDrawerPayload(v: unknown): v is {
  deviceName?: string
  paperWidthMm?: number
} {
  if (v === undefined) return true
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (o.deviceName !== undefined && typeof o.deviceName !== 'string') return false
  if (
    o.paperWidthMm !== undefined &&
    (typeof o.paperWidthMm !== 'number' || !Number.isFinite(o.paperWidthMm))
  ) {
    return false
  }
  return true
}

function isEcfCertificatePayload(v: unknown): v is {
  tenantId: string
  environment: string
  certificateBase64: string
  passphrase: string
} {
  if (v === null || typeof v !== 'object') return false
  const payload = v as Record<string, unknown>
  return (
    typeof payload.tenantId === 'string' && /^[0-9a-f-]{36}$/i.test(payload.tenantId) &&
    typeof payload.environment === 'string' && ['test', 'certification', 'production'].includes(payload.environment) &&
    typeof payload.certificateBase64 === 'string' && payload.certificateBase64.length > 0 && payload.certificateBase64.length <= 20_000_000 &&
    typeof payload.passphrase === 'string' && payload.passphrase.length > 0 && payload.passphrase.length <= 1024
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
  saveSavedAccount: (account: unknown) => ipcRenderer.invoke('saved-accounts:save', account),
  getSavedAccountCredential: (id: string) => ipcRenderer.invoke('saved-accounts:credential', { id }),
  deleteSavedAccount: (id: string) => ipcRenderer.invoke('saved-accounts:delete', { id }),
  saveDeviceSessionPreference: (preference: unknown) => ipcRenderer.invoke('device-session:save-preference', preference),
  getDeviceSessionPreference: (identity: unknown) => ipcRenderer.invoke('device-session:read-preference', identity),
  executeCatalogCommand: (command: unknown) => ipcRenderer.invoke('catalog-repository:execute', command),
  executeOrdersCommand: (command: unknown) => ipcRenderer.invoke('orders-repository:execute', command),
  executeSalesFiscalCommand: (command: unknown) => ipcRenderer.invoke('sales-fiscal-repository:execute', command),
  executeCashPurchaseCommand: (command: unknown) => ipcRenderer.invoke('cash-purchase-repository:execute', command),
  executePayrollCommand: (command: unknown) => ipcRenderer.invoke('payroll-repository:execute', command),
  setPayrollSyncAccessToken: (accessToken: unknown) => ipcRenderer.invoke('payroll-sync:set-access-token', accessToken === null ? null : { accessToken }),
  executeReceivablesCommand: (command: unknown) => ipcRenderer.invoke('receivables-repository:execute', command),
  executePayablesCommand: (command: unknown) => ipcRenderer.invoke('payables-repository:execute', command),
  executeExpenseCommand: (command: unknown) => ipcRenderer.invoke('expense-repository:execute', command),
  listExpenses: (filter?: unknown) => ipcRenderer.invoke('expenses:list', filter),
  listExpenseCategories: () => ipcRenderer.invoke('expense-categories:list'),
  executeCustomerCommand: (command: unknown) => ipcRenderer.invoke('customer-repository:execute', command),
  listCustomers: () => ipcRenderer.invoke('customers:list'),
  syncCloudCustomers: (customers: unknown[]) => ipcRenderer.invoke('customers:sync-cloud', customers),
  getSyncDiagnosticReport: (tenantId?: string) => ipcRenderer.invoke('sync:get-diagnostic-report', tenantId),
  triggerSync: () => ipcRenderer.invoke('sync:trigger'),
  retryFailedSyncErrors: (tenantId?: string) => ipcRenderer.invoke('sync:retry-errors', tenantId),
  importLegacyIndexedDb: (payload: unknown) => ipcRenderer.invoke('tenant-store:import-indexeddb', payload),
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
  openCashDrawer: (opts?: unknown) => {
    if (!isOpenCashDrawerPayload(opts)) {
      return Promise.resolve({ ok: false, error: 'Payload de caja inv?lido' })
    }
    return ipcRenderer.invoke('cash-drawer:open', opts ?? {})
  },
  lookupBusinessRnc: (rnc: unknown) => {
    if (typeof rnc !== 'string' || rnc.length > 32) {
      return Promise.resolve({ data: null, error: 'RNC inválido.' })
    }
    return ipcRenderer.invoke('rnc:lookup', rnc)
  },
  openCertificationPortal: () => ipcRenderer.invoke('external:open-portal'),
  validateEcfCertificate: (payload: unknown) => {
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
