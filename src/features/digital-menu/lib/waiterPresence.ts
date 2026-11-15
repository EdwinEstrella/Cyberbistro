import { normalizeTenantRol } from "../../../shared/lib/roleNav";

export const WAITER_PRESENCE_ROLES = ["mesero", "cajera", "admin"] as const;
export type WaiterPresenceRole = (typeof WAITER_PRESENCE_ROLES)[number];

/**
 * Derives the Supabase Realtime channel name for waiter presence.
 */
export function waiterPresenceChannelName(tenantId: string): string {
  return `waiters:${tenantId.trim()}`;
}

/**
 * Checks if a given role is considered a waiter presence role (mesero, cajera, admin),
 * taking into account role normalization / aliases.
 */
export function isWaiterPresenceRole(rol: string | null | undefined): boolean {
  if (!rol || typeof rol !== "string") return false;
  const normalized = normalizeTenantRol(rol.trim());
  if (!normalized) return false;
  return (WAITER_PRESENCE_ROLES as readonly string[]).includes(normalized);
}

/**
 * Counts active presence entries whose payload contains a recognized waiter presence role.
 * Defensively skips malformed payloads, non-array buckets, or unknown roles.
 */
export function countOnlineWaiters(presenceState: Record<string, unknown[]> | null | undefined): number {
  if (!presenceState || typeof presenceState !== "object") return 0;

  let count = 0;
  for (const entries of Object.values(presenceState)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        "role" in entry &&
        typeof (entry as { role: unknown }).role === "string" &&
        isWaiterPresenceRole((entry as { role: string }).role)
      ) {
        count++;
      }
    }
  }

  return count;
}
