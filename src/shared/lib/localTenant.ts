/**
 * Desktop tenant settings (billing, NCF sequences, receipt headers) live in
 * SQLite in the Electron main process (the current tenant's cloud row is pulled
 * there). This reads them through the trusted `catalog:list` bridge so billing
 * and printing never depend on the cloud.
 */

/** Normalizes the raw bridge row; null when malformed or of another tenant. */
export function normalizeLocalTenant(raw: unknown, tenantId: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.id != null && String(row.id) !== tenantId) return null;
  return { ...row, id: tenantId };
}

/** Reads the cloud-synced tenant row from desktop SQLite; null when unavailable or never pulled. */
export async function readLocalTenant(tenantId: string): Promise<Record<string, unknown> | null> {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (!api?.listCatalog) return null;
  try {
    const res = await api.listCatalog();
    return res?.ok ? normalizeLocalTenant(res.data?.tenant, tenantId) : null;
  } catch (error) {
    console.warn("[localTenant] SQLite listCatalog (tenant) failed:", error);
    return null;
  }
}
