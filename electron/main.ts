import { app, BrowserWindow, ipcMain, nativeImage, safeStorage, shell } from 'electron'
import { P12Reader } from 'dgii-ecf'
import type { NativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupAutoUpdater } from './autoUpdater'
import { startLanEdgeServer, type LanEdgeServerHandle } from './lanEdgeServer'
import { registerCashPurchaseRepositoryIpc, registerCatalogRepositoryIpc, registerDesktopRepositoryIpc, registerOrdersRepositoryIpc, registerSalesFiscalRepositoryIpc, registerTenantStoreIpc, registerPayrollRepositoryIpc, registerPayrollSyncAccessTokenIpc, registerReceivablesRepositoryIpc, registerPayablesRepositoryIpc } from './persistence/ipc'
import { PayrollRepository } from './persistence/payrollRepository'
import type { PayrollCommand } from '../src/shared/lib/payrollContracts'
import { TenantStoreController } from './persistence/tenantStore'
import { DesktopRepository } from '../src/shared/lib/desktopRepository'
import { CatalogRepository } from './persistence/catalogRepository'
import { OrdersRepository } from './persistence/ordersRepository'
import { SalesFiscalRepository } from './persistence/salesFiscalRepository'
import { CashPurchaseRepository } from './persistence/cashPurchaseRepository'
import { ReceivablesRepository } from './persistence/receivablesRepository'
import { PayablesRepository } from './persistence/payablesRepository'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CERTIFICATION_PORTAL_URL = 'https://ecf.dgii.gov.do/certecf/portalcertificacion/Login?ReturnUrl=%2Fcertecf%2Fportalcertificacion'
const ECF_ENVIRONMENTS = new Set(['test', 'certification', 'production'])
let mainWindow: BrowserWindow | null = null
let lanEdgeServer: LanEdgeServerHandle | null = null
let tenantStoreController: TenantStoreController | null = null

// Deshabilitar la aceleración de hardware para evitar bugs de focus/puntero en Windows
// app.disableHardwareAcceleration()

type PrintThermalOptions = {
  html: string
  deviceName?: string
  silent?: boolean
  paperWidthMm?: number
}

type PrintThermalResponse = { ok: boolean; error?: string }

type RncLookupResponse = {
  data: {
    rnc: string
    legalName: string
    tradeName: string
    status: string
  } | null
  error: string | null
}

type EcfCertificateValidationResponse = {
  data: {
    subject: string
    issuer: string
    serialNumber: string
    validFrom: string
    validUntil: string
  } | null
  error: string | null
}

