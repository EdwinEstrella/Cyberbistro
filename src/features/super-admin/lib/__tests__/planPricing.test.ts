import { describe, expect, it } from "vitest";
import {
  PLAN_PRICES,
  PLAN_TIERS,
  ALL_PLAN_TIERS,
  getPlanPrice,
  getPlanTier,
} from "../planPricing";

describe("planPricing", () => {
  it("defines the exact monthly prices as specified (50/90/175/299)", () => {
    expect(PLAN_PRICES.basico).toBe(50);
    expect(PLAN_PRICES.profesional).toBe(90);
    expect(PLAN_PRICES.empresarial).toBe(175);
    expect(PLAN_PRICES.corporativo).toBe(299);
  });

  it("provides plan metadata with bullets matching website pricing cards and real limits", () => {
    expect(ALL_PLAN_TIERS).toHaveLength(4);
    expect(PLAN_TIERS.corporativo.priceMonthlyUsd).toBe(299);

    for (const tier of ALL_PLAN_TIERS) {
      expect(tier.name).toBeTruthy();
      expect(tier.priceMonthlyUsd).toBeGreaterThan(0);
      expect(tier.bullets.length).toBeGreaterThanOrEqual(7);
      expect(tier.bullets.length).toBeLessThanOrEqual(9);
    }

    // Basico real limits & features
    expect(PLAN_TIERS.basico.bullets).toContain("1 Sucursal Física");
    expect(PLAN_TIERS.basico.bullets).toContain("Hasta 3 Usuarios (+ Admin)");

    // Profesional real limits (3 sucursales, 5 usuarios)
    expect(PLAN_TIERS.profesional.bullets).toContain("Hasta 3 Sucursales");
    expect(PLAN_TIERS.profesional.bullets).toContain("Hasta 5 Usuarios (+ Admin)");
    expect(PLAN_TIERS.profesional.bullets).toContain("Facturación Electrónica e-CF (DGII)");

    // Empresarial (ilimitadas, 2 links)
    expect(PLAN_TIERS.empresarial.bullets).toContain("Sucursales y Usuarios Ilimitados");
    expect(PLAN_TIERS.empresarial.bullets).toContain("Menú digital para empresas: hasta 2 links");

    // Corporativo (6 links, factura mensual consolidada only - not quincenal)
    expect(PLAN_TIERS.corporativo.bullets).toContain("Menú digital para empresas: hasta 6 links");
    expect(PLAN_TIERS.corporativo.bullets).toContain("Factura Consolidada e-CF Mensual por Empresa");
    expect(
      PLAN_TIERS.corporativo.bullets.some((b) => b.toLowerCase().includes("quincenal"))
    ).toBe(false);
  });

  it("marks Empresarial as the only recommended plan", () => {
    const recommended = ALL_PLAN_TIERS.filter((tier) => tier.recommended).map((tier) => tier.id);
    expect(recommended).toEqual(["empresarial"]);
  });

  it("handles getPlanPrice with fallbacks", () => {
    expect(getPlanPrice("corporativo")).toBe(299);
    expect(getPlanPrice("CORPORATIVO")).toBe(299);
    expect(getPlanPrice("profesional")).toBe(90);
    expect(getPlanPrice(null)).toBe(50);
    expect(getPlanPrice("unknown")).toBe(50);
  });

  it("handles getPlanTier with fallbacks", () => {
    expect(getPlanTier("empresarial").id).toBe("empresarial");
    expect(getPlanTier(undefined).id).toBe("basico");
  });
});
