import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals } from "./billingTotals";

describe("calculateInvoiceTotals", () => {
  it("keeps legal gratuity at zero when disabled", () => {
    expect(calculateInvoiceTotals({ subtotal: 1000, itbisRate: 0.18, propinaEnabled: false })).toEqual({
      subtotal: 1000,
      itbis: 180,
      propina: 0,
      total: 1180,
    });
  });

  it("charges 10% legal gratuity on subtotal and includes it in the total", () => {
    expect(calculateInvoiceTotals({ subtotal: 1000, itbisRate: 0.18, propinaEnabled: true })).toEqual({
      subtotal: 1000,
      itbis: 180,
      propina: 100,
      total: 1280,
    });
  });
});
