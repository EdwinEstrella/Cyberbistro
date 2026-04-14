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