/**
 * Desktop branches (sucursales) live in SQLite in the Electron main process
 * (cloud rows are pulled there). This reads them through the trusted
 * `catalog:list` bridge so branch resolution never depends on the cloud.
 */
export interface LocalSucursalRow {
  id: string;
  tenant_id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  activa: boolean;
}

/** Normalizes raw bridge rows; drops malformed entries and rows of another tenant. */
export function normalizeLocalSucursales(raw: unknown, tenantId: string): LocalSucursalRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: LocalSucursalRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.id == null || String(row.id).trim() === "") continue;
    if (row.tenant_id != null && String(row.tenant_id) !== tenantId) continue;
    rows.push({
      id: String(row.id),
      tenant_id: tenantId,
      nombre: typeof row.nombre === "string" && row.nombre.trim() ? row.nombre : "Sucursal",
      direccion: typeof row.direccion === "string" ? row.direccion : null,
      telefono: typeof row.telefono === "string" ? row.telefono : null,
      activa: row.activa !== false && row.activa !== 0,
    });
  }
  return rows;
}

/** Reads cloud-synced branches from desktop SQLite; [] when the bridge is unavailable. */
export async function readLocalSucursales(tenantId: string): Promise<LocalSucursalRow[]> {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;
  if (!api?.listCatalog) return [];
  try {
    const res = await api.listCatalog();
    return res?.ok ? normalizeLocalSucursales(res.data?.sucursales, tenantId) : [];
  } catch (error) {
    console.warn("[localSucursales] SQLite listCatalog (sucursales) failed:", error);
    return [];
  }
}