function isEcfCertificatePayload(value: unknown): value is {
  tenantId: string
  environment: string
  certificateBase64: string
  passphrase: string
} {
  if (value === null || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  return (
    typeof payload.tenantId === 'string' && /^[0-9a-f-]{36}$/i.test(payload.tenantId) &&
    typeof payload.environment === 'string' && ECF_ENVIRONMENTS.has(payload.environment) &&
    typeof payload.certificateBase64 === 'string' && payload.certificateBase64.length > 0 && payload.certificateBase64.length <= 20_000_000 &&
    typeof payload.passphrase === 'string' && payload.passphrase.length > 0 && payload.passphrase.length <= 1024
  )
}

function validateAndStoreEcfCertificate(payload: unknown): EcfCertificateValidationResponse {
  if (!isEcfCertificatePayload(payload)) {
    return { data: null, error: 'Datos de certificado inválidos.' }
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { data: null, error: 'El almacén seguro del sistema no está disponible.' }
  }

  try {
    const reader = new P12Reader(payload.passphrase)
    const info = reader.getCertificateInfoFromBase64(payload.certificateBase64)
    const validFrom = info.validFrom.toISOString()
    const validUntil = info.validTo.toISOString()
    if (info.validTo.getTime() <= Date.now()) {
      return { data: null, error: 'El certificado digital se encuentra vencido.' }
    }

    const directory = path.join(app.getPath('userData'), 'ecf-certificates')
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const encrypted = safeStorage.encryptString(JSON.stringify({
      certificateBase64: payload.certificateBase64,
      passphrase: payload.passphrase,
    }))
    fs.writeFileSync(path.join(directory, `${payload.tenantId}-${payload.environment}.bin`), encrypted, { mode: 0o600 })

    return {
      data: {
        subject: info.subject,
        issuer: info.issuer,
        serialNumber: info.serialNumber,
        validFrom,
        validUntil,
      },
      error: null,
    }
  } catch {
    return { data: null, error: 'No se pudo leer el certificado. Revisá el archivo y su contraseña.' }
  }
}

async function lookupBusinessRnc(rawRnc: unknown): Promise<RncLookupResponse> {
  const rnc = typeof rawRnc === 'string' ? rawRnc.replace(/\D/g, '') : ''
  if (rnc.length !== 9) {
    return { data: null, error: 'Ingresá un RNC válido de 9 dígitos.' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch('https://rnc.megaplus.com.do/api/consulta', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rnc }),
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null

    if (response.status === 404 || payload?.error) {
      return { data: null, error: String(payload?.mensaje || 'No encontramos un negocio registrado con ese RNC.') }
    }

    if (!response.ok || typeof payload?.nombre_razon_social !== 'string') {
      return { data: null, error: 'No pudimos consultar la DGII. Intentá de nuevo.' }
    }

    return {
      data: {
        rnc: typeof payload.cedula_rnc === 'string' ? payload.cedula_rnc : rnc,
        legalName: payload.nombre_razon_social,
        tradeName: typeof payload.nombre_comercial === 'string' ? payload.nombre_comercial : '',
        status: typeof payload.estado === 'string' ? payload.estado : '',
      },
      error: null,
    }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error && error.name === 'AbortError'
        ? 'La consulta tardó demasiado. Intentá de nuevo.'
        : 'No pudimos conectar con la DGII. Intentá de nuevo.',
    }
  } finally {
    clearTimeout(timeout)
  }
}

function printHtmlToThermal(opts: PrintThermalOptions): Promise<PrintThermalResponse> {
  return new Promise((resolve) => {
    const printWin = new BrowserWindow({
      width: 420,
      height: 900,
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    })

    const fail = (msg: string) => {
      if (!printWin.isDestroyed()) printWin.close()
      resolve({ ok: false, error: msg })
    }

    const timer = setTimeout(() => fail('Tiempo de impresión agotado'), 45000)

    printWin.webContents.once('did-fail-load', (_e, code, desc) => {
      clearTimeout(timer)
      fail(`Carga fallida: ${code} ${desc}`)
    })

    const printLoadedPage = () => {
      setTimeout(() => {
        printWin.webContents.print(
          {
            silent: Boolean(opts.silent),
            printBackground: true,
            deviceName: opts.deviceName || undefined,
            usePrinterDefaultPageSize: true,
            margins: { marginType: 'none' },
          },
          (success, failureReason) => {
            clearTimeout(timer)
            if (!printWin.isDestroyed()) printWin.close()
            if (success) resolve({ ok: true })
            else resolve({ ok: false, error: String(failureReason || 'Error de impresión') })
          }
        )
      }, 450)
    }

    printWin.webContents.once('did-finish-load', () => {
      printWin.webContents
        .executeJavaScript(
          `new Promise((resolve) => {
            document.open();
            document.write(${JSON.stringify(opts.html)});
            document.close();
            if (document.readyState === 'complete') {
              resolve(true);
              return;
            }
            window.addEventListener('load', () => resolve(true), { once: true });
            setTimeout(() => resolve(true), 2500);
          })`,
          true
        )
        .then(printLoadedPage)
        .catch((err) => {
          clearTimeout(timer)
          fail(err instanceof Error ? err.message : String(err))
        })
    })

    printWin.loadURL('about:blank').catch((err) => {
      clearTimeout(timer)
      fail(err instanceof Error ? err.message : String(err))
    })
  })
}

function focusMainWindowForTextInput(): boolean {
  const win = mainWindow
  if (!win || win.isDestroyed()) return false

  if (win.isMinimized()) win.restore()
  win.setAlwaysOnTop(true)
  win.show()
  win.focus()
  win.webContents.focus()
  win.setAlwaysOnTop(false)
  return win.isFocused() || win.webContents.isFocused()
}

