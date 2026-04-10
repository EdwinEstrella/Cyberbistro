import { app as i, ipcMain as m, BrowserWindow as l } from "electron";
import o from "node:path";
import { fileURLToPath as s } from "node:url";
const n = o.dirname(s(import.meta.url));
let e = null;
process.env.NODE_ENV === "development" || i.isPackaged;
function a() {
  if (e = new l({
    width: 800,
    height: 600,
    frame: !1,
    titleBarStyle: "hidden",
    icon: i.isPackaged ? o.join(process.resourcesPath, "icon.ico") : o.join(n, "../icon.ico"),
    webPreferences: {
      preload: o.join(n, "preload.cjs"),
      nodeIntegration: !1,
      contextIsolation: !0,
      webSecurity: !0
    }
  }), process.env.VITE_DEV_SERVER_URL)
    e.loadURL(process.env.VITE_DEV_SERVER_URL);
  else {
    const d = o.join(n, "../dist/index.html");
    e.loadFile(d);
  }
  e.maximize(), e.on("maximize", () => {
    e == null || e.webContents.send("window-maximized", !0);
  }), e.on("unmaximize", () => {
    e == null || e.webContents.send("window-maximized", !1);
  });
}
m.on("window-minimize", () => {
  console.log("main: window-minimize received"), e && (e.minimize(), console.log("main: window minimized"));
});
m.on("window-maximize", () => {
  console.log("main: window-maximize received"), e && (e.isMaximized() ? (e.unmaximize(), console.log("main: window unmaximized")) : (e.maximize(), console.log("main: window maximized")));
});
m.on("window-close", () => {
  console.log("main: window-close received"), e && (e.close(), console.log("main: window closed"));
});
i.whenReady().then(() => {
  a(), i.on("activate", () => {
    l.getAllWindows().length === 0 && a();
  });
});
i.on("window-all-closed", () => {
  process.platform !== "darwin" && i.quit();
});
