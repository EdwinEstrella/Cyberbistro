import { beforeEach, describe, expect, it, vi } from "vitest";
import { printDispatchSlip } from "./dispatchSlip";

const mocks = vi.hoisted(() => ({
  getThermalPrintSettings: vi.fn(),
  printThermalHtml: vi.fn(),
  resolveKitchenPrintTenant: vi.fn(),
  buildDispatchSlipHtml: vi.fn(),
}));

vi.mock("./thermalStorage", () => ({
  getThermalPrintSettings: mocks.getThermalPrintSettings,
}));

vi.mock("./thermalPrint", () => ({
  printThermalHtml: mocks.printThermalHtml,
}));

vi.mock("./kitchenPrintTenant", () => ({
  resolveKitchenPrintTenant: mocks.resolveKitchenPrintTenant,
}));

vi.mock("./receiptTemplates", () => ({
  buildDispatchSlipHtml: mocks.buildDispatchSlipHtml,
}));

vi.mock("./supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock("./localFirst", () => ({
  readLocalMirror: vi.fn(),
}));

vi.mock("./cloudAvailability", () => ({
  isDesktopCloudUnavailable: vi.fn().mockResolvedValue(false),
}));

describe("printDispatchSlip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getThermalPrintSettings.mockReturnValue({
      printComandas: true,
      paperWidthMm: 80,
    });
    mocks.resolveKitchenPrintTenant.mockResolvedValue({
      nombre_negocio: "Test Restaurant",
    });
    mocks.buildDispatchSlipHtml.mockReturnValue("<html>dispatch slip</html>");
    mocks.printThermalHtml.mockResolvedValue({ ok: true });
  });

  it("returns null when tenantId is null or undefined", async () => {
    expect(await printDispatchSlip(null, { mesa_numero: 1, items: [] })).toBeNull();
    expect(await printDispatchSlip(undefined, { mesa_numero: 1, items: [] })).toBeNull();
    expect(mocks.printThermalHtml).not.toHaveBeenCalled();
  });

  it("skips printing when printComandas is false", async () => {
    mocks.getThermalPrintSettings.mockReturnValue({
      printComandas: false,
      paperWidthMm: 80,
    });

    const result = await printDispatchSlip("tenant-1", {
      mesa_numero: 2,
      items: [{ nombre: "Pastelito", cantidad: 2 }],
    });

    expect(result).toBeNull();
    expect(mocks.printThermalHtml).not.toHaveBeenCalled();
  });

  it("prints using printType 'sales' when printComandas is true", async () => {
    const result = await printDispatchSlip("tenant-1", {
      mesa_numero: 5,
      items: [{ nombre: "Pollo", cantidad: 1 }],
      notas: "Sin picante",
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.printThermalHtml).toHaveBeenCalledWith("<html>dispatch slip</html>", {
      printType: "sales",
    });
  });

  it("logs warning on printer failure without throwing", async () => {
    mocks.printThermalHtml.mockResolvedValue({ ok: false, error: "Out of paper" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await printDispatchSlip("tenant-1", {
      mesa_numero: 0,
      items: [{ nombre: "Refresco", cantidad: 1 }],
    });

    expect(result).toEqual({ ok: false, error: "Out of paper" });
    expect(warnSpy).toHaveBeenCalledWith("Impresión papelito de pedido:", "Out of paper");
    warnSpy.mockRestore();
  });
});
