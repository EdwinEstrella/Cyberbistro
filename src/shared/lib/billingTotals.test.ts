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

  it("splits an ITBIS-inclusive price into base and ITBIS", () => {
    expect(
      calculateInvoiceTotals({ subtotal: 100, itbisRate: 0.18, propinaEnabled: false, itbisIncluded: true }),
    ).toEqual({ subtotal: 84.75, itbis: 15.25, propina: 0, total: 100 });
  });

  it("keeps propina on the gross menu amount when ITBIS is included", () => {
    expect(
      calculateInvoiceTotals({ subtotal: 100, itbisRate: 0.18, propinaEnabled: true, itbisIncluded: true }),
    ).toEqual({ subtotal: 84.75, itbis: 15.25, propina: 10, total: 110 });
  });

  it("ignores the inclusive flag when the ITBIS rate is zero", () => {
    expect(
      calculateInvoiceTotals({ subtotal: 100, itbisRate: 0, propinaEnabled: false, itbisIncluded: true }),
    ).toEqual({ subtotal: 100, itbis: 0, propina: 0, total: 100 });
  });

  it("is identical to the exclusive path when the flag is false", () => {
    expect(
      calculateInvoiceTotals({ subtotal: 1000, itbisRate: 0.18, propinaEnabled: true, itbisIncluded: false }),
    ).toEqual(calculateInvoiceTotals({ subtotal: 1000, itbisRate: 0.18, propinaEnabled: true }));
  });
});
