import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mocks for the five collaborators ------------------------------------
const getThermalPrintSettings = vi.fn();
const printThermalHtml = vi.fn();
const buildComandaReceiptHtml = vi.fn((..._args: unknown[]) => "<html>comanda</html>");
const readLocalMirror = vi.fn(async (..._args: unknown[]) => [] as Array<Record<string, unknown>>);
const maybeSingle = vi.fn(async () => ({ data: { id: "t1", nombre_negocio: "Café" }, error: null }));
const alertMock = vi.fn();

vi.mock("../../../shared/lib/thermalStorage", () => ({
  getThermalPrintSettings: () => getThermalPrintSettings(),
}));
vi.mock("../../../shared/lib/thermalPrint", () => ({
  printThermalHtml: (...args: unknown[]) => printThermalHtml(...args),
}));
vi.mock("../../../shared/lib/receiptTemplates", () => ({
  buildComandaReceiptHtml: (...args: unknown[]) => buildComandaReceiptHtml(...args),
}));
vi.mock("../../../shared/lib/localFirst", () => ({
  readLocalMirror: (...args: unknown[]) => readLocalMirror(...args),
}));
vi.mock("../../../shared/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => maybeSingle() }),
      }),
    }),
  },
}));

import { printKitchenComanda } from "./printKitchenComanda";

const COMANDA = {
  id: "c1",
  mesa_numero: 5,
  items: [{ nombre: "Pizza", cantidad: 2 }],
  notas: null,
  created_at: "2026-09-21T00:00:00.000Z",
};

describe("printKitchenComanda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getThermalPrintSettings.mockReturnValue({ printComandas: true, paperWidthMm: 80 });
    printThermalHtml.mockResolvedValue({ ok: true });
    alertMock.mockClear();
    globalThis.alert = alertMock;
  });

  it("does not print when comanda printing is disabled", async () => {
    getThermalPrintSettings.mockReturnValue({ printComandas: false, paperWidthMm: 80 });
    await printKitchenComanda("t1", COMANDA);
    expect(printThermalHtml).not.toHaveBeenCalled();
    expect(buildComandaReceiptHtml).not.toHaveBeenCalled();
  });

  it("prints the comanda to the kitchen printer when enabled", async () => {
    await printKitchenComanda("t1", COMANDA);
    expect(buildComandaReceiptHtml).toHaveBeenCalledTimes(1);
    expect(printThermalHtml).toHaveBeenCalledTimes(1);
    expect(printThermalHtml).toHaveBeenCalledWith("<html>comanda</html>", { printType: "kitchen" });
  });

  it("alerts (without throwing) when the printer fails", async () => {
    printThermalHtml.mockResolvedValue({ ok: false, error: "impresora apagada" });
    await expect(printKitchenComanda("t1", COMANDA)).resolves.toBeUndefined();
    expect(alertMock).toHaveBeenCalledTimes(1);
  });
});
