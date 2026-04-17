"use strict";
const electron = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const node_url = require("node:url");
const electronUpdater = require("electron-updater");
const log = require("electron-log");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
let listenersAttached = false;
const updateState = {
  phase: "idle",
  remoteVersion: null,
  downloadedVersion: null,
  percent: 0,
  error: ""
};
function getTargetWindow(getMain) {
  const focused = electron.BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  const main = getMain();
  if (main && !main.isDestroyed()) return main;
  const all = electron.BrowserWindow.getAllWindows();
  return all.find((w) => !w.isDestroyed()) ?? null;
}
function setupAutoUpdater(getMainWindow) {
  electronUpdater.autoUpdater.logger = log;
  electronUpdater.autoUpdater.logger.transports.file.level = "info";
  electronUpdater.autoUpdater.autoDownload = false;
  if (process.platform === "win32" && !process.env.CSC_LINK && !process.env.WIN_CSC_LINK) {
    electronUpdater.autoUpdater.verifyUpdateCodeSignature = false;
  }
  const send = (channel, payload) => {
    const win = getTargetWindow(getMainWindow);
    if (win) win.webContents.send(channel, payload);
  };
  if (!listenersAttached) {
    listenersAttached = true;
    electronUpdater.autoUpdater.on("update-available", (info) => {
      updateState.phase = "available";
      updateState.remoteVersion = info.version ?? null;
      updateState.downloadedVersion = null;
      updateState.percent = 0;
      updateState.error = "";
      send("update-available", {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      });
    });
    electronUpdater.autoUpdater.on("update-not-available", () => {
      if (updateState.phase !== "ready") {
        updateState.phase = "idle";
        updateState.percent = 0;
      }
      send("update-not-available");
    });
    electronUpdater.autoUpdater.on("download-progress", (progress) => {
      updateState.phase = "downloading";
      updateState.percent = Math.round(progress.percent);
      updateState.error = "";
      send("download-progress", {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      });
    });
    electronUpdater.autoUpdater.on("update-downloaded", (info) => {
      updateState.phase = "ready";
      updateState.downloadedVersion = info.version ?? null;
      updateState.percent = 100;
      updateState.error = "";
      send("update-downloaded", {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      });
    });
    electronUpdater.autoUpdater.on("error", (err) => {
      log.error("autoUpdater error", err);
      if (updateState.phase !== "ready") {
        updateState.phase = "error";
        updateState.error = (err == null ? void 0 : err.message) ? String(err.message) : String(err);
      }
      send("update-error", err.message);
    });
    electron.ipcMain.on("install-update", () => {
      electronUpdater.autoUpdater.quitAndInstall(false, true);
    });
    electron.ipcMain.on("download-update", () => {
      updateState.phase = "downloading";
      updateState.percent = Math.max(0, updateState.percent || 0);
      updateState.error = "";
      void electronUpdater.autoUpdater.downloadUpdate().catch((err) => {
        log.warn("downloadUpdate (IPC) failed", err);
        updateState.phase = "error";
        updateState.error = (err == null ? void 0 : err.message) ? String(err.message) : String(err);
        send("update-error", updateState.error);
      });
    });
    electron.ipcMain.on("check-for-updates", () => {
      updateState.phase = "checking";
      updateState.percent = 0;
      updateState.error = "";
      send("checking-for-update");
      void electronUpdater.autoUpdater.checkForUpdates().then((result) => {
        if ((result == null ? void 0 : result.isUpdateAvailable) === false) send("update-not-available");
      }).catch((err) => {
        log.warn("checkForUpdates (IPC) failed", err);
        updateState.phase = "error";
        updateState.error = (err == null ? void 0 : err.message) ? String(err.message) : String(err);
        send("update-error", (err == null ? void 0 : err.message) ? String(err.message) : String(err));
      });
    });
    electron.ipcMain.handle("get-update-state", () => ({ ...updateState }));
  }
  setTimeout(() => {
    void electronUpdater.autoUpdater.checkForUpdates().then((result) => {
      if ((result == null ? void 0 : result.isUpdateAvailable) === false) send("update-not-available");
    }).catch((err) => {
      log.warn("checkForUpdates failed", err);
    });
  }, 3e3);
}
const __dirname$1 = path.dirname(node_url.fileURLToPath(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("main.js", document.baseURI).href));
let mainWindow = null;
const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  electron.app.quit();
} else {
  electron.app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}
