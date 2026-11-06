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

  it("feeds ecf_status from dgii_status, security code, submitted_at, and track_id when mirror row is accepted", async () => {
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
      return Promise.resolve([{
        factura_id: "invoice-accepted",
        status: "queued",
        dgii_status: "accepted",
        dgii_security_code: "SEC123",
        dgii_track_id: "TRK-999",
        submitted_at: "2026-11-06T10:00:00Z",
        accepted_at: "2026-11-06T10:05:00Z",
      }]);
    });

    const result = await printLocalInvoiceReceipt({
      tenantId: "tenant-1",
      factura: { id: "invoice-accepted", numero_factura: 100, ncf: "E320000000001", total: 500 },
      numeroFactura: 100,
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.buildFacturaReceiptHtml).toHaveBeenCalledWith(
      expect.objectContaining({ nombre_negocio: "Bistro Local" }),
      expect.objectContaining({
        id: "invoice-accepted",
        ecf_status: "accepted",
        ecf_security_code: "SEC123",
        ecf_track_id: "TRK-999",
        ecf_submitted_at: "2026-11-06T10:00:00Z",
      }),
      100,
      80
    );
  });

  it("refuses to print an e-CF invoice without a DGII security code", async () => {
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
      return Promise.resolve([{ factura_id: "inv-ecf-no-code", status: "queued", dgii_security_code: null }]);
    });

    const result = await printLocalInvoiceReceipt({
      tenantId: "tenant-1",
      factura: { id: "inv-ecf-no-code", numero_factura: 101, ncf: "E310000000001", total: 500 },
      numeroFactura: 101,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("sin código de seguridad");
    expect(mocks.printThermalHtml).not.toHaveBeenCalled();
  });

  describe("cloud unavailable", () => {
    const factura = { id: "invoice-1", numero_factura: 7 };
    const tenantRow = {
      nombre_negocio: "Cached Bistro", rnc: "1", direccion: "d", telefono: "t", logo_url: null,
    };
    const store = new Map<string, string>();
    const KEY = (t: string) => `cloudix_last_known:receipt_tenant:${t}`;
    function remote(result: unknown) {
      mocks.supabaseFrom.mockReturnValue({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(result) }) }),
      });
    }

    beforeEach(() => {
      store.clear();
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      });
      mocks.readLocalMirror.mockImplementation(() => Promise.resolve([]));
    });

    it("uses the cached tenant when the remote read errors", async () => {
      store.set(KEY("tenant-1"), JSON.stringify(tenantRow));
      remote({ data: null, error: { message: "Failed to fetch" } });
      const result = await printLocalInvoiceReceipt({ tenantId: "tenant-1", factura, numeroFactura: 7 });
      expect(result).toEqual({ ok: true });
      expect(mocks.buildFacturaReceiptHtml).toHaveBeenCalledWith(
        expect.objectContaining({ nombre_negocio: "Cached Bistro" }), expect.anything(), 7, 80);
    });

    it("saves a successful remote tenant for later use", async () => {
      remote({ data: tenantRow, error: null });
      await printLocalInvoiceReceipt({ tenantId: "tenant-1", factura, numeroFactura: 7 });
      expect(store.get(KEY("tenant-1"))).toContain("Cached Bistro");
    });

    it("reports a readable message (not [object Object]) when there is no cache", async () => {
      remote({ data: null, error: { message: "Failed to fetch" } });
      const result = await printLocalInvoiceReceipt({ tenantId: "tenant-1", factura, numeroFactura: 7 });
      expect(result).toEqual({ ok: false, error: "Failed to fetch" });
    });

    it("does not use another tenant cache", async () => {
      store.set(KEY("other"), JSON.stringify(tenantRow));
      remote({ data: null, error: { message: "offline" } });
      const result = await printLocalInvoiceReceipt({ tenantId: "tenant-1", factura, numeroFactura: 7 });
      expect(result.ok).toBe(false);
    });
  });
});
