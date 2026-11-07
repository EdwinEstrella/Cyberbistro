import { afterEach, describe, expect, it, vi } from "vitest";

const printLocalInvoiceReceipt = vi.fn(async (..._args: unknown[]) => ({ ok: true }) as { ok: boolean; error?: string });
vi.mock("../../../shared/lib/localInvoiceReceipt", () => ({
  printLocalInvoiceReceipt: (...args: unknown[]) => printLocalInvoiceReceipt(...args),
}));

type Query = { table: string; filters: Record<string, unknown> };
let facturaRow: Record<string, unknown> | null = null;
let ecfRow: Record<string, unknown> | null = null;
let facturaError: unknown = null;
const queries: Query[] = [];

vi.mock("../../../shared/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const query: Query = { table, filters: {} };
      queries.push(query);
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          query.filters[column] = value;
          return chain;
        },
        maybeSingle: async () =>
          table === "facturas" ? { data: facturaRow, error: facturaError } : { data: ecfRow, error: null },
      };
      return chain;
    },
  },
}));

import { printCreditNote } from "./creditNotePrint";

afterEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  facturaRow = null;
  ecfRow = null;
  facturaError = null;
});

const note = { id: "n1", ncf: "E340000000007", estado: "nota_credito", credit_note_of: "f1", numero_factura: 9 };

describe("printCreditNote", () => {
  it("reprints a loaded note through the thermal receipt path with its ecf document", async () => {
    ecfRow = { status: "accepted", dgii_security_code: "AbC123" };
    const result = await printCreditNote({ tenantId: "t1", note });
    expect(result.ok).toBe(true);
    expect(printLocalInvoiceReceipt).toHaveBeenCalledWith({
      tenantId: "t1",
      factura: note,
      numeroFactura: 9,
      ecfDocument: ecfRow,
    });
    expect(queries.map((q) => q.table)).toEqual(["ecf_documents"]);
    expect(queries[0].filters).toEqual({ tenant_id: "t1", factura_id: "n1" });
  });

  it("loads the note by id right after issuing it", async () => {
    facturaRow = { ...note };
    await printCreditNote({ tenantId: "t1", noteId: "n1" });
    expect(queries[0]).toEqual({ table: "facturas", filters: { tenant_id: "t1", id: "n1" } });
    expect(printLocalInvoiceReceipt).toHaveBeenCalledTimes(1);
  });

  it("prints without an ecf document when the cloud has none yet", async () => {
    await printCreditNote({ tenantId: "t1", note });
    expect(printLocalInvoiceReceipt).toHaveBeenCalledWith(expect.objectContaining({ ecfDocument: null }));
  });

  it("reports a Spanish error when the note cannot be found", async () => {
    const result = await printCreditNote({ tenantId: "t1", noteId: "missing" });
    expect(result).toEqual({ ok: false, error: "No se encontró la nota de crédito a imprimir." });
    expect(printLocalInvoiceReceipt).not.toHaveBeenCalled();
  });

  it("blocks manual reprint if security code is not available yet", async () => {
    ecfRow = { status: "queued", dgii_security_code: null };
    const result = await printCreditNote({ tenantId: "t1", note, isReprint: true });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("El comprobante se imprimirá cuando la DGII lo confirme");
    expect(printLocalInvoiceReceipt).not.toHaveBeenCalled();
  });

  it("allows manual reprint when security code is available", async () => {
    ecfRow = { status: "accepted", dgii_security_code: "AbC123" };
    const result = await printCreditNote({ tenantId: "t1", note, isReprint: true });
    expect(result.ok).toBe(true);
    expect(printLocalInvoiceReceipt).toHaveBeenCalledWith(expect.objectContaining({
      ecfDocument: expect.objectContaining({ dgii_security_code: "AbC123" }),
    }));
  });
});