const WINDOWS_APP_USER_MODEL_ID = "com.edwin.cyberbistro";
if (gotTheLock && process.platform === "win32") {
  electron.app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
}
function windowsTaskbarRelaunchIcon() {
  return { appIconPath: process.execPath, appIconIndex: 0 };
}
function applyWindowsTaskbarIdentity(win) {
  if (process.platform !== "win32") return;
  const { appIconPath, appIconIndex } = windowsTaskbarRelaunchIcon();
  try {
    win.setAppDetails({
      appId: WINDOWS_APP_USER_MODEL_ID,
      appIconPath,
      appIconIndex,
      relaunchCommand: process.execPath,
      relaunchDisplayName: "Cyberbistro"
    });
  } catch (e) {
    console.warn("setAppDetails failed:", e);
  }
}
function loadWindowIconImage() {
  const raw = resolveWindowIconPath();
  const abs = path.resolve(raw);
  if (!fs.existsSync(abs)) return void 0;
  const img = electron.nativeImage.createFromPath(abs);
  return img.isEmpty() ? void 0 : img;
}
function resolveWindowIconPath() {
  if (process.platform === "linux") {
    const pngPackaged = path.join(process.resourcesPath, "icon.png");
    const pngDev = path.join(__dirname$1, "../assets/icons/icon.png");
    if (electron.app.isPackaged && fs.existsSync(pngPackaged)) return pngPackaged;
    if (!electron.app.isPackaged && fs.existsSync(pngDev)) return pngDev;
  }
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "icon.ico");
  }
  const fromAppRoot = path.join(electron.app.getAppPath(), "icon.ico");
  if (fs.existsSync(fromAppRoot)) return fromAppRoot;
  return path.join(__dirname$1, "../icon.ico");
}
function createWindow() {
  const iconImage = loadWindowIconImage();
  mainWindow = new electron.BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    titleBarStyle: "hidden",
    ...iconImage ? { icon: iconImage } : {},
    webPreferences: {
      preload: path.join(__dirname$1, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });
  applyWindowsTaskbarIdentity(mainWindow);
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(__dirname$1, "../dist/index.html");
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error("loadFile failed:", indexPath, err);
    });
    mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
      console.error("did-fail-load:", { code, desc, url });
    });
  }
  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    applyWindowsTaskbarIdentity(mainWindow);
    const img = loadWindowIconImage();
    if (img) mainWindow.setIcon(img);
  });
  mainWindow.maximize();
  mainWindow.on("maximize", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send("window-maximized", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send("window-maximized", false);
  });
}
if (gotTheLock) {
  electron.ipcMain.handle("printers:list", async () => {
    const w = mainWindow || electron.BrowserWindow.getAllWindows()[0];
    if (!w) return [];
    try {
      const list = await w.webContents.getPrintersAsync();
      return list.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        description: p.description || "",
        isDefault: Boolean(p.isDefault)
      }));
    } catch (e) {
      console.error("printers:list", e);
      return [];
    }
  });
  electron.ipcMain.handle(
    "print:thermal",
    async (_event, opts) => {
      return new Promise((resolve) => {
        const printWin = new electron.BrowserWindow({
          width: 420,
          height: 900,
          show: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
          }
        });
        const fail = (msg) => {
          if (!printWin.isDestroyed()) printWin.close();
          resolve({ ok: false, error: msg });
        };
        const timer = setTimeout(() => fail("Tiempo de impresión agotado"), 45e3);
        printWin.webContents.once("did-fail-load", (_e, code, desc) => {
          clearTimeout(timer);
          fail(`Carga fallida: ${code} ${desc}`);
        });
        printWin.webContents.once("did-finish-load", () => {
          setTimeout(() => {
            const silent = Boolean(opts.silent);
            printWin.webContents.print(
              {
                silent,
                printBackground: true,
                deviceName: opts.deviceName || void 0
              },
              (success, failureReason) => {
                clearTimeout(timer);
                if (!printWin.isDestroyed()) printWin.close();
                if (success) resolve({ ok: true });
                else resolve({ ok: false, error: String(failureReason || "Error de impresión") });
              }
            );
          }, 450);
        });
        const url = "data:text/html;charset=utf-8," + encodeURIComponent(opts.html);
        printWin.loadURL(url).catch((err) => {
          clearTimeout(timer);
          fail(err instanceof Error ? err.message : String(err));
        });
      });
    }
  );
  electron.ipcMain.on("window-minimize", () => {
    console.log("main: window-minimize received");
    if (mainWindow) {
      mainWindow.minimize();
      console.log("main: window minimized");
    }
  });
  electron.ipcMain.on("window-maximize", () => {
    console.log("main: window-maximize received");
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        console.log("main: window unmaximized");
      } else {
        mainWindow.maximize();
        console.log("main: window maximized");
      }
    }
  });
  electron.ipcMain.on("window-close", () => {
    console.log("main: window-close received");
    if (mainWindow) {
      mainWindow.close();
      console.log("main: window closed");
    }
  });
  electron.app.whenReady().then(() => {
    createWindow();
    if (electron.app.isPackaged) {
      setupAutoUpdater(() => mainWindow);
    }
    electron.app.on("activate", () => {
      if (electron.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
  electron.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      electron.app.quit();
    }
  });
}
