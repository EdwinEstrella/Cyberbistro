import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("electron fiscal contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates printing IPC payloads in preload and exposes no certificate bridge", async () => {
    let exposedApi: Record<string, unknown> | undefined;
    const invoke = vi.fn(async () => ({ ok: true }));

    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
    });

    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: vi.fn((key: string, api: Record<string, unknown>) => {
          if (key === "electronAPI") exposedApi = api;
        }),
      },
      ipcRenderer: {
        invoke,
        send: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
      },
    }));

    await import("../electron/preload");

    expect(exposedApi).toBeDefined();
    expect(exposedApi).toHaveProperty("printThermal");
    expect(exposedApi).toHaveProperty("openCashDrawer");
    expect(exposedApi).toHaveProperty("ensureInputFocus");
    expect(exposedApi).not.toHaveProperty("uploadCertificate");
    expect(exposedApi).not.toHaveProperty("importCertificate");

    const printThermal = exposedApi?.printThermal as ((payload: unknown) => Promise<unknown>) | undefined;
    const openCashDrawer = exposedApi?.openCashDrawer as ((payload: unknown) => Promise<unknown>) | undefined;
    expect(printThermal).toBeTypeOf("function");
    expect(openCashDrawer).toBeTypeOf("function");

    await expect(printThermal?.({ html: "<html><body>ticket</body></html>", deviceName: "Printer", silent: true, paperWidthMm: 80 })).resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith("print:thermal", {
      html: "<html><body>ticket</body></html>",
      deviceName: "Printer",
      silent: true,
      paperWidthMm: 80,
    });

    await expect(printThermal?.({ html: "" })).resolves.toMatchObject({ ok: false });
    await expect(openCashDrawer?.({ paperWidthMm: "wide" })).resolves.toMatchObject({ ok: false });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("keeps the fiscal printing path isolated in Electron main and renderer code", () => {
    const mainSource = readFileSync(path.join(projectRoot, "electron", "main.ts"), "utf8");
    const preloadSource = readFileSync(path.join(projectRoot, "electron", "preload.ts"), "utf8");
    const thermalPrintSource = readFileSync(path.join(projectRoot, "src", "shared", "lib", "thermalPrint.ts"), "utf8");

    expect(mainSource).toMatch(/ipcMain\.handle\(\s*['"]print:thermal['"]/);
    expect(mainSource).toMatch(/ipcMain\.handle\(\s*['"]cash-drawer:open['"]/);
    expect(mainSource).toMatch(/nodeIntegration:\s*false/);
    expect(mainSource).toMatch(/contextIsolation:\s*true/);
    expect(mainSource).not.toMatch(/ipcMain\.(?:handle|on)\(\s*['"][^'"]*(certificate|passphrase|dgii)/i);

    expect(preloadSource).toMatch(/printThermal:\s*\(opts: unknown\)/);
    expect(preloadSource).toMatch(/openCashDrawer:\s*\(opts\?: unknown\)/);
    expect(preloadSource).not.toMatch(/uploadCertificate|importCertificate|getCertificate/i);

    expect(thermalPrintSource).toContain("api?.printThermal");
    expect(thermalPrintSource).toContain("api?.openCashDrawer");
    expect(thermalPrintSource).not.toMatch(/dgii-ecf|certificate/i);
  });
});
