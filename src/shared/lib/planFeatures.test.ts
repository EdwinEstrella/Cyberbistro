import { describe, expect, it } from "vitest";
import {
  canUseFeature,
  getRequiredPlan,
  isPlanAtLeast,
  normalizePlan,
  planRank,
  Feature,
  PLAN_LABELS,
  PLAN_ORDER,
} from "./planFeatures";

describe("planFeatures", () => {
  const baseProfessionalFeatures: Feature[] = [
    "advanced_inventory",
    "inventory_purchases",
    "accounts_receivable",
    "accounts_payable",
    "suppliers",
    "finance_reports",
    "digital_menu",
    "dgii_ecf",
  ];

  const corporateExclusiveFeatures: Feature[] = [
    "consolidated_invoice",
    "employee_roster",
    "credit_limit",
  ];

  it("basico no tiene features", () => {
    baseProfessionalFeatures.forEach((feature) => {
      expect(canUseFeature("basico", feature)).toBe(false);
    });
    expect(canUseFeature("basico", "menu_links")).toBe(false);
    corporateExclusiveFeatures.forEach((feature) => {
      expect(canUseFeature("basico", feature)).toBe(false);
    });
  });

  it("profesional tiene todas las features base pero no menu_links ni exclusivas de corporativo", () => {
    baseProfessionalFeatures.forEach((feature) => {
      expect(canUseFeature("profesional", feature)).toBe(true);
    });
    expect(canUseFeature("profesional", "menu_links")).toBe(false);
    corporateExclusiveFeatures.forEach((feature) => {
      expect(canUseFeature("profesional", feature)).toBe(false);
    });
  });

  it("empresarial tiene todas las features base y menu_links, pero NO las 3 exclusivas de corporativo", () => {
    baseProfessionalFeatures.forEach((feature) => {
      expect(canUseFeature("empresarial", feature)).toBe(true);
    });
    expect(canUseFeature("empresarial", "menu_links")).toBe(true);
    corporateExclusiveFeatures.forEach((feature) => {
      expect(canUseFeature("empresarial", feature)).toBe(false);
    });
  });

  it("corporativo tiene todas las features de empresarial mas las 3 exclusivas", () => {
    baseProfessionalFeatures.forEach((feature) => {
      expect(canUseFeature("corporativo", feature)).toBe(true);
    });
    expect(canUseFeature("corporativo", "menu_links")).toBe(true);
    corporateExclusiveFeatures.forEach((feature) => {
      expect(canUseFeature("corporativo", feature)).toBe(true);
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
    expect(normalizePlan("corporativo")).toBe("corporativo");
    expect(normalizePlan(" CORPORATIVO ")).toBe("corporativo");
    expect(normalizePlan("basico")).toBe("basico");
  });

  it("getRequiredPlan mapea correctamente segun el nivel requerido", () => {
    baseProfessionalFeatures.forEach((feature) => {
      expect(getRequiredPlan(feature)).toBe("profesional");
    });
    expect(getRequiredPlan("menu_links")).toBe("empresarial");
    corporateExclusiveFeatures.forEach((feature) => {
      expect(getRequiredPlan(feature)).toBe("corporativo");
    });
  });

  it("PLAN_ORDER respeta la jerarquia definida", () => {
    expect(PLAN_ORDER).toEqual(["basico", "profesional", "empresarial", "corporativo"]);
  });

  it("PLAN_LABELS contiene las etiquetas profesionales en espanol", () => {
    expect(PLAN_LABELS).toEqual({
      basico: "Básico",
      profesional: "Profesional",
      empresarial: "Empresarial",
      corporativo: "Corporativo",
    });
  });

  it("planRank calcula el rango jerarquico de cada plan", () => {
    expect(planRank("basico")).toBe(0);
    expect(planRank("profesional")).toBe(1);
    expect(planRank("empresarial")).toBe(2);
    expect(planRank("corporativo")).toBe(3);
    expect(planRank(null)).toBe(0);
    expect(planRank(undefined)).toBe(0);
    expect(planRank("invalido")).toBe(0);
  });

  it("isPlanAtLeast evalua correctamente el orden de planes", () => {
    expect(isPlanAtLeast("corporativo", "corporativo")).toBe(true);
    expect(isPlanAtLeast("corporativo", "empresarial")).toBe(true);
    expect(isPlanAtLeast("corporativo", "profesional")).toBe(true);
    expect(isPlanAtLeast("corporativo", "basico")).toBe(true);

    expect(isPlanAtLeast("empresarial", "corporativo")).toBe(false);
    expect(isPlanAtLeast("empresarial", "empresarial")).toBe(true);
    expect(isPlanAtLeast("empresarial", "profesional")).toBe(true);
    expect(isPlanAtLeast("empresarial", "basico")).toBe(true);

    expect(isPlanAtLeast("profesional", "corporativo")).toBe(false);
    expect(isPlanAtLeast("profesional", "empresarial")).toBe(false);
    expect(isPlanAtLeast("profesional", "profesional")).toBe(true);
    expect(isPlanAtLeast("profesional", "basico")).toBe(true);

    expect(isPlanAtLeast("basico", "corporativo")).toBe(false);
    expect(isPlanAtLeast("basico", "empresarial")).toBe(false);
    expect(isPlanAtLeast("basico", "profesional")).toBe(false);
    expect(isPlanAtLeast("basico", "basico")).toBe(true);

    expect(isPlanAtLeast(null, "basico")).toBe(true);
    expect(isPlanAtLeast(null, "profesional")).toBe(false);
  });
});
