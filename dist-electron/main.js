import { ipcMain as d, BrowserWindow as c, app as l } from "electron";
import m from "node:path";
import { fileURLToPath as b } from "node:url";
import { autoUpdater as i } from "electron-updater";
import g from "electron-log";
let h = !1;
function y(a) {
  const n = c.getFocusedWindow();
  if (n && !n.isDestroyed()) return n;
  const e = a();
  return e && !e.isDestroyed() ? e : c.getAllWindows().find((s) => !s.isDestroyed()) ?? null;
}
function z(a) {
  i.logger = g, i.logger.transports.file.level = "info", i.autoDownload = !0, process.platform === "win32" && !process.env.CSC_LINK && !process.env.WIN_CSC_LINK && (i.verifyUpdateCodeSignature = !1);
  const n = (e, t) => {
    const s = y(a);
    s && s.webContents.send(e, t);
  };
  h || (h = !0, i.on("update-available", (e) => {
    n("update-available", {
      version: e.version,
      releaseDate: e.releaseDate,
      releaseNotes: e.releaseNotes
    });
  }), i.on("update-not-available", () => {
    n("update-not-available");
  }), i.on("download-progress", (e) => {
    n("download-progress", {
      percent: Math.round(e.percent),
      transferred: e.transferred,
      total: e.total,
      bytesPerSecond: e.bytesPerSecond
    });
  }), i.on("update-downloaded", (e) => {
    n("update-downloaded", {
      version: e.version,
      releaseDate: e.releaseDate,
      releaseNotes: e.releaseNotes
    });
  }), i.on("error", (e) => {
    g.error("autoUpdater error", e), n("update-error", e.message);
  }), d.on("install-update", () => {
    i.quitAndInstall(!1, !0);
  }), d.on("check-for-updates", () => {
    i.checkForUpdates();
  })), setTimeout(() => {
    i.checkForUpdates();
  }, 3e3);
}
const p = m.dirname(b(import.meta.url));
let o = null;
d.handle("printers:list", async () => {
  const a = o || c.getAllWindows()[0];
  if (!a) return [];
  try {
    return (await a.webContents.getPrintersAsync()).map((e) => ({
      name: e.name,
      displayName: e.displayName || e.name,
      description: e.description || "",
      isDefault: !!e.isDefault
    }));
  } catch (n) {
    return console.error("printers:list", n), [];
  }
});
d.handle(
  "print:thermal",
  async (a, n) => new Promise((e) => {
    const t = new c({
      width: 420,
      height: 900,
      show: !1,
      webPreferences: {
        nodeIntegration: !1,
        contextIsolation: !0,
        sandbox: !1
      }
    }), s = (r) => {
      t.isDestroyed() || t.close(), e({ ok: !1, error: r });
    }, u = setTimeout(() => s("Tiempo de impresión agotado"), 45e3);
    t.webContents.once("did-fail-load", (r, w, f) => {
      clearTimeout(u), s(`Carga fallida: ${w} ${f}`);
    }), t.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        const r = !!(n.silent && n.deviceName);
        t.webContents.print(
          {
            silent: r,
            printBackground: !0,
            deviceName: n.deviceName || void 0
          },
          (w, f) => {
            clearTimeout(u), t.isDestroyed() || t.close(), e(w ? { ok: !0 } : { ok: !1, error: String(f || "Error de impresión") });
          }
        );
      }, 450);
    });
    const x = "data:text/html;charset=utf-8," + encodeURIComponent(n.html);
    t.loadURL(x).catch((r) => {
      clearTimeout(u), s(r instanceof Error ? r.message : String(r));
    });
  })
);
process.env.NODE_ENV === "development" || l.isPackaged;
function v() {
  if (o = new c({
    width: 800,
    height: 600,
    frame: !1,
    titleBarStyle: "hidden",
    icon: l.isPackaged ? m.join(process.resourcesPath, "icon.ico") : m.join(p, "../icon.ico"),
    webPreferences: {
      preload: m.join(p, "preload.cjs"),
      nodeIntegration: !1,
      contextIsolation: !0,
      webSecurity: !0
    }
  }), process.env.VITE_DEV_SERVER_URL)
    o.loadURL(process.env.VITE_DEV_SERVER_URL);
  else {
    const a = m.join(p, "../dist/index.html");
    o.loadFile(a);
  }
  o.maximize(), o.on("maximize", () => {
    o == null || o.webContents.send("window-maximized", !0);
  }), o.on("unmaximize", () => {
    o == null || o.webContents.send("window-maximized", !1);
  });
}
d.on("window-minimize", () => {
  console.log("main: window-minimize received"), o && (o.minimize(), console.log("main: window minimized"));
});
d.on("window-maximize", () => {
  console.log("main: window-maximize received"), o && (o.isMaximized() ? (o.unmaximize(), console.log("main: window unmaximized")) : (o.maximize(), console.log("main: window maximized")));
});
d.on("window-close", () => {
  console.log("main: window-close received"), o && (o.close(), console.log("main: window closed"));
});
l.whenReady().then(() => {
  v(), l.isPackaged && z(() => o), l.on("activate", () => {
    c.getAllWindows().length === 0 && v();
  });
});
l.on("window-all-closed", () => {
  process.platform !== "darwin" && l.quit();
});
