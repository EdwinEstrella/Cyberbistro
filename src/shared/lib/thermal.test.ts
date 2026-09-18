import { describe, it, expect, beforeEach, vi } from "vitest";
import { getThermalPrintSettings, saveThermalPrintSettings } from "./thermalStorage";
import { enqueueThermalPrint, printThermalHtml } from "./thermalPrint";

describe("Thermal Printer Settings & Routing", () => {
  beforeEach(() => {
    // Mock localStorage
    const store: Record<string, string> = {};
    global.localStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      length: 0,
      key: () => null
    };

    global.window = {
      electronAPI: {
        printThermal: vi.fn().mockResolvedValue({ ok: true }),
        listPrinters: vi.fn().mockResolvedValue([
          { name: "GenPrinter", displayName: "GenPrinter", description: "", isDefault: true },
          { name: "KitchPrinter", displayName: "KitchPrinter", description: "", isDefault: false },
          { name: "SalesPrinter", displayName: "SalesPrinter", description: "", isDefault: false },
        ]),
        minimize: vi.fn(),
        maximize: vi.fn(),
        close: vi.fn(),
        getVersions: vi.fn().mockResolvedValue({ app: "1.0.0" })
      },
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as any;
  });

  it("should return default settings when empty", () => {
    const s = getThermalPrintSettings();
    expect(s.printerName).toBe("");
    expect(s.kitchenPrinterName).toBe("");
    expect(s.salesPrinterName).toBe("");
  });

  it("should save and load specialized printers", () => {
    saveThermalPrintSettings({
      paperWidthMm: 80,
      printerName: "Gen",
      kitchenPrinterName: "Kitch",
      salesPrinterName: "Sales",
      printComandas: true
    });

    const s = getThermalPrintSettings();
    expect(s.printerName).toBe("Gen");
    expect(s.kitchenPrinterName).toBe("Kitch");
    expect(s.salesPrinterName).toBe("Sales");
  });

  it("should fallback to general printer if specialized is empty", async () => {
    saveThermalPrintSettings({
      paperWidthMm: 80,
      printerName: "GenPrinter",
      kitchenPrinterName: "",
      salesPrinterName: "",
      printComandas: true
    });

    await printThermalHtml("test", { printType: "kitchen" });
    expect((global.window as any).electronAPI.printThermal).toHaveBeenCalledWith(
      expect.objectContaining({ deviceName: "GenPrinter" })
    );

    await printThermalHtml("test", { printType: "sales" });
    expect((global.window as any).electronAPI.printThermal).toHaveBeenCalledWith(
      expect.objectContaining({ deviceName: "GenPrinter" })
    );
  });

  it("should use specialized printer if provided", async () => {
    saveThermalPrintSettings({
      paperWidthMm: 80,
      printerName: "GenPrinter",
      kitchenPrinterName: "KitchPrinter",
      salesPrinterName: "SalesPrinter",
      printComandas: true
    });

    await printThermalHtml("test", { printType: "kitchen" });
    expect((global.window as any).electronAPI.printThermal).toHaveBeenCalledWith(
      expect.objectContaining({ deviceName: "KitchPrinter" })
    );

    await printThermalHtml("test", { printType: "sales" });
    expect((global.window as any).electronAPI.printThermal).toHaveBeenCalledWith(
      expect.objectContaining({ deviceName: "SalesPrinter" })
    );
  });

  it("should explain when a cached kitchen printer validation is missing in Windows", async () => {
    saveThermalPrintSettings({
      paperWidthMm: 80,
      printerName: "GenPrinter",
      kitchenPrinterName: "MissingKitchenPrinter",
      salesPrinterName: "SalesPrinter",
      printComandas: true
    });

    await printThermalHtml("test", { printType: "kitchen" });
    const result = await printThermalHtml("test", { printType: "kitchen" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("MissingKitchenPrinter");
    expect(result.error).toContain("no está disponible en Windows");
    expect((global.window as any).electronAPI.printThermal).toHaveBeenCalledTimes(1);
  });

  it("queues a receipt only once while it is still pending", () => {
    const print = vi.fn().mockResolvedValue({ ok: true });

    expect(enqueueThermalPrint({ id: "invoice-1", label: "Factura #1", print })).toBe(true);
    expect(enqueueThermalPrint({ id: "invoice-1", label: "Factura #1", print })).toBe(false);
  });

  it("renders into iframe with srcdoc set before append in web runtime", async () => {
    delete (global.window as any).electronAPI;
    const appendChild = vi.fn();
    const createElement = vi.fn().mockReturnValue({
      setAttribute: vi.fn(),
      style: {},
    });
    global.document = {
      createElement,
      body: { appendChild },
    } as any;

    await printThermalHtml("<div>Receipt HTML</div>");

    expect(createElement).toHaveBeenCalledWith("iframe");
    expect(appendChild).toHaveBeenCalled();
    const createdIframe = appendChild.mock.calls[0][0] as HTMLIFrameElement;
    expect(createdIframe.srcdoc).toBe("<div>Receipt HTML</div>");
    delete (global as any).document;
  });
});
