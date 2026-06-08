export type Plan = "basico" | "profesional" | "empresarial";

export type Feature =
  | "advanced_inventory"
  | "inventory_purchases"
  | "accounts_receivable"
  | "accounts_payable"
  | "suppliers"
  | "finance_reports";

export const PLAN_FEATURES: Record<Plan, ReadonlySet<Feature>> = {
  basico: new Set<Feature>(),
  profesional: new Set<Feature>([
    "advanced_inventory",
    "inventory_purchases",
    "accounts_receivable",
    "accounts_payable",
    "suppliers",
    "finance_reports",
  ]),
  empresarial: new Set<Feature>([
    "advanced_inventory",
    "inventory_purchases",
    "accounts_receivable",
    "accounts_payable",
    "suppliers",
    "finance_reports",
  ]),
};

export function normalizePlan(plan: string | null | undefined): Plan {
  if (!plan) return "basico";
  const normalized = plan.trim().toLowerCase();
  if (normalized === "profesional" || normalized === "empresarial" || normalized === "basico") {
    return normalized as Plan;
  }
  return "basico";
}

export function canUseFeature(plan: string | null | undefined, feature: Feature): boolean {
  const normalized = normalizePlan(plan);
  return PLAN_FEATURES[normalized].has(feature);
}

export function getRequiredPlan(feature: Feature): Plan {
  // Currently, all features are enabled on 'profesional' and 'empresarial'.
  // Thus, the minimum plan required is 'profesional'.
  return "profesional";
}
