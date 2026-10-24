import { describe, expect, it } from "vitest";
import { summarizeCycleSales } from "./cycleSales";

const sale = (over: Record<string, unknown> = {}) => ({
  id: "f1", estado: "pagada", metodo_pago: "efectivo", subtotal: 100, itbis: 18, propina: 10, total: 128, ...over,
});

describe("summarizeCycleSales", () => {
  it("sums sales, cxc payments and groups by method", () => {
    const r = summarizeCycleSales([sale(), sale({ id: "f2", metodo_pago: "tarjeta" })], [{ metodo_pago: "efectivo", monto: 50 }]);
    expect(r.totalPagado).toBe(128 * 2 + 50);
    expect(r.subtotalPagado).toBe(200);
    expect(r.itbisPagado).toBe(36);
    expect(r.propinaPagado).toBe(20);
    expect(r.porMetodo).toEqual([
      { metodo: "efectivo", cantidad: 2, total: 178 },
      { metodo: "tarjeta", cantidad: 1, total: 128 },
    ]);
  });

  it("excludes credit notes from every sales figure", () => {
    const note = sale({ id: "nc", estado: "nota_credito", total: 128 });
    const withNote = summarizeCycleSales([sale(), note], []);
    const without = summarizeCycleSales([sale()], []);
    expect(withNote.totalPagado).toBe(without.totalPagado);
    expect(withNote.subtotalPagado).toBe(without.subtotalPagado);
    expect(withNote.itbisPagado).toBe(without.itbisPagado);
    expect(withNote.propinaPagado).toBe(without.propinaPagado);
    expect(withNote.porMetodo).toEqual([{ metodo: "efectivo", cantidad: 1, total: 128 }]);
  });

  it("keeps the credit note in the returned list so lists still show it", () => {
    const note = sale({ id: "nc", estado: "nota_credito" });
    expect(summarizeCycleSales([sale(), note], []).facturas).toHaveLength(2);
  });
});
