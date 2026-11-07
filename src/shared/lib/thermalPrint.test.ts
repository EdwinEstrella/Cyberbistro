import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  getThermalPrintSettings: vi.fn(() => ({
    paperWidthMm: 80,
    printerName: "Main Thermal",
    kitchenPrinterName: "Kitchen Printer",
    salesPrinterName: "Sales Printer",
  })),
  observePrinterValidation: vi.fn(() => true),
  invalidatePrinterValidation: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("./thermalStorage", () => ({
  getThermalPrintSettings: mocks.getThermalPrintSettings,
}));

vi.mock("./printerValidationCache", () => ({
  observePrinterValidation: mocks.observePrinterValidation,
  invalidatePrinterValidation: mocks.invalidatePrinterValidation,
}));

import { enqueueThermalPrint, printThermalHtml, openCashDrawerForSale } from "./thermalPrint";

describe("thermalPrint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("enqueueThermalPrint", () => {
    it("deduplicates queued print tasks with the same id", () => {
      let resolveFirst: (val: any) => void = () => {};
      const hangingPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      const firstQueued = enqueueThermalPrint({
        id: "print-dup-1",
        label: "Factura #1",
        print: () => hangingPromise as any,
      });

      const secondQueued = enqueueThermalPrint({
        id: "print-dup-1",
        label: "Factura #1",
        print: vi.fn(),
      });

      expect(firstQueued).toBe(true);
      expect(secondQueued).toBe(false);

      resolveFirst({ ok: true });
    });

    it("shows toast error when print result is not ok", async () => {
      enqueueThermalPrint({
        id: "print-fail-1",
        label: "Factura #2",
        print: async () => ({ ok: false, error: "Papel agotado" }),
      });

      // Wait for queue microtasks to finish
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mocks.toastError).toHaveBeenCalledWith(
        "Factura #2 fue guardado, pero no se pudo imprimir.",
        expect.objectContaining({
          description: expect.stringContaining("Papel agotado"),
        })
      );
    });
  });

  describe("printThermalHtml", () => {
    it("dispatches print payload to electronAPI when present", async () => {
      const mockPrintThermal = vi.fn(async () => ({ ok: true }));
      vi.stubGlobal("window", {
        electronAPI: {
          printThermal: mockPrintThermal,
          listPrinters: vi.fn(async () => []),
        },
      });

      const result = await printThermalHtml("<html>receipt</html>", { printType: "sales" });

      expect(result.ok).toBe(true);
      expect(mockPrintThermal).toHaveBeenCalledWith({
        html: "<html>receipt</html>",
        deviceName: "Sales Printer",
        silent: true,
        paperWidthMm: 80,
      });
    });

    it("falls back gracefully when not in electron environment", async () => {
      vi.stubGlobal("window", {
        matchMedia: vi.fn(() => ({ matches: false })),
      });
      vi.stubGlobal("document", {
        createElement: vi.fn(() => ({
          setAttribute: vi.fn(),
          style: {},
          remove: vi.fn(),
        })),
        body: {
          appendChild: vi.fn(),
        },
      });

      const result = await printThermalHtml("<html>receipt</html>");
      expect(result.ok).toBe(true);
    });
  });

  describe("openCashDrawerForSale", () => {
    it("requires desktop environment", async () => {
      vi.stubGlobal("window", {});
      const result = await openCashDrawerForSale();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("solo está disponible en la app de escritorio");
    });
  });
});
