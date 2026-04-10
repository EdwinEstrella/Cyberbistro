import { app, ipcMain, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
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
