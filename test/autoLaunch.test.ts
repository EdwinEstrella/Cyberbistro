import { describe, expect, it, vi } from 'vitest'
import {
  APP_GET_OPEN_AT_LOGIN_CHANNEL,
  APP_SET_OPEN_AT_LOGIN_CHANNEL,
  AutoLaunchManager,
  registerAutoLaunchIpc,
  type AutoLaunchIpcMain,
} from '../electron/autoLaunch'

describe('AutoLaunchManager', () => {
  const dummyExecPath = 'C:\\Program Files\\Cloudix\\Cloudix.exe'
  const dummyUserData = 'C:\\Users\\Test\\AppData\\Roaming\\Cloudix'
  const dummyPrefsPath = 'C:\\Users\\Test\\AppData\\Roaming\\Cloudix\\preferences.json'

  function createHarness(options: {
    isPackaged?: boolean
    platform?: string
    initialPrefs?: Record<string, unknown> | null
  }) {
    let fileContent: string | null =
      options.initialPrefs !== undefined
        ? options.initialPrefs !== null
          ? JSON.stringify(options.initialPrefs)
          : null
        : null

    const setLoginItemSettings = vi.fn()
    const readFile = vi.fn((path: string) => {
      if (fileContent === null) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`)
      }
      return fileContent
    })
    const writeFile = vi.fn((_path: string, content: string) => {
      fileContent = content
    })

    const manager = new AutoLaunchManager({
      isPackaged: options.isPackaged ?? true,
      platform: options.platform ?? 'win32',
      execPath: dummyExecPath,
      userDataDir: dummyUserData,
      preferencesFilePath: dummyPrefsPath,
      setLoginItemSettings,
      readFile,
      writeFile,
    })

    return {
      manager,
      setLoginItemSettings,
      readFile,
      writeFile,
      getStoredPrefs: () => (fileContent ? JSON.parse(fileContent) : null),
    }
  }

  it('enables auto-launch by default on first run when packaged on Windows', () => {
    const { manager, setLoginItemSettings, getStoredPrefs } = createHarness({
      isPackaged: true,
      platform: 'win32',
      initialPrefs: null,
    })

    const status = manager.init()

    expect(status).toEqual({ supported: true, enabled: true })
    expect(setLoginItemSettings).toHaveBeenCalledTimes(1)
    expect(setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: dummyExecPath,
    })
    expect(getStoredPrefs()).toEqual({ openAtLogin: true })
  })

  it('keeps auto-launch disabled when stored preference is false', () => {
    const { manager, setLoginItemSettings, getStoredPrefs, writeFile } = createHarness({
      isPackaged: true,
      platform: 'win32',
      initialPrefs: { openAtLogin: false },
    })

    const status = manager.init()

    expect(status).toEqual({ supported: true, enabled: false })
    expect(setLoginItemSettings).toHaveBeenCalledTimes(1)
    expect(setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: false,
      path: dummyExecPath,
    })
    // Never re-enables on subsequent startups
    expect(getStoredPrefs()).toEqual({ openAtLogin: false })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('keeps auto-launch enabled when stored preference is true', () => {
    const { manager, setLoginItemSettings, getStoredPrefs, writeFile } = createHarness({
      isPackaged: true,
      platform: 'win32',
      initialPrefs: { openAtLogin: true },
    })

    const status = manager.init()

    expect(status).toEqual({ supported: true, enabled: true })
    expect(setLoginItemSettings).toHaveBeenCalledTimes(1)
    expect(setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: dummyExecPath,
    })
    expect(getStoredPrefs()).toEqual({ openAtLogin: true })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('is a no-op in development mode even on Windows', () => {
    const { manager, setLoginItemSettings, writeFile } = createHarness({
      isPackaged: false,
      platform: 'win32',
      initialPrefs: null,
    })

    expect(manager.isSupported()).toBe(false)

    const initStatus = manager.init()
    expect(initStatus).toEqual({ supported: false, enabled: false })
    expect(setLoginItemSettings).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()

    const getStatus = manager.getOpenAtLogin()
    expect(getStatus).toEqual({ supported: false, enabled: false })

    const setStatus = manager.setOpenAtLogin(true)
    expect(setStatus).toEqual({ supported: false, enabled: false })
    expect(setLoginItemSettings).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('is a no-op on unsupported platforms (e.g. darwin or linux)', () => {
    for (const platform of ['darwin', 'linux']) {
      const { manager, setLoginItemSettings, writeFile } = createHarness({
        isPackaged: true,
        platform,
        initialPrefs: null,
      })

      expect(manager.isSupported()).toBe(false)
      expect(manager.init()).toEqual({ supported: false, enabled: false })
      expect(manager.getOpenAtLogin()).toEqual({ supported: false, enabled: false })
      expect(manager.setOpenAtLogin(true)).toEqual({ supported: false, enabled: false })
      expect(setLoginItemSettings).not.toHaveBeenCalled()
      expect(writeFile).not.toHaveBeenCalled()
    }
  })

  it('persists preference and updates login item settings when setOpenAtLogin is called', () => {
    const { manager, setLoginItemSettings, getStoredPrefs } = createHarness({
      isPackaged: true,
      platform: 'win32',
      initialPrefs: { existingKey: 'preserved', openAtLogin: true },
    })

    const disableResult = manager.setOpenAtLogin(false)
    expect(disableResult).toEqual({ supported: true, enabled: false })
    expect(setLoginItemSettings).toHaveBeenLastCalledWith({
      openAtLogin: false,
      path: dummyExecPath,
    })
    expect(getStoredPrefs()).toEqual({ existingKey: 'preserved', openAtLogin: false })

    const enableResult = manager.setOpenAtLogin(true)
    expect(enableResult).toEqual({ supported: true, enabled: true })
    expect(setLoginItemSettings).toHaveBeenLastCalledWith({
      openAtLogin: true,
      path: dummyExecPath,
    })
    expect(getStoredPrefs()).toEqual({ existingKey: 'preserved', openAtLogin: true })
  })

  it('registers IPC handlers properly and maps calls to manager', () => {
    const { manager } = createHarness({
      isPackaged: true,
      platform: 'win32',
      initialPrefs: { openAtLogin: true },
    })

    const handlers = new Map<string, (event: unknown, ...args: any[]) => any>()
    const ipcMain: AutoLaunchIpcMain = {
      handle: (channel, listener) => {
        handlers.set(channel, listener)
      },
    }

    registerAutoLaunchIpc(ipcMain, manager)

    expect(handlers.has(APP_GET_OPEN_AT_LOGIN_CHANNEL)).toBe(true)
    expect(handlers.has(APP_SET_OPEN_AT_LOGIN_CHANNEL)).toBe(true)

    const getHandler = handlers.get(APP_GET_OPEN_AT_LOGIN_CHANNEL)!
    expect(getHandler({})).toEqual({ supported: true, enabled: true })

    const setHandler = handlers.get(APP_SET_OPEN_AT_LOGIN_CHANNEL)!
    expect(setHandler({}, false)).toEqual({ supported: true, enabled: false })
    expect(manager.getOpenAtLogin()).toEqual({ supported: true, enabled: false })
  })
})
