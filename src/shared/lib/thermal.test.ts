import { describe, it, expect, beforeEach, vi } from "vitest";
import { getThermalPrintSettings, saveThermalPrintSettings } from "./thermalStorage";
import { printThermalHtml } from "./thermalPrint";

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

  it("should explain when the configured kitchen printer is missing in Windows", async () => {
    saveThermalPrintSettings({
      paperWidthMm: 80,
      printerName: "GenPrinter",
      kitchenPrinterName: "MissingKitchenPrinter",
      salesPrinterName: "SalesPrinter",
      printComandas: true
    });

    const result = await printThermalHtml("test", { printType: "kitchen" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("MissingKitchenPrinter");
    expect(result.error).toContain("no está disponible en Windows");
    expect((global.window as any).electronAPI.printThermal).not.toHaveBeenCalled();
  });
});
