import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";

/** Safe accessor for the desktop bridge (undefined in web / test node env). */
function getElectronAPI(): Window["electronAPI"] | undefined {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

export interface ReadCierresOptions {
  sucursalId?: string | null;
  limit?: number;
}

/**
 * Normalizes an operational-cycle row from SQLite (exposes `efectivo_inicial` as
 * an alias of `opening_cash`) or the IndexedDB mirror (already `efectivo_inicial`)
 * into the shape the cierre/billing screens consume. `cycle_number` is coerced to
 * a number so ordering and next-number math never see a string.
 */
export function normalizeCierre(raw: Record<string, unknown>): Record<string, unknown> {
  const efectivo = raw.efectivo_inicial ?? raw.opening_cash ?? 0;
  return {
    ...raw,
    id: String(raw.id),
    efectivo_inicial: Number(efectivo) || 0,
    cycle_number: Number(raw.cycle_number) || 0,
  };
}

/**
 * Reads operational cycles from SQLite (authoritative) unioned with the legacy
 * IndexedDB mirror (bridge). SQLite wins on id collisions, so a device whose
 * mirror lagged behind the cloud (e.g. showing cycle 103 while the cloud had 105)
 * now reflects the pulled SQLite truth, and duplicate mirror rows collapse. Falls
 * back to the mirror alone when the desktop SQLite bridge is unavailable (web).
 */
export async function readLocalCierres(
  tenantId: string,
  options: ReadCierresOptions = {}
): Promise<Array<Record<string, unknown>>> {
  const { sucursalId, limit } = options;
  const byId = new Map<string, Record<string, unknown>>();

  let sqliteAvailable = false;
  const api = getElectronAPI();
  if (api?.listCierres) {
    try {
      const res = await api.listCierres({
        tenantId,
        sucursalId: sucursalId || undefined,
        limit: limit ?? 500,
      });
      if (res?.ok && Array.isArray(res.data)) {
        sqliteAvailable = true;
        for (const raw of res.data) {
          const row = normalizeCierre(raw as Record<string, unknown>);
          byId.set(String(row.id), row);
        }
      }
    } catch (error) {
      console.warn("[cierresLocal] SQLite listCierres failed:", error);
    }
  }

  const useMirror = sqliteAvailable
    ? true
    : await shouldReadLocalFirst(tenantId, ["cierres_operativos"]).catch(() => false);
  if (useMirror) {
    try {
      const mirrorRows = await readLocalMirror<Record<string, unknown>>(tenantId, "cierres_operativos");
      for (const raw of mirrorRows) {
        const row = normalizeCierre(raw);
        if (!byId.has(String(row.id))) byId.set(String(row.id), row);
      }
    } catch (error) {
      console.warn("[cierresLocal] IndexedDB mirror read failed:", error);
    }
  }

  let rows = Array.from(byId.values());
  if (sucursalId) {
    rows = rows.filter((row) => {
      const branch = row.sucursal_id;
      return !branch || branch === sucursalId || branch === "main-process-default";
    });
  }
  rows.sort((a, b) => (Number(b.cycle_number) || 0) - (Number(a.cycle_number) || 0));
  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}
