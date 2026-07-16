export function canCommitTenantAsyncState(args: {
  requestGeneration: number;
  currentGeneration: number;
  requestTenantId: string;
  currentTenantId: string | null;
  accessValidated: boolean;
  cancelled?: boolean;
}): boolean {
  return !args.cancelled
    && args.requestGeneration === args.currentGeneration
    && args.requestTenantId === args.currentTenantId
    && args.accessValidated;
}
