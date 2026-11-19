export const LOCAL_BRANCH_SENTINEL = "main-process-default";

/**
 * Normalizes a branch identifier for remote cloud syncing.
 * Returns a trimmed non-empty string that is not the local process sentinel, else null.
 */
export function toRemoteBranchId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === LOCAL_BRANCH_SENTINEL) {
    return null;
  }
  return trimmed;
}
