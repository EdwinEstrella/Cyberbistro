const CACHE_KEY = 'cloudix_tenant_ctx_v1';

export interface TenantSessionRow {
  tenant_id: string;
  email: string;
  rol: string;
  nombre: string | null;
}

export interface TenantSessionCache extends TenantSessionRow {
  authUserId: string;
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
