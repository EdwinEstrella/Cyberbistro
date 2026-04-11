import { ipcMain, BrowserWindow, app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
ipcMain.handle("printers:list", async () => {
  const w = mainWindow || BrowserWindow.getAllWindows()[0];
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
ipcMain.handle(
  "print:thermal",
  async (_event, opts) => {
    return new Promise((resolve) => {
      const printWin = new BrowserWindow({
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
          const silent = Boolean(opts.silent && opts.deviceName);
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
process.env.NODE_ENV === "development" || !app.isPackaged;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    titleBarStyle: "hidden",
    icon: app.isPackaged ? path.join(process.resourcesPath, "icon.ico") : path.join(__dirname$1, "../icon.ico"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(__dirname$1, "../dist/index.html");
    mainWindow.loadFile(indexPath);
  }
  mainWindow.maximize();
  mainWindow.on("maximize", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send("window-maximized", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send("window-maximized", false);
  });
}
ipcMain.on("window-minimize", () => {
  console.log("main: window-minimize received");
  if (mainWindow) {
    mainWindow.minimize();
    console.log("main: window minimized");
  }
});
ipcMain.on("window-maximize", () => {
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
ipcMain.on("window-close", () => {
  console.log("main: window-close received");
  if (mainWindow) {
    mainWindow.close();
    console.log("main: window closed");
  }
});
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
