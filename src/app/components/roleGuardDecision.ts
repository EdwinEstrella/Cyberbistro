import { defaultRouteForRol, isAppRouteAllowed } from "../../shared/lib/roleNav";

type DecisionInput = {
  loading: boolean;
  isAuthenticated: boolean;
  userExists: boolean;
  tenantId: string | null;
  rol: string | null;
  pathname: string;
};

export type RoleGuardDecision =
  | { type: "loading" }
  | { type: "redirect_login" }
  | { type: "tenant_link_required" }
  | { type: "redirect_role"; to: string }
  | { type: "allow" };

export function getRoleGuardDecision(input: DecisionInput): RoleGuardDecision {
  if (input.loading) return { type: "loading" };
  if (!input.isAuthenticated) return { type: "redirect_login" };
  if (input.userExists && !input.tenantId) return { type: "tenant_link_required" };
  if (!isAppRouteAllowed(input.rol, input.pathname)) {
    return { type: "redirect_role", to: defaultRouteForRol(input.rol) };
  }
  return { type: "allow" };
}
