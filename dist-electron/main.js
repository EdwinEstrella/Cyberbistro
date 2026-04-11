import { ipcMain as l, BrowserWindow as d, app as a } from "electron";
import r from "node:path";
import { fileURLToPath as g } from "node:url";
const u = r.dirname(g(import.meta.url));
let e = null;
l.handle("printers:list", async () => {
  const s = e || d.getAllWindows()[0];
  if (!s) return [];
  try {
    return (await s.webContents.getPrintersAsync()).map((i) => ({
      name: i.name,
      displayName: i.displayName || i.name,
      description: i.description || "",
      isDefault: !!i.isDefault
    }));
  } catch (t) {
    return console.error("printers:list", t), [];
  }
});
l.handle(
  "print:thermal",
  async (s, t) => new Promise((i) => {
    const n = new d({
      width: 420,
      height: 900,
      show: !1,
      webPreferences: {
        nodeIntegration: !1,
        contextIsolation: !0,
        sandbox: !1
      }
    }), m = (o) => {
      n.isDestroyed() || n.close(), i({ ok: !1, error: o });
    }, c = setTimeout(() => m("Tiempo de impresión agotado"), 45e3);
    n.webContents.once("did-fail-load", (o, w, f) => {
      clearTimeout(c), m(`Carga fallida: ${w} ${f}`);
    }), n.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        const o = !!(t.silent && t.deviceName);
        n.webContents.print(
          {
            silent: o,
            printBackground: !0,
            deviceName: t.deviceName || void 0
          },
          (w, f) => {
            clearTimeout(c), n.isDestroyed() || n.close(), i(w ? { ok: !0 } : { ok: !1, error: String(f || "Error de impresión") });
          }
        );
      }, 450);
    });
    const p = "data:text/html;charset=utf-8," + encodeURIComponent(t.html);
    n.loadURL(p).catch((o) => {
      clearTimeout(c), m(o instanceof Error ? o.message : String(o));
    });
  })
);
process.env.NODE_ENV === "development" || a.isPackaged;
function h() {
  if (e = new d({
    width: 800,
    height: 600,
    frame: !1,
    titleBarStyle: "hidden",
    icon: a.isPackaged ? r.join(process.resourcesPath, "icon.ico") : r.join(u, "../icon.ico"),
    webPreferences: {
      preload: r.join(u, "preload.cjs"),
      nodeIntegration: !1,
      contextIsolation: !0,
      webSecurity: !0
    }
  }), process.env.VITE_DEV_SERVER_URL)
    e.loadURL(process.env.VITE_DEV_SERVER_URL);
  else {
    const s = r.join(u, "../dist/index.html");
    e.loadFile(s);
  }
  e.maximize(), e.on("maximize", () => {
    e == null || e.webContents.send("window-maximized", !0);
  }), e.on("unmaximize", () => {
    e == null || e.webContents.send("window-maximized", !1);
  });
}
l.on("window-minimize", () => {
  console.log("main: window-minimize received"), e && (e.minimize(), console.log("main: window minimized"));
});
l.on("window-maximize", () => {
  console.log("main: window-maximize received"), e && (e.isMaximized() ? (e.unmaximize(), console.log("main: window unmaximized")) : (e.maximize(), console.log("main: window maximized")));
});
l.on("window-close", () => {
  console.log("main: window-close received"), e && (e.close(), console.log("main: window closed"));
});
a.whenReady().then(() => {
  h(), a.on("activate", () => {
    d.getAllWindows().length === 0 && h();
  });
});
a.on("window-all-closed", () => {
  process.platform !== "darwin" && a.quit();
});
