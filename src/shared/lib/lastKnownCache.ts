/**
 * Last-known-good cache for data the desktop app normally reads from the cloud
 * (tenant receipt info, sucursales). Lets screens survive a connectivity blip.
 * Keys are tenant-scoped and every storage access is guarded.
 */
const PREFIX = "cloudix_last_known";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function lastKnownKey(namespace: string, tenantId: string): string {
  return `${PREFIX}:${namespace}:${tenantId}`;
}

export function saveLastKnown(
  namespace: string,
  tenantId: string,
  value: unknown,
  storage: StorageLike | null = defaultStorage()
): void {
  if (!storage || !tenantId) return;
  try {
    storage.setItem(lastKnownKey(namespace, tenantId), JSON.stringify(value));
  } catch {
    // Quota or blocked storage: the cache is best-effort.
  }
}

export function loadLastKnown<T>(
  namespace: string,
  tenantId: string,
  storage: StorageLike | null = defaultStorage()
): T | null {
  if (!storage || !tenantId) return null;
  try {
    const raw = storage.getItem(lastKnownKey(namespace, tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T | null;
    return parsed ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the fresh list when non-empty (and caches it); otherwise the cached
 * list for that tenant, or [] when nothing is cached.
 */
export function resolveWithLastKnownList<T>(
  namespace: string,
  tenantId: string,
  fresh: T[],
  storage: StorageLike | null = defaultStorage()
): T[] {
  if (fresh.length > 0) {
    saveLastKnown(namespace, tenantId, fresh, storage);
    return fresh;
  }
  const cached = loadLastKnown<T[]>(namespace, tenantId, storage);
  return Array.isArray(cached) ? cached : [];
}
