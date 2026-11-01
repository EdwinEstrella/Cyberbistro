import { describe, expect, it } from "vitest";
import { computeSuperAdminKpis } from "../kpi";
import type { TenantRow } from "../types";

describe("computeSuperAdminKpis", () => {
  it("computes accurate counts for active, blocked and by plan", () => {
    const tenants: TenantRow[] = [
      { id: "1", nombre_negocio: "Rest 1", activa: true, plan: "basico" },
      { id: "2", nombre_negocio: "Rest 2", activa: true, plan: "profesional" },
      { id: "3", nombre_negocio: "Rest 3", activa: false, plan: "profesional" },
      { id: "4", nombre_negocio: "Rest 4", activa: true, plan: "empresarial" },
      { id: "5", nombre_negocio: "Rest 5", activa: true, plan: "corporativo" },
      { id: "6", nombre_negocio: "Rest 6", activa: false, plan: "corporativo" },
    ];

    const kpis = computeSuperAdminKpis(tenants);

    expect(kpis.total).toBe(6);
    expect(kpis.active).toBe(4);
    expect(kpis.blocked).toBe(2);
    expect(kpis.byPlan.basico).toBe(1);
    expect(kpis.byPlan.profesional).toBe(2);
    expect(kpis.byPlan.empresarial).toBe(1);
    expect(kpis.byPlan.corporativo).toBe(2);
  });

  it("handles empty tenants array gracefully", () => {
    const kpis = computeSuperAdminKpis([]);
    expect(kpis.total).toBe(0);
    expect(kpis.active).toBe(0);
    expect(kpis.blocked).toBe(0);
    expect(kpis.byPlan.basico).toBe(0);
  });
});
