import { describe, expect, it } from "vitest";
import {
  canUseFeature,
  getRequiredPlan,
  normalizePlan,
  Feature,
} from "./planFeatures";

describe("planFeatures", () => {
  const allFeatures: Feature[] = [
    "advanced_inventory",
    "inventory_purchases",
    "accounts_receivable",
    "accounts_payable",
    "suppliers",
    "finance_reports",
  ];

  it("basico no tiene features", () => {
    allFeatures.forEach((feature) => {
      expect(canUseFeature("basico", feature)).toBe(false);
    });
  });

  it("profesional tiene todas las features", () => {
    allFeatures.forEach((feature) => {
      expect(canUseFeature("profesional", feature)).toBe(true);
    });
  });

  it("empresarial tiene todas las features", () => {
    allFeatures.forEach((feature) => {
      expect(canUseFeature("empresarial", feature)).toBe(true);
    });
  });

  it("null, undefined o planes desconocidos se normalizan a basico (sin acceso)", () => {
    expect(canUseFeature(null, "suppliers")).toBe(false);
    expect(canUseFeature(undefined, "suppliers")).toBe(false);
    expect(canUseFeature("unknown_plan", "suppliers")).toBe(false);
    expect(canUseFeature("premium", "suppliers")).toBe(false);

    expect(normalizePlan(null)).toBe("basico");
    expect(normalizePlan(undefined)).toBe("basico");
    expect(normalizePlan("unknown")).toBe("basico");
    expect(normalizePlan("profesional")).toBe("profesional");
    expect(normalizePlan("empresarial")).toBe("empresarial");
    expect(normalizePlan("basico")).toBe("basico");
  });

  it("getRequiredPlan retorna el plan minimo requerido (profesional)", () => {
    allFeatures.forEach((feature) => {
      expect(getRequiredPlan(feature)).toBe("profesional");
    });
  });
});
