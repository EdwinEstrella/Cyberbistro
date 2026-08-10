const CACHE_KEY = 'cloudix_tenant_ctx_v1';

export interface TenantSessionRow {
  tenant_id: string;
  email: string;
  rol: string;
  nombre: string | null;
  plan?: string | null;
}

export interface TenantSessionCache extends TenantSessionRow {
  authUserId: string;
}

export interface TenantSessionCacheEntry {
  authUserId: string;
  tenantId: string;
  generation: number;
  validatedAt: string;
}

const OFFLINE_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function createTenantSessionCacheEntry(entry: TenantSessionCacheEntry): TenantSessionCacheEntry {
  return { ...entry };
}

export function getTenantSessionCacheKey(entry: TenantSessionCacheEntry): string {
  return `${entry.authUserId}:${entry.tenantId}:${entry.generation}`;
}

export function canUseOfflineTenantSession(entry: TenantSessionCacheEntry, now = new Date()): boolean {
  const validatedAt = Date.parse(entry.validatedAt);
  return Number.isFinite(validatedAt) && now.getTime() - validatedAt < OFFLINE_SESSION_MAX_AGE_MS;
}

export function readTenantSessionCache(): TenantSessionCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<TenantSessionCache>;
    if (
      !o?.authUserId ||
      !o?.tenant_id ||
      typeof o.email !== 'string' ||
      typeof o.rol !== 'string'
    ) {
      return null;
    }
    return {
      authUserId: o.authUserId,
      tenant_id: o.tenant_id,
      email: o.email,
      rol: o.rol,
      nombre: o.nombre ?? null,
      plan: o.plan ?? 'basico',
    };
  } catch {
    return null;
  }
}

export function writeTenantSessionCache(authUserId: string, row: TenantSessionRow): void {
  try {
    const payload: TenantSessionCache = {
      authUserId,
      tenant_id: row.tenant_id,
      email: row.email,
      rol: row.rol,
      nombre: row.nombre ?? null,
      plan: row.plan ?? 'basico',
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearTenantSessionCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
