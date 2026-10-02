import { describe, expect, it } from "vitest";
import { canDeleteInvoices, canEditInvoiceHeader, canViewBillingSummaries } from "./roleNav";

describe("invoice permissions by role", () => {
  it("only admin can delete invoices", () => {
    expect(canDeleteInvoices("admin")).toBe(true);
    for (const rol of ["cajera", "ventas", "vendedor", "cajero", "contabilidad", "mesero", "cocina", null]) {
      expect(canDeleteInvoices(rol)).toBe(false);
    }
  });

  it("admin and sales roles can edit the invoice header", () => {
    for (const rol of ["admin", "cajera", "ventas", "vendedor", "vender", "cajero"]) {
      expect(canEditInvoiceHeader(rol)).toBe(true);
    }
  });

  it("sales roles see only invoices, not cycles/finance summaries", () => {
    for (const rol of ["cajera", "ventas", "vendedor", "cajero"]) {
      expect(canViewBillingSummaries(rol)).toBe(false);
    }
    for (const rol of ["admin", "contabilidad"]) {
      expect(canViewBillingSummaries(rol)).toBe(true);
    }
  });

  it("other roles cannot edit the invoice header", () => {
    for (const rol of ["contabilidad", "mesero", "cocina", "unknown", null]) {
      expect(canEditInvoiceHeader(rol)).toBe(false);
    }
  });
});
