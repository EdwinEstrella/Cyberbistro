import { ipcMain as d, BrowserWindow as c, app as l } from "electron";
import m from "node:path";
import { fileURLToPath as x } from "node:url";
import { autoUpdater as t } from "electron-updater";
import w from "electron-log";
let g = !1;
function y(a) {
  const n = c.getFocusedWindow();
  if (n && !n.isDestroyed()) return n;
  const e = a();
  return e && !e.isDestroyed() ? e : c.getAllWindows().find((r) => !r.isDestroyed()) ?? null;
}
function z(a) {
  t.logger = w, t.logger.transports.file.level = "info", t.autoDownload = !0, process.platform === "win32" && !process.env.CSC_LINK && !process.env.WIN_CSC_LINK && (t.verifyUpdateCodeSignature = !1);
  const n = (e, i) => {
    const r = y(a);
    r && r.webContents.send(e, i);
  };
  g || (g = !0, t.on("update-available", (e) => {
    n("update-available", {
      version: e.version,
      releaseDate: e.releaseDate,
      releaseNotes: e.releaseNotes
    });
  }), t.on("update-not-available", () => {
    n("update-not-available");
  }), t.on("download-progress", (e) => {
    n("download-progress", {
      percent: Math.round(e.percent),
      transferred: e.transferred,
      total: e.total,
      bytesPerSecond: e.bytesPerSecond
    });
  }), t.on("update-downloaded", (e) => {
    n("update-downloaded", {
      version: e.version,
      releaseDate: e.releaseDate,
      releaseNotes: e.releaseNotes
    });
  }), t.on("error", (e) => {
    w.error("autoUpdater error", e), n("update-error", e.message);
  }), d.on("install-update", () => {
    t.quitAndInstall(!1, !0);
  }), d.on("check-for-updates", () => {
    t.checkForUpdates().catch((e) => {
      w.warn("checkForUpdates (IPC) failed", e);
    });
  })), setTimeout(() => {
    t.checkForUpdates().catch((e) => {
      w.warn("checkForUpdates failed", e);
    });
  }, 3e3);
}
const h = m.dirname(x(import.meta.url));
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
    const i = new c({
      width: 420,
      height: 900,
      show: !1,
      webPreferences: {
        nodeIntegration: !1,
        contextIsolation: !0,
        sandbox: !1
      }
    }), r = (s) => {
      i.isDestroyed() || i.close(), e({ ok: !1, error: s });
    }, f = setTimeout(() => r("Tiempo de impresión agotado"), 45e3);
    i.webContents.once("did-fail-load", (s, u, p) => {
      clearTimeout(f), r(`Carga fallida: ${u} ${p}`);
    }), i.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        const s = !!(n.silent && n.deviceName);
        i.webContents.print(
          {
            silent: s,
            printBackground: !0,
            deviceName: n.deviceName || void 0
          },
          (u, p) => {
            clearTimeout(f), i.isDestroyed() || i.close(), e(u ? { ok: !0 } : { ok: !1, error: String(p || "Error de impresión") });
          }
        );
      }, 450);
    });
    const b = "data:text/html;charset=utf-8," + encodeURIComponent(n.html);
    i.loadURL(b).catch((s) => {
      clearTimeout(f), r(s instanceof Error ? s.message : String(s));
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
    icon: l.isPackaged ? m.join(process.resourcesPath, "icon.ico") : m.join(h, "../icon.ico"),
    webPreferences: {
      preload: m.join(h, "preload.cjs"),
      nodeIntegration: !1,
      contextIsolation: !0,
      webSecurity: !0
    }
  }), process.env.VITE_DEV_SERVER_URL)
    o.loadURL(process.env.VITE_DEV_SERVER_URL);
  else {
    const a = m.join(h, "../dist/index.html");
    o.loadFile(a).catch((n) => {
      console.error("loadFile failed:", a, n);
    }), o.webContents.on("did-fail-load", (n, e, i, r) => {
      console.error("did-fail-load:", { code: e, desc: i, url: r });
    });
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
