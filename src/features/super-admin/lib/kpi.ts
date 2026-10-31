import type { TenantRow, SuperAdminKpis } from "./types";
import type { Plan } from "../../../shared/lib/planFeatures";

export function computeSuperAdminKpis(tenants: TenantRow[]): SuperAdminKpis {
  let active = 0;
  let blocked = 0;
  const byPlan: Record<Plan, number> = {
    basico: 0,
    profesional: 0,
    empresarial: 0,
    corporativo: 0,
  };

  for (const t of tenants) {
    if (t.activa === false) {
      blocked++;
    } else {
      active++;
    }

    const planKey = (t.plan?.toLowerCase() ?? "basico") as Plan;
    if (planKey in byPlan) {
      byPlan[planKey]++;
    } else {
      byPlan.basico++;
    }
  }

  return {
    total: tenants.length,
    active,
    blocked,
    byPlan,
  };
}
