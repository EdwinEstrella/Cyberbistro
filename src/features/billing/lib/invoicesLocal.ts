import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";

/** Safe accessor for the desktop bridge (undefined in web / test node env). */
function getElectronAPI(): Window["electronAPI"] | undefined {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

export interface ReadInvoicesOptions {
  sucursalId?: string | null;
  limit?: number;
}

/**
 * Normalizes a raw invoice row from SQLite (items stored as a JSON string) or
 * the IndexedDB mirror (items already an array) into the shape the billing UI
 * consumes. Every original field is preserved; only `items` is coerced to an
 * array and `id` to a string.
 */
export function normalizeInvoice(raw: Record<string, unknown>): Record<string, unknown> {
  let items: unknown = raw.items;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  if (!Array.isArray(items)) items = [];
  return { ...raw, id: String(raw.id), items };
}

/**
 * Reads invoices from SQLite (authoritative) unioned with the legacy IndexedDB
 * mirror (bridge, so invoices still living only in IndexedDB during the
 * migration are not lost). SQLite wins on id collisions, which also collapses
 * the duplicate rows the dual-engine mirror could accumulate. Falls back to the
 * mirror alone when the desktop SQLite bridge is unavailable (e.g. web).
 */
export async function readLocalInvoices(
  tenantId: string,
  options: ReadInvoicesOptions = {}
): Promise<Array<Record<string, unknown>>> {
  const { sucursalId, limit } = options;
  const byId = new Map<string, Record<string, unknown>>();

  // 1. SQLite (authoritative).
  let sqliteAvailable = false;
  const api = getElectronAPI();
  if (api?.listInvoices) {
    try {
      const res = await api.listInvoices({
        tenantId,
        sucursalId: sucursalId || undefined,
        limit: typeof limit === "number" && limit > 0 ? limit : undefined,
      });
      if (res?.ok && Array.isArray(res.data)) {
        sqliteAvailable = true;
        for (const raw of res.data) {
          const row = normalizeInvoice(raw as Record<string, unknown>);
          byId.set(String(row.id), row);
        }
      }
    } catch (error) {
      console.warn("[invoicesLocal] SQLite listInvoices failed:", error);
    }
  }

  // 2. IndexedDB mirror (bridge / fallback). Only add rows SQLite does not own.
  const useMirror = sqliteAvailable
    ? true
    : await shouldReadLocalFirst(tenantId, ["facturas"]).catch(() => false);
  if (useMirror) {
    try {
      const mirrorRows = await readLocalMirror<Record<string, unknown>>(tenantId, "facturas");
      for (const raw of mirrorRows) {
        const row = normalizeInvoice(raw);
        if (!byId.has(String(row.id))) byId.set(String(row.id), row);
      }
    } catch (error) {
      console.warn("[invoicesLocal] IndexedDB mirror read failed:", error);
    }
  }

  let rows = Array.from(byId.values());
  if (sucursalId) {
    rows = rows.filter((row) => {
      const branch = row.sucursal_id;
      return !branch || branch === sucursalId;
    });
  }
  rows.sort(
    (a, b) => new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime()
  );
  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}
