import { normalizePlan } from "../../../shared/lib/planFeatures";

/**
 * Returns the maximum number of enabled company menu links allowed for a given plan.
 * Mirrors the database function `public.menu_links_plan_limit(p_plan)`.
 *
 * - empresarial: 2
 * - corporativo: 6
 * - other plans (basico, profesional, undefined, etc.): 0
 */
export function getMenuLinkLimit(plan: string | null | undefined): number {
  const normalized = normalizePlan(plan);
  switch (normalized) {
    case "empresarial":
      return 2;
    case "corporativo":
      return 6;
    default:
      return 0;
  }
}
