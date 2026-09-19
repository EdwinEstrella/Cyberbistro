import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";
import { supabase } from "../../../shared/lib/supabase";

/** Safe accessor for the desktop bridge (undefined in web / test node env). */
function getElectronAPI(): Window["electronAPI"] | undefined {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

export interface ReadCierresOptions {
  sucursalId?: string | null;
  limit?: number;
  /** Inclusive start business day (YYYY-MM-DD). */
  dateFrom?: string | null;
  /** Inclusive end business day (YYYY-MM-DD). */
  dateTo?: string | null;
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
  const { sucursalId, limit, dateFrom, dateTo } = options;
  const byId = new Map<string, Record<string, unknown>>();

  let sqliteAvailable = false;
  const api = getElectronAPI();
  if (api?.listCierres) {
    try {
      const res = await api.listCierres({
        tenantId,
        sucursalId: sucursalId || undefined,
        limit: limit ?? 500,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
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

  if (byId.size === 0) {
    try {
      let q = supabase.from("cierres_operativos").select("*").eq("tenant_id", tenantId);
      if (sucursalId) {
        q = q.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null,sucursal_id.eq.main-process-default`);
      }
      const { data } = await q.order("opened_at", { ascending: false }).limit(limit ?? 100);
      if (data && Array.isArray(data)) {
        for (const raw of data) {
          const row = normalizeCierre(raw);
          if (!byId.has(String(row.id))) byId.set(String(row.id), row);
        }
      }
    } catch (error) {
      console.warn("[cierresLocal] Supabase fallback query failed:", error);
    }
  }

  let rows = Array.from(byId.values());
  if (sucursalId) {
    rows = rows.filter((row) => {
      const branch = row.sucursal_id;
      return !branch || branch === sucursalId || branch === "main-process-default";
    });
  }
  // Scope by calendar business_day (YYYY-MM-DD); string compare is chronological.
  // Applied to the mirror-union result too, since IndexedDB rows are not filtered
  // by the SQLite query above.
  if (dateFrom || dateTo) {
    rows = rows.filter((row) => {
      const day = typeof row.business_day === "string" ? row.business_day : "";
      if (!day) return false;
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }
  rows.sort((a, b) => (Number(b.cycle_number) || 0) - (Number(a.cycle_number) || 0));
  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}
