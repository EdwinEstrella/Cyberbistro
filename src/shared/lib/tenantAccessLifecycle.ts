let accessGeneration = 0;

export function getTenantAccessGeneration(): number {
  return accessGeneration;
}

export function advanceTenantAccessGeneration(): number {
  accessGeneration += 1;
  return accessGeneration;
}

/**
 * A background re-check that cannot reach the cloud says nothing about access.
 * Dropping an already-validated session to "pending" unmounts every protected
 * route (RoleGuard shows its loader), so screens like Analytics restart from
 * scratch on each network hiccup. Keep the validated session in that case.
 */
export function shouldKeepValidatedAccess(
  status: string,
  currentlyValidated: boolean,
): boolean {
  return currentlyValidated && status === "cloud_unavailable";
}

export function canContinueTenantWork(tenantId: string, generation: number): boolean {
  return generation === accessGeneration && Boolean(tenantId);
}