/** Una sola instancia: evita iconos duplicados en la barra de tareas (Windows) y re-enfoca la ventana. */
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    focusMainWindowForTextInput()
  })
}

/** Debe coincidir con `build.appId` en package.json (atajos NSIS + barra de tareas Windows). */
const WINDOWS_APP_USER_MODEL_ID = 'com.edwin.cloudix'

/** Antes de `ready`: el shell de Windows asocia mejor el icono del botón de la barra de tareas. */
if (gotTheLock && process.platform === 'win32') {
  app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID)
}

/**
 * RelaunchIconResource: el shell usa el icono embebido en el .exe.
 * - Instalado: Cloudix.exe (afterPack + rcedit).
 * - Dev: electron.exe parcheado en postinstall con scripts/patch-dev-electron-icon.cjs.
 */
function windowsTaskbarRelaunchIcon(): { appIconPath: string; appIconIndex: number } {
  return { appIconPath: process.execPath, appIconIndex: 0 }
}

function applyWindowsTaskbarIdentity(win: BrowserWindow) {
  if (process.platform !== 'win32') return
  const { appIconPath, appIconIndex } = windowsTaskbarRelaunchIcon()
  try {
    win.setAppDetails({
      appId: WINDOWS_APP_USER_MODEL_ID,
      appIconPath,
      appIconIndex,
      relaunchCommand: process.execPath,
      relaunchDisplayName: 'Cloudix',
    })
  } catch (e) {
    console.warn('setAppDetails failed:', e)
  }
}

function loadWindowIconImage(): NativeImage | undefined {
  const raw = resolveWindowIconPath()
  const abs = path.resolve(raw)
  if (!fs.existsSync(abs)) return undefined
  const img = nativeImage.createFromPath(abs)
  return img.isEmpty() ? undefined : img
}

/**
 * Windows/macOS: ruta fija a icon.ico (comportamiento alineado con b112a4a; evita fallos de icono en
 * acceso directo / barra de tareas por comprobar exists y caer en PNG dentro del asar).
 * Linux: PNG empaquetado o en dev si existe.
 */
function resolveWindowIconPath(): string {
  if (process.platform === 'linux') {
    const pngPackaged = path.join(process.resourcesPath, 'icon.png')
    const pngDev = path.join(__dirname, '../assets/icons/icon.png')
    if (app.isPackaged && fs.existsSync(pngPackaged)) return pngPackaged
    if (!app.isPackaged && fs.existsSync(pngDev)) return pngDev
  }

  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico')
  }
  const fromAppRoot = path.join(app.getAppPath(), 'icon.ico')
  if (fs.existsSync(fromAppRoot)) return fromAppRoot
  return path.join(__dirname, '../icon.ico')
}

function createWindow() {
  const iconImage = loadWindowIconImage()

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    titleBarStyle: 'hidden',
    ...(iconImage ? { icon: iconImage } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  applyWindowsTaskbarIdentity(mainWindow)

  // Forzar foco en webContents y forzar que Windows redibuje el contexto del caret
  mainWindow.on('focus', () => {
    mainWindow?.setAlwaysOnTop(true);
    setTimeout(() => {
      mainWindow?.setAlwaysOnTop(false);
      mainWindow?.webContents.focus();
    }, 50);
  });

  // Load from Vite dev server in development, or from files in production
  // VITE_DEV_SERVER_URL is set by vite-plugin-electron during development
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html')
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('loadFile failed:', indexPath, err)
    })
    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error('did-fail-load:', { code, desc, url })
    })
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    applyWindowsTaskbarIdentity(mainWindow)
    const img = loadWindowIconImage()
    if (img) mainWindow.setIcon(img)
    focusMainWindowForTextInput()
  })

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

