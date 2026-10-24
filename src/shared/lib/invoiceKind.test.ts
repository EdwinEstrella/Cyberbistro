import { describe, expect, it } from "vitest";
import { CREDIT_NOTE_ESTADO, isCreditNoteInvoice, isSaleInvoice } from "./invoiceKind";

describe("invoiceKind", () => {
  it("flags a row with estado nota_credito as a credit note", () => {
    expect(CREDIT_NOTE_ESTADO).toBe("nota_credito");
    expect(isCreditNoteInvoice({ estado: "nota_credito" })).toBe(true);
  });

  it("flags a row that references an original invoice as a credit note", () => {
    expect(isCreditNoteInvoice({ estado: "pagada", credit_note_of: "fac-1" })).toBe(true);
  });

  it("does not flag ordinary invoices or unset values", () => {
    expect(isCreditNoteInvoice({ estado: "pagada" })).toBe(false);
    expect(isCreditNoteInvoice({ estado: "pagada", credit_note_of: null })).toBe(false);
    expect(isCreditNoteInvoice({ estado: "pagada", credit_note_of: "" })).toBe(false);
    expect(isCreditNoteInvoice({})).toBe(false);
    expect(isCreditNoteInvoice(null)).toBe(false);
    expect(isCreditNoteInvoice(undefined)).toBe(false);
  });

  it("isSaleInvoice is the exact complement for sales sums", () => {
    expect(isSaleInvoice({ estado: "pagada" })).toBe(true);
    expect(isSaleInvoice({ estado: "nota_credito" })).toBe(false);
    expect(isSaleInvoice({ estado: "pagada", credit_note_of: "x" })).toBe(false);
  });

  it("filters a mixed list down to sales", () => {
    const rows = [{ estado: "pagada", total: 10 }, { estado: "nota_credito", total: 10 }];
    expect(rows.filter(isSaleInvoice)).toEqual([{ estado: "pagada", total: 10 }]);
  });
});
