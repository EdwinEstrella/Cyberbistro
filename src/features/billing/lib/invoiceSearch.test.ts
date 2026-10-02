import { describe, expect, it } from "vitest";
import {
  INVOICE_SEARCH_LIMIT,
  buildInvoiceSearchOrFilter,
  filterOnlyWithNcf,
  hasNcf,
  invoiceMatchesQuery,
  parseInvoiceNumberQuery,
  sanitizeInvoiceQueryForPostgrest,
  searchInvoices,
} from "./invoiceSearch";

const inv = (o: Record<string, unknown> = {}) => ({
  numero_factura: 1,
  created_at: "2026-01-01T10:00:00Z",
  ncf: null,
  cliente_nombre: null,
  cliente_rnc: null,
  notas: null,
  ...o,
});

describe("parseInvoiceNumberQuery", () => {
  it("strips # and leading zeros", () => {
    expect(parseInvoiceNumberQuery("4055")).toBe(4055);
    expect(parseInvoiceNumberQuery("#4055")).toBe(4055);
    expect(parseInvoiceNumberQuery("#004055")).toBe(4055);
    expect(parseInvoiceNumberQuery(" 004055 ")).toBe(4055);
  });
  it("returns null for non-numeric input", () => {
    expect(parseInvoiceNumberQuery("B01")).toBeNull();
    expect(parseInvoiceNumberQuery("40 55")).toBeNull();
    expect(parseInvoiceNumberQuery("")).toBeNull();
  });
});

describe("invoiceMatchesQuery", () => {
  it("matches the invoice number exactly, not partially", () => {
    expect(invoiceMatchesQuery(inv({ numero_factura: 4055 }), "#004055")).toBe(true);
    expect(invoiceMatchesQuery(inv({ numero_factura: 14055 }), "4055")).toBe(false);
    expect(invoiceMatchesQuery(inv({ numero_factura: 405 }), "4055")).toBe(false);
  });
  it("matches NCF as a case-insensitive substring", () => {
    const i = inv({ ncf: "B0100000197" });
    expect(invoiceMatchesQuery(i, "b0100000197")).toBe(true);
    expect(invoiceMatchesQuery(i, "197")).toBe(true);
    expect(invoiceMatchesQuery(i, "b02")).toBe(false);
  });
  it("matches client name ignoring case and accents", () => {
    const i = inv({ cliente_nombre: "José Pérez" });
    expect(invoiceMatchesQuery(i, "jose")).toBe(true);
    expect(invoiceMatchesQuery(i, "PEREZ")).toBe(true);
    expect(invoiceMatchesQuery(i, "José")).toBe(true);
    expect(invoiceMatchesQuery(i, "maria")).toBe(false);
  });
  it("matches RNC with or without dashes", () => {
    expect(invoiceMatchesQuery(inv({ cliente_rnc: "101142162" }), "101-142-162")).toBe(true);
    expect(invoiceMatchesQuery(inv({ cliente_rnc: "101-14-2162" }), "101142162")).toBe(true);
    expect(invoiceMatchesQuery(inv({ cliente_rnc: "101142162" }), "142")).toBe(true);
    expect(invoiceMatchesQuery(inv({ cliente_rnc: "101142162" }), "99")).toBe(false);
  });
  it("does not substring-match RNC with fewer than 3 digits", () => {
    expect(invoiceMatchesQuery(inv({ cliente_rnc: "101142162", numero_factura: 7 }), "11")).toBe(false);
  });
  it("matches notes ignoring case and accents", () => {
    expect(invoiceMatchesQuery(inv({ notas: "Sin cebolla, sí por favor" }), "SI POR")).toBe(true);
    expect(invoiceMatchesQuery(inv({ notas: "otra" }), "cebolla")).toBe(false);
  });
  it("never matches an empty query", () => {
    expect(invoiceMatchesQuery(inv({ notas: "x" }), "   ")).toBe(false);
  });
});

describe("hasNcf / filterOnlyWithNcf", () => {
  it("detects non-blank NCFs", () => {
    expect(hasNcf({ ncf: null })).toBe(false);
    expect(hasNcf({})).toBe(false);
    expect(hasNcf({ ncf: "" })).toBe(false);
    expect(hasNcf({ ncf: "   " })).toBe(false);
    expect(hasNcf({ ncf: "B0100000197" })).toBe(true);
  });
  it("filters only when enabled", () => {
    const list = [{ ncf: "B01" }, { ncf: "" }, { ncf: null }, { ncf: " " }];
    expect(filterOnlyWithNcf(list, false)).toBe(list);
    expect(filterOnlyWithNcf(list, true)).toEqual([{ ncf: "B01" }]);
  });
  it("combines with a search query", () => {
    const withNcf = inv({ numero_factura: 1, ncf: "B0100000001", notas: "mesa" });
    const without = inv({ numero_factura: 2, ncf: "", notas: "mesa" });
    expect(searchInvoices([withNcf, without], "mesa").rows).toHaveLength(2);
    expect(searchInvoices([withNcf, without], "mesa", 200, { onlyWithNcf: true }).rows).toEqual([withNcf]);
  });
});

describe("searchInvoices", () => {
  it("returns nothing for an empty query", () => {
    expect(searchInvoices([inv()], "  ")).toEqual({ rows: [], capped: false });
  });
  it("sorts by created_at descending", () => {
    const a = inv({ numero_factura: 1, notas: "mesa", created_at: "2026-01-01T00:00:00Z" });
    const b = inv({ numero_factura: 2, notas: "mesa", created_at: "2026-03-01T00:00:00Z" });
    const c = inv({ numero_factura: 3, notas: "mesa", created_at: "2026-02-01T00:00:00Z" });
    expect(searchInvoices([a, b, c], "mesa").rows.map((r) => r.numero_factura)).toEqual([2, 3, 1]);
  });
  it("caps results and reports it", () => {
    const many = Array.from({ length: INVOICE_SEARCH_LIMIT + 5 }, (_, i) =>
      inv({ numero_factura: i + 1, notas: "x", created_at: new Date(2026, 0, 1, 0, i).toISOString() }),
    );
    const res = searchInvoices(many, "x");
    expect(res.rows).toHaveLength(INVOICE_SEARCH_LIMIT);
    expect(res.capped).toBe(true);
    expect(searchInvoices(many.slice(0, 3), "x").capped).toBe(false);
  });
});

describe("postgrest filter", () => {
  it("removes injection characters", () => {
    expect(sanitizeInvoiceQueryForPostgrest('a,b(c)*d\\e%f"g   h')).toBe("a b c d e f g h");
    expect(sanitizeInvoiceQueryForPostgrest(",()*%")).toBe("");
  });
  it("builds a text-only filter", () => {
    expect(buildInvoiceSearchOrFilter("pérez")).toBe(
      "ncf.ilike.*pérez*,cliente_nombre.ilike.*pérez*,cliente_rnc.ilike.*pérez*,notas.ilike.*pérez*",
    );
  });
  it("adds numero_factura for numeric queries", () => {
    expect(buildInvoiceSearchOrFilter("#004055")).toContain(",numero_factura.eq.4055");
  });
  it("adds a digits-only RNC variant when dashes are present", () => {
    expect(buildInvoiceSearchOrFilter("101-142-162")).toContain(",cliente_rnc.ilike.*101142162*");
  });
  it("returns null when nothing is left", () => {
    expect(buildInvoiceSearchOrFilter(",,()")).toBeNull();
  });
});
