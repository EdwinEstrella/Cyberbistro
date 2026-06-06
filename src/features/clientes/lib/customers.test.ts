import { describe, expect, it } from "vitest";
import { customerLabel, customerMatchesSearch, normalizeCustomerInput, summarizeCustomerInvoices, type Customer } from "./customers";

describe("customers domain helpers", () => {
  it("normaliza campos vacios a null y exige nombre", () => {
    expect(normalizeCustomerInput({ name: "  Ana  ", phone: " ", email: " TEST@EMAIL.COM " })).toMatchObject({
      name: "Ana",
      phone: null,
      email: "test@email.com",
    });

    expect(() => normalizeCustomerInput({ name: "   " })).toThrow("nombre");
  });

  it("construye etiqueta buscable con documento o telefono", () => {
    expect(customerLabel({ name: "Ana", document_id: "001", phone: "809" })).toBe("Ana · 001");
    expect(customerLabel({ name: "Luis", document_id: null, phone: "809" })).toBe("Luis · 809");
  });

  it("busca por nombre, telefono, email o documento", () => {
    const customer = {
      id: "c1",
      tenant_id: "t1",
      name: "Restaurante Demo",
      phone: "8095551111",
      email: "cliente@demo.com",
      document_id: "RNC-123",
    } as Customer;

    expect(customerMatchesSearch(customer, "demo")).toBe(true);
    expect(customerMatchesSearch(customer, "555")).toBe(true);
    expect(customerMatchesSearch(customer, "rnc")).toBe(true);
    expect(customerMatchesSearch(customer, "otro")).toBe(false);
  });

  it("resume solo facturas pagadas para historial del cliente", () => {
    expect(
      summarizeCustomerInvoices([
        { total: 100, estado: "pagada", pagada_at: "2026-06-01T00:00:00Z" },
        { total: 50, estado: "cancelada", pagada_at: "2026-06-02T00:00:00Z" },
      ])
    ).toEqual({
      totalSpent: 100,
      invoiceCount: 1,
      lastInvoiceAt: "2026-06-01T00:00:00Z",
    });
  });
});
