import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";

/** Safe accessor for the desktop bridge (undefined in web / test node env). */
function getElectronAPI(): Window["electronAPI"] | undefined {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}

/**
 * Normalizes a raw plato row from SQLite (id as its TEXT string form,
 * disponible/va_a_cocina as 0/1 integers) or the IndexedDB mirror (already a
 * numeric id and boolean flags) into the shape Soporte.tsx/Dashboard.tsx
 * consume (`Plato`: numeric id, numeric precio, boolean flags).
 */
export function normalizePlato(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    id: Number(raw.id),
    nombre: String(raw.nombre ?? ""),
    precio: Number(raw.precio ?? 0) || 0,
    categoria: raw.categoria != null ? String(raw.categoria) : "",
    disponible: toBool(raw.disponible),
    va_a_cocina: toBool(raw.va_a_cocina),
    sucursal_id: raw.sucursal_id != null ? String(raw.sucursal_id) : null,
  };
}

/**
 * Normalizes a raw menu category row from SQLite or the IndexedDB mirror into
 * the shape Soporte.tsx/Dashboard.tsx consume (`MenuCategoryRow`).
 */
export function normalizeMenuCategory(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    id: String(raw.id),
    tenant_id: String(raw.tenant_id ?? ""),
    nombre: String(raw.nombre ?? ""),
    color: String(raw.color ?? ""),
    sort_order: Number(raw.sort_order ?? 0) || 0,
    sucursal_id: raw.sucursal_id != null ? String(raw.sucursal_id) : null,
  };
}

/**
 * Reads platos from SQLite (authoritative, via the shared catalog:list bridge)
 * unioned with the legacy IndexedDB mirror. SQLite wins on id collisions
 * (compared as strings to dodge numeric/string id drift), which also
 * collapses duplicate rows the dual-engine mirror could accumulate. Falls
 * back to the mirror alone when the desktop SQLite bridge is unavailable
 * (e.g. web).
 */
export async function readLocalPlatos(tenantId: string): Promise<Array<Record<string, unknown>>> {
  const byId = new Map<string, Record<string, unknown>>();

  let sqliteAvailable = false;
  const api = getElectronAPI();
  if (api?.listCatalog) {
    try {
      const res = await api.listCatalog();
      if (res?.ok && Array.isArray(res.data?.platos)) {
        sqliteAvailable = true;
        for (const raw of res.data.platos) {
          const row = normalizePlato(raw as Record<string, unknown>);
          byId.set(String(row.id), row);
        }
      }
    } catch (error) {
      console.warn("[catalogLocal] SQLite listCatalog (platos) failed:", error);
    }
  }

  const useMirror = sqliteAvailable
    ? true
    : await shouldReadLocalFirst(tenantId, ["platos"]).catch(() => false);
  if (useMirror) {
    try {
      const mirrorRows = await readLocalMirror<Record<string, unknown>>(tenantId, "platos");
      for (const raw of mirrorRows) {
        const row = normalizePlato(raw);
        if (!byId.has(String(row.id))) byId.set(String(row.id), row);
      }
    } catch (error) {
      console.warn("[catalogLocal] IndexedDB mirror read (platos) failed:", error);
    }
  }

  return Array.from(byId.values());
}

/**
 * Reads menu categories from SQLite (authoritative) unioned with the legacy
 * IndexedDB mirror. SQLite wins on id collisions. Falls back to the mirror
 * alone when the desktop SQLite bridge is unavailable (e.g. web).
 */
export async function readLocalMenuCategories(tenantId: string): Promise<Array<Record<string, unknown>>> {
  const byId = new Map<string, Record<string, unknown>>();

  let sqliteAvailable = false;
  const api = getElectronAPI();
  if (api?.listCatalog) {
    try {
      const res = await api.listCatalog();
      if (res?.ok && Array.isArray(res.data?.menuCategories)) {
        sqliteAvailable = true;
        for (const raw of res.data.menuCategories) {
          const row = normalizeMenuCategory(raw as Record<string, unknown>);
          byId.set(String(row.id), row);
        }
      }
    } catch (error) {
      console.warn("[catalogLocal] SQLite listCatalog (menu_categories) failed:", error);
    }
  }

  const useMirror = sqliteAvailable
    ? true
    : await shouldReadLocalFirst(tenantId, ["menu_categories"]).catch(() => false);
  if (useMirror) {
    try {
      const mirrorRows = await readLocalMirror<Record<string, unknown>>(tenantId, "menu_categories");
      for (const raw of mirrorRows) {
        const row = normalizeMenuCategory(raw);
        if (!byId.has(String(row.id))) byId.set(String(row.id), row);
      }
    } catch (error) {
      console.warn("[catalogLocal] IndexedDB mirror read (menu_categories) failed:", error);
    }
  }

  return Array.from(byId.values());
}
