import { describe, expect, it, vi } from "vitest";
import {
  assembleFormato607Data,
  collectMissingParentInvoiceIds,
  computeFormato607MonthBounds,
  loadFormato607Data,
} from "./formato607Data";
import { INVOICE_RANGE_LOAD_ERROR } from "../../billing/lib/invoicesLocal";
import type { Formato607InvoiceInput } from "./formato607";

describe("formato607Data", () => {
  const validPeriod = "202608";
  const validRnc = "131123456";

  const rawInvoiceSupabase: Record<string, unknown> = {
    id: "fac-1",
    numero_factura: 1001,
    ncf: "B0100000001",
    cliente_rnc: "101123456",
    estado: "pagada",
    metodo_pago: "efectivo",
    subtotal: 1000,
    itbis: 180,
    propina: 100,
    total: 1280,
    items: [
      { nombre: "Chivo liniero", cantidad: 1, precio_unitario: 1000, subtotal: 1000 },
    ],
    created_at: "2026-08-10T14:00:00Z",
    pagada_at: "2026-08-10T14:30:00Z",
  };

  const rawInvoiceSqliteStringItems: Record<string, unknown> = {
    id: "fac-2",
    numero_factura: 1002,
    ncf: "E310000000001",
    cliente_rnc: "130862346",
    estado: "pagada",
    metodo_pago: "tarjeta",
    subtotal: 2000,
    itbis: 360,
    propina: 0,
    total: 2360,
    items: JSON.stringify([
      { nombre: "Mofongo camarones", cantidad: 2, precio_unitario: 1000, subtotal: 2000 },
    ]),
    created_at: "2026-08-15T20:00:00Z",
    pagada_at: "2026-08-15T20:30:00Z",
  };

  const rawConsumoUnder250k: Record<string, unknown> = {
    id: "fac-3",
    numero_factura: 1003,
    ncf: "B0200000001",
    estado: "pagada",
    metodo_pago: "efectivo",
    subtotal: 500,
    itbis: 90,
    propina: 0,
    total: 590,
    items: JSON.stringify([]),
    created_at: "2026-08-12T12:00:00Z",
    pagada_at: "2026-08-12T12:00:00Z",
  };

  it("computes exact range bounds for 202608 with 7-day lower pad", () => {
    const bounds = computeFormato607MonthBounds("202608");
    expect(bounds.dateFrom).toBe("2026-07-25T04:00:00.000Z");
    expect(bounds.dateTo).toBe("2026-09-01T03:59:59.999Z");
  });

  it("assembles detail rows and consumo summary from mixed raw invoice shapes", () => {
    const result = assembleFormato607Data(
      [rawInvoiceSupabase, rawInvoiceSqliteStringItems, rawConsumoUnder250k],
      validRnc,
      validPeriod
    );

    expect(result.emitterRnc).toBe("131123456");
    expect(result.rows).toHaveLength(2); // fac-1 (B01) and fac-2 (E31); fac-3 is consumo < 250k
    expect(result.rows[0].ncf).toBe("B0100000001");
    expect(result.rows[1].ncf).toBe("E310000000001");
    expect(result.rows[1].tarjeta).toBe(2360);

    expect(result.summary.count).toBe(1);
    expect(result.summary.totalMontoFacturado).toBe(500);
  });

  it("resolves credit note parent customer RNC when items are JSON string", () => {
    const parentInvoice: Record<string, unknown> = {
      id: "parent-id",
      numero_factura: 99,
      ncf: "E310000000099",
      cliente_rnc: "130862346",
      estado: "pagada",
      subtotal: 1000,
      itbis: 180,
      propina: 0,
      total: 1180,
      metodo_pago: "efectivo",
      items: "[]",
      created_at: "2026-08-01T10:00:00Z",
    };

    const creditNote: Record<string, unknown> = {
      id: "cn-id",
      numero_factura: 1,
      ncf: "E340000000001",
      ref_ncf: "E310000000099",
      credit_note_of: "parent-id",
      cliente_rnc: null, // should inherit from parent
      estado: "nota_credito",
      subtotal: -500,
      itbis: -90,
      propina: 0,
      total: -590,
      metodo_pago: "efectivo",
      items: "[]",
      created_at: "2026-08-05T12:00:00Z",
    };

    const result = assembleFormato607Data([parentInvoice, creditNote], validRnc, validPeriod);
    const cnRow = result.rows.find((r) => r.ncf === "E340000000001")!;
    expect(cnRow).toBeDefined();
    expect(cnRow.rnc_cedula).toBe("130862346");
    expect(cnRow.ncf_modificado).toBe("E310000000099");
    expect(cnRow.monto_facturado).toBe(500);
  });

  it("collects missing parent IDs using shared isCreditNoteInvoice predicate", () => {
    const invoices: Formato607InvoiceInput[] = [
      { id: "parent-loaded", ncf: "E310000000001", cliente_rnc: "130862346" },
      { id: "cn-1", estado: "nota_credito", credit_note_of: "parent-loaded", cliente_rnc: null },
      { id: "cn-2", credit_note_of: "parent-missing", cliente_rnc: null },
      { id: "cn-3", estado: "nota_credito", credit_note_of: "parent-missing-2", cliente_rnc: "101123456" },
      { id: "normal-sale", ncf: "B0100000001", cliente_rnc: "101123456" },
    ];
    const missing = collectMissingParentInvoiceIds(invoices);
    expect(missing).toEqual(["parent-missing"]);
  });

  it("throws the standard missing-RNC error when emitter RNC is empty or invalid", () => {
    expect(() => assembleFormato607Data([rawInvoiceSupabase], "", validPeriod)).toThrow(
      "Falta el RNC de tu negocio. Configurá el RNC o cédula de tu restaurante (el emisor del reporte) en la pantalla de Ajustes antes de exportar."
    );

    expect(() => assembleFormato607Data([rawInvoiceSupabase], "12345", validPeriod)).toThrow(
      "Falta el RNC de tu negocio. Configurá el RNC o cédula de tu restaurante (el emisor del reporte) en la pantalla de Ajustes antes de exportar."
    );
  });

  it("passes exact UTC bounds (with 7-day lower pad) to the injected reader for 202608", async () => {
    const mockReadInvoices = vi.fn().mockResolvedValue([rawInvoiceSupabase, rawConsumoUnder250k]);
    const mockGetEmitterRnc = vi.fn().mockResolvedValue("1-31-12345-6");

    const result = await loadFormato607Data("tenant-123", validPeriod, {
      readInvoices: mockReadInvoices,
      getEmitterRnc: mockGetEmitterRnc,
    });

    expect(mockReadInvoices).toHaveBeenCalledWith("tenant-123", {
      dateFrom: "2026-07-25T04:00:00.000Z",
      dateTo: "2026-09-01T03:59:59.999Z",
    });
    expect(mockGetEmitterRnc).toHaveBeenCalledWith("tenant-123");
    expect(result.emitterRnc).toBe("131123456");
    expect(result.rows).toHaveLength(1);
    expect(result.summary.count).toBe(1);
  });

  it("aborts with INVOICE_RANGE_LOAD_ERROR when invoice loading throws", async () => {
    const mockFailingReader = vi.fn().mockRejectedValue(new Error("Supabase statement timeout"));
    const mockGetEmitterRnc = vi.fn().mockResolvedValue("131123456");

    await expect(
      loadFormato607Data("tenant-123", validPeriod, {
        readInvoices: mockFailingReader,
        getEmitterRnc: mockGetEmitterRnc,
      })
    ).rejects.toThrow(INVOICE_RANGE_LOAD_ERROR);
  });

  it("propagates RNC lookup error with its own message rather than the invoice error", async () => {
    const mockReadInvoices = vi.fn().mockResolvedValue([rawInvoiceSupabase]);
    const mockFailingRnc = vi
      .fn()
      .mockRejectedValue(
        new Error("No se pudo leer el RNC de tu negocio. Verificá tu conexión e intentá de nuevo.")
      );

    await expect(
      loadFormato607Data("tenant-123", validPeriod, {
        readInvoices: mockReadInvoices,
        getEmitterRnc: mockFailingRnc,
      })
    ).rejects.toThrow(
      "No se pudo leer el RNC de tu negocio. Verificá tu conexión e intentá de nuevo."
    );
  });

  it("resolves parent outside loaded window without emitting parent as a detail row", async () => {
    const creditNoteInWindow: Record<string, unknown> = {
      id: "cn-outside-parent",
      numero_factura: 50,
      ncf: "E340000000050",
      ref_ncf: "E310000000020",
      credit_note_of: "parent-outside-window-id",
      cliente_rnc: null, // missing, needs resolution
      estado: "nota_credito",
      subtotal: -300,
      itbis: -54,
      propina: 0,
      total: -354,
      metodo_pago: "efectivo",
      created_at: "2026-08-10T12:00:00Z",
    };

    const parentOutsideWindow: Record<string, unknown> = {
      id: "parent-outside-window-id",
      numero_factura: 20,
      ncf: "E310000000020",
      cliente_rnc: "130862346", // parent has customer RNC
      estado: "pagada",
      subtotal: 1000,
      itbis: 180,
      propina: 0,
      total: 1180,
      metodo_pago: "efectivo",
      created_at: "2026-06-15T10:00:00Z", // from June (outside August window)
    };

    const mockReadInvoices = vi.fn().mockResolvedValue([creditNoteInWindow]);
    const mockGetEmitterRnc = vi.fn().mockResolvedValue("131123456");
    const mockFetchParentInvoices = vi.fn().mockResolvedValue([parentOutsideWindow]);

    const result = await loadFormato607Data("tenant-123", validPeriod, {
      readInvoices: mockReadInvoices,
      getEmitterRnc: mockGetEmitterRnc,
      fetchParentInvoices: mockFetchParentInvoices,
    });

    expect(mockFetchParentInvoices).toHaveBeenCalledWith("tenant-123", ["parent-outside-window-id"]);

    // Detail rows must contain ONLY the credit note (1 row), NOT the parent
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].ncf).toBe("E340000000050");
    expect(result.rows[0].rnc_cedula).toBe("130862346");
    expect(result.rows[0].monto_facturado).toBe(300);

    // Parent invoice is NOT in rows
    const parentInRows = result.rows.find((r) => r.ncf === "E310000000020");
    expect(parentInRows).toBeUndefined();
  });
});
