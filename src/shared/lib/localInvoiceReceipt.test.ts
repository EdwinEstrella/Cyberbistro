import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readLocalMirror: vi.fn(),
  printThermalHtml: vi.fn(),
  buildFacturaReceiptHtml: vi.fn(),
  supabaseFrom: vi.fn(),
}));

vi.mock("./localFirst", () => ({ readLocalMirror: mocks.readLocalMirror }));
vi.mock("./thermalPrint", () => ({ printThermalHtml: mocks.printThermalHtml }));
vi.mock("./thermalStorage", () => ({
  getThermalPrintSettings: () => ({ paperWidthMm: 80 }),
}));
vi.mock("./receiptTemplates", () => ({ buildFacturaReceiptHtml: mocks.buildFacturaReceiptHtml }));
vi.mock("./supabase", () => ({ supabase: { from: mocks.supabaseFrom } }));

import { printLocalInvoiceReceipt } from "./localInvoiceReceipt";

describe("printLocalInvoiceReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readLocalMirror.mockImplementation((_tenantId: string, table: string) => {
      if (table === "tenants") {
        return Promise.resolve([{
          id: "tenant-1",
          nombre_negocio: "Bistro Local",
          rnc: "101010101",
          direccion: "Calle 1",
          telefono: "809-555-0101",
          logo_url: null,
        }]);
      }
      return Promise.resolve([{ factura_id: "invoice-1", status: "pending_offline" }]);
    });
    mocks.buildFacturaReceiptHtml.mockResolvedValue("<html>receipt</html>");
    mocks.printThermalHtml.mockResolvedValue({ ok: true });
  });

  it("prints the just-created invoice from local data without a Supabase read", async () => {
    const result = await printLocalInvoiceReceipt({
      tenantId: "tenant-1",
      factura: { id: "invoice-1", numero_factura: 42, fiscal_status: "pending_offline" },
      numeroFactura: 42,
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.buildFacturaReceiptHtml).toHaveBeenCalledWith(
      expect.objectContaining({ nombre_negocio: "Bistro Local" }),
      expect.objectContaining({ id: "invoice-1", ecf_status: "pending_offline" }),
      42,
      80
    );
    expect(mocks.printThermalHtml).toHaveBeenCalledWith("<html>receipt</html>", { printType: "sales" });
    expect(mocks.supabaseFrom).not.toHaveBeenCalled();
  });
});
