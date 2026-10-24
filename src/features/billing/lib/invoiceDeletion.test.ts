import { describe, expect, it } from "vitest";
import { ECF_DELETE_BLOCKED_MESSAGE, isEcfInvoice } from "./invoiceDeletion";

describe("isEcfInvoice", () => {
  it("blocks invoices with an e-NCF", () => {
    expect(isEcfInvoice({ ncf: "E310000000001" })).toBe(true);
    expect(isEcfInvoice({ ncf: "e320000000001" })).toBe(true);
    expect(isEcfInvoice({ ncf: "E340000000001", estado: "nota_credito" })).toBe(true);
  });
  it("blocks dgii_ecf fiscal mode even before the NCF exists, and invoices with an e-CF document", () => {
    expect(isEcfInvoice({ ncf: null, fiscal_mode: "dgii_ecf" })).toBe(true);
    expect(isEcfInvoice({ ncf: null }, true)).toBe(true);
  });
  it("allows ordinary, legacy NCF and internal receipts", () => {
    expect(isEcfInvoice({ ncf: null })).toBe(false);
    expect(isEcfInvoice({ ncf: "B0100000001", fiscal_mode: "ncf_legacy" })).toBe(false);
    expect(isEcfInvoice({ ncf: "", fiscal_mode: "internal_receipt" })).toBe(false);
  });
  it("points to Notas de crédito", () => {
    expect(ECF_DELETE_BLOCKED_MESSAGE).toMatch(/Notas de crédito/);
  });
});
