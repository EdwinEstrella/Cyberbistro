import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export const APP_GET_OPEN_AT_LOGIN_CHANNEL = 'app:get-open-at-login'
export const APP_SET_OPEN_AT_LOGIN_CHANNEL = 'app:set-open-at-login'

export interface AutoLaunchStatus {
  supported: boolean
  enabled: boolean
}

export interface AutoLaunchOptions {
  isPackaged?: boolean
  platform?: NodeJS.Platform | string
  execPath?: string
  userDataDir?: string
  preferencesFilePath?: string
  setLoginItemSettings?: (settings: { openAtLogin: boolean; path?: string }) => void
  readFile?: (filePath: string) => string
  writeFile?: (filePath: string, content: string) => void
}

export interface AutoLaunchIpcMain {
  handle: (channel: string, listener: (event: unknown, ...args: any[]) => any) => void
}

export class AutoLaunchManager {
  private readonly isPackaged: boolean
  private readonly platform: string
  private readonly execPath: string
  private readonly preferencesFilePath: string
  private readonly setLoginItemSettingsFn: (settings: { openAtLogin: boolean; path?: string }) => void
  private readonly readFileFn: (filePath: string) => string
  private readonly writeFileFn: (filePath: string, content: string) => void

  constructor(options: AutoLaunchOptions = {}) {
    this.isPackaged =
      options.isPackaged ?? (typeof app !== 'undefined' ? Boolean(app.isPackaged) : false)
    this.platform = options.platform ?? process.platform
    this.execPath = options.execPath ?? process.execPath

    const userData =
      options.userDataDir ??
      (typeof app !== 'undefined' && typeof app.getPath === 'function'
        ? app.getPath('userData')
        : '')
    this.preferencesFilePath =
      options.preferencesFilePath ?? (userData ? path.join(userData, 'preferences.json') : '')

    this.setLoginItemSettingsFn =
      options.setLoginItemSettings ??
      ((settings) => {
        if (typeof app !== 'undefined' && typeof app.setLoginItemSettings === 'function') {
          app.setLoginItemSettings(settings)
        }
      })

    this.readFileFn =
      options.readFile ??
      ((filePath) => {
        return fs.readFileSync(filePath, 'utf-8')
      })

    this.writeFileFn =
      options.writeFile ??
      ((filePath, content) => {
        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(filePath, content, 'utf-8')
      })
  }

  isSupported(): boolean {
    return this.isPackaged && this.platform === 'win32'
  }

  private readPreferences(): Record<string, unknown> {
    if (!this.preferencesFilePath) return {}
    try {
      const content = this.readFileFn(this.preferencesFilePath)
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Missing file or corrupt JSON: fallback to empty object
    }
    return {}
  }

  private writePreferences(patch: Record<string, unknown>): void {
    if (!this.preferencesFilePath) return
    const current = this.readPreferences()
    const updated = { ...current, ...patch }
    this.writeFileFn(this.preferencesFilePath, JSON.stringify(updated, null, 2))
  }

  init(): AutoLaunchStatus {
    if (!this.isSupported()) {
      return { supported: false, enabled: false }
    }

    const prefs = this.readPreferences()
    if (typeof prefs.openAtLogin === 'boolean') {
      const enabled = prefs.openAtLogin
      this.setLoginItemSettingsFn({ openAtLogin: enabled, path: this.execPath })
      return { supported: true, enabled }
    }

    // First run with no stored preference: default ON
    const defaultEnabled = true
    this.setLoginItemSettingsFn({ openAtLogin: defaultEnabled, path: this.execPath })
    this.writePreferences({ openAtLogin: defaultEnabled })
    return { supported: true, enabled: defaultEnabled }
  }

  getOpenAtLogin(): AutoLaunchStatus {
    if (!this.isSupported()) {
      return { supported: false, enabled: false }
    }

    const prefs = this.readPreferences()
    if (typeof prefs.openAtLogin === 'boolean') {
      return { supported: true, enabled: prefs.openAtLogin }
    }

    // Default ON when supported and not yet stored
    return { supported: true, enabled: true }
  }

  setOpenAtLogin(enabled: boolean): AutoLaunchStatus {
    if (!this.isSupported()) {
      return { supported: false, enabled: false }
    }

    const target = Boolean(enabled)
    this.setLoginItemSettingsFn({ openAtLogin: target, path: this.execPath })
    this.writePreferences({ openAtLogin: target })
    return { supported: true, enabled: target }
  }
}

export function registerAutoLaunchIpc(
  ipcMain: AutoLaunchIpcMain,
  manager: AutoLaunchManager
): void {
  ipcMain.handle(APP_GET_OPEN_AT_LOGIN_CHANNEL, () => {
    return manager.getOpenAtLogin()
  })

  ipcMain.handle(APP_SET_OPEN_AT_LOGIN_CHANNEL, (_event, enabled: unknown) => {
    return manager.setOpenAtLogin(Boolean(enabled))
  })
}