if (gotTheLock) {
   registerTenantStoreIpc({
    ipcMain,
    isTrustedSender: (event) => event.senderId === mainWindow?.webContents.id,
     getStatus: () => tenantStoreController?.getStatus() ?? ({ tenantId: null, isOpen: false }),
     getActiveTenantId: () => tenantStoreController?.getActiveStore()?.getTenantId() ?? null,
     importLegacySnapshot: (payload) => {
       const request = payload as Parameters<TenantSQLiteImporter["import"]>[0]
       if (!tenantStoreController) throw new Error('Tenant store is unavailable')
       return tenantStoreController.importLegacySnapshot(request)
      },
    })
    registerDesktopRepositoryIpc({
     ipcMain,
     isTrustedSender: (event) => event.senderId === mainWindow?.webContents.id,
     getRepository: () => {
       const store = tenantStoreController?.getActiveStore()
       if (!store) throw new Error('Tenant store is unavailable')
       return new DesktopRepository({ store, branchId: 'main-process-default' })
     },
   })
   ipcMain.handle('window:ensure-input-focus', () => focusMainWindowForTextInput())

  ipcMain.handle('printers:list', async () => {
    const w = mainWindow || BrowserWindow.getAllWindows()[0]
    if (!w) return []
    try {
      const list = await w.webContents.getPrintersAsync()
      return list.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        description: p.description || '',
        isDefault: Boolean((p as { isDefault?: boolean }).isDefault),
      }))
    } catch (e) {
      console.error('printers:list', e)
      return []
    }
  })

  ipcMain.handle(
    'print:thermal',
    async (_event, opts: PrintThermalOptions): Promise<PrintThermalResponse> => {
      return printHtmlToThermal(opts)
    }
  )

  ipcMain.handle(
    'cash-drawer:open',
    async (_event, opts: { deviceName?: string; paperWidthMm?: number } = {}): Promise<PrintThermalResponse> => {
      const paperWidthMm = Number.isFinite(opts.paperWidthMm) ? opts.paperWidthMm : 58
      return printHtmlToThermal({
        deviceName: opts.deviceName || undefined,
        silent: true,
        paperWidthMm,
        html: `<!doctype html><html><head><meta charset="utf-8"><style>
          @page { size: ${paperWidthMm}mm 1mm; margin: 0; }
          html, body { width: ${paperWidthMm}mm; height: 1mm; margin: 0; padding: 0; overflow: hidden; background: white; }
        </style></head><body></body></html>`,
      })
    }
  )

  ipcMain.handle('rnc:lookup', (_event, rnc: unknown) => lookupBusinessRnc(rnc))
  ipcMain.handle('external:open-portal', () => shell.openExternal(CERTIFICATION_PORTAL_URL))
  ipcMain.handle('ecf:validate-certificate', (_event, payload: unknown) => validateAndStoreEcfCertificate(payload))

  // Window controls handlers (solo instancia principal)
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

  app.whenReady().then(async () => {
    tenantStoreController = new TenantStoreController(app.getPath('userData'))
    try {
      lanEdgeServer = await startLanEdgeServer({
        dataDir: app.getPath('userData'),
        distDir: path.join(__dirname, '../dist'),
      })
    } catch (error) {
      console.error('[Cloudix LAN Edge] no pudo iniciar:', error)
    }

    createWindow()

    if (app.isPackaged) {
      setupAutoUpdater(() => mainWindow)
    } else {
      // En dev `setupAutoUpdater` no corre; el renderer igual llama `getUpdateState()` → IPC sin handler.
      ipcMain.removeHandler('get-update-state')
      ipcMain.handle('get-update-state', () => ({
        phase: 'unsupported' as const,
        remoteVersion: null,
        downloadedVersion: null,
        percent: 0,
        error: '',
      }))
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      } else {
        focusMainWindowForTextInput()
      }
    })

    const isTrustedSender = (event: { senderId?: number; sender?: { id: number } }) => {
      const senderId = event.senderId ?? event.sender?.id;
      return Boolean(mainWindow && senderId === mainWindow.webContents.id);
    };

    registerCatalogRepositoryIpc({
      ipcMain,
      isTrustedSender,
      getRepository: () => {
        const store = tenantStoreController?.getActiveStore()
        if (!store) throw new Error('Tenant store is unavailable')
        return new CatalogRepository({ store, branchId: 'main-process-default' })
      },
    })
    registerOrdersRepositoryIpc({
      ipcMain,
      isTrustedSender,
      getRepository: () => {
        const store = tenantStoreController?.getActiveStore()
        if (!store) throw new Error('Tenant store is unavailable')
        return new OrdersRepository({ store, branchId: 'main-process-default' })
      },
    })
    registerSalesFiscalRepositoryIpc({
      ipcMain,
      isTrustedSender,
      getRepository: () => {
        const store = tenantStoreController?.getActiveStore()
        if (!store) throw new Error('Tenant store is unavailable')
        return new SalesFiscalRepository({ store, branchId: 'main-process-default' })
      },
    })
    registerCashPurchaseRepositoryIpc({ ipcMain, isTrustedSender, getRepository: () => {
      const store = tenantStoreController?.getActiveStore()
      if (!store) throw new Error('Tenant store is unavailable')
      return new CashPurchaseRepository({ store, branchId: 'main-process-default' })
    } })
    registerReceivablesRepositoryIpc({ ipcMain, isTrustedSender, getRepository: () => {
      const store = tenantStoreController?.getActiveStore()
      if (!store) throw new Error('Tenant store is unavailable')
      return new ReceivablesRepository({ store, branchId: 'main-process-default' })
    } })
    registerPayablesRepositoryIpc({ ipcMain, isTrustedSender, getRepository: () => {
      const store = tenantStoreController?.getActiveStore()
      if (!store) throw new Error('Tenant store is unavailable')
      return new PayablesRepository({ store, branchId: 'main-process-default' })
    } })
    registerPayrollRepositoryIpc({
      ipcMain,
      isTrustedSender,
      executeCommand: async (command: PayrollCommand) => {
        if (!tenantStoreController) throw new Error('Tenant store is unavailable')
        let store = tenantStoreController.getActiveStore()
        if (!store || store.getTenantId() !== command.tenantId) {
          store = tenantStoreController.activate(command.tenantId)
        }
        const repo = new PayrollRepository(store.getDatabase())
        
        switch (command.type) {
          case 'payroll.getEmployees': {
            return { type: 'payroll.employees', employees: repo.getEmployees(command.tenantId, command.sucursalId) }
          }
          case 'payroll.getPayments': {
            return { type: 'payroll.payments', payments: repo.getPayments(command.tenantId, command.sucursalId, command.employeeId) }
          }
          case 'payroll.upsertEmployee': {
            const result = { type: 'payroll.employeeSaved', id: repo.upsertEmployee(command.tenantId, command.sucursalId, command.employee) } as const;
            tenantStoreController?.payrollSync.triggerSync().catch(console.error);
            return result;
          }
          case 'payroll.disableEmployee':
            repo.disableEmployee(command.tenantId, command.sucursalId, command.employeeId)
            tenantStoreController?.payrollSync.triggerSync().catch(console.error);
            return { type: 'payroll.success' }
          case 'payroll.getPaymentContext': {
            return { type: 'payroll.paymentContext', context: repo.getPaymentContext(command.tenantId, command.sucursalId, command.payload) }
          }
          case 'payroll.createPayment': {
            const result = repo.createPayment(command.tenantId, command.sucursalId, command.payload)
            tenantStoreController?.payrollSync.triggerSync().catch(console.error);
            return { type: 'payroll.paymentCommitted', ...result }
          }
          default:
            throw new Error(`Unknown payroll command: ${(command as any).type}`)
        }
      }
    })
    registerPayrollSyncAccessTokenIpc({
      ipcMain,
      isTrustedSender,
      setAccessToken: (accessToken) => {
        tenantStoreController?.payrollSync.setAccessToken(accessToken)
        if (accessToken) tenantStoreController?.payrollSync.triggerSync().catch(console.error)
      },
    })
  })

  app.on('before-quit', () => {
    tenantStoreController?.close()
    tenantStoreController = null
    void lanEdgeServer?.close()
    lanEdgeServer = null
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
