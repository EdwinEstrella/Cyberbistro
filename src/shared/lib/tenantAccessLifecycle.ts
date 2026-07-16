let accessGeneration = 0;

export function getTenantAccessGeneration(): number {
  return accessGeneration;
}

export function advanceTenantAccessGeneration(): number {
  accessGeneration += 1;
  return accessGeneration;
}

export function canContinueTenantWork(tenantId: string, generation: number): boolean {
  return generation === accessGeneration && Boolean(tenantId);
}
