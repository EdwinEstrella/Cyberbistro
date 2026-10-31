export type Plan = "basico" | "profesional" | "empresarial" | "corporativo";

export const PLAN_ORDER: readonly Plan[] = [
  "basico",
  "profesional",
  "empresarial",
  "corporativo",
] as const;

export const PLAN_LABELS: Record<Plan, string> = {
  basico: "Básico",
  profesional: "Profesional",
  empresarial: "Empresarial",
  corporativo: "Corporativo",
};

export type Feature =
  | "advanced_inventory"
  | "inventory_purchases"
  | "accounts_receivable"
  | "accounts_payable"
  | "suppliers"
  | "finance_reports"
  | "digital_menu"
  | "dgii_ecf"
  | "menu_links"
  | "consolidated_invoice"
  | "employee_roster"
  | "credit_limit";

export const PLAN_FEATURES: Record<Plan, ReadonlySet<Feature>> = {
  basico: new Set<Feature>(),
  profesional: new Set<Feature>([
    "advanced_inventory",
    "inventory_purchases",
    "accounts_receivable",
    "accounts_payable",
    "suppliers",
    "finance_reports",
    "digital_menu",
    "dgii_ecf",
  ]),
  empresarial: new Set<Feature>([
    "advanced_inventory",
    "inventory_purchases",
    "accounts_receivable",
    "accounts_payable",
    "suppliers",
    "finance_reports",
    "digital_menu",
    "dgii_ecf",
    "menu_links",
  ]),
  corporativo: new Set<Feature>([
    "advanced_inventory",
    "inventory_purchases",
    "accounts_receivable",
    "accounts_payable",
    "suppliers",
    "finance_reports",
    "digital_menu",
    "dgii_ecf",
    "menu_links",
    "consolidated_invoice",
    "employee_roster",
    "credit_limit",
  ]),
};

export function normalizePlan(plan: string | null | undefined): Plan {
  if (!plan) return "basico";
  const normalized = plan.trim().toLowerCase();
  if (
    normalized === "profesional" ||
    normalized === "empresarial" ||
    normalized === "corporativo" ||
    normalized === "basico"
  ) {
    return normalized as Plan;
  }
  return "basico";
}

export function planRank(plan: string | null | undefined): number {
  const normalized = normalizePlan(plan);
  const index = PLAN_ORDER.indexOf(normalized);
  return index >= 0 ? index : 0;
}

export function isPlanAtLeast(plan: string | null | undefined, min: Plan): boolean {
  return planRank(plan) >= planRank(min);
}

export function canUseFeature(plan: string | null | undefined, feature: Feature): boolean {
  const normalized = normalizePlan(plan);
  return PLAN_FEATURES[normalized].has(feature);
}

export function getRequiredPlan(feature: Feature): Plan {
  if (
    feature === "consolidated_invoice" ||
    feature === "employee_roster" ||
    feature === "credit_limit"
  ) {
    return "corporativo";
  }
  if (feature === "menu_links") {
    return "empresarial";
  }
  return "profesional";
}
