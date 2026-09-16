import type { LocalFirstMirrorTable } from "../../../shared/lib/localFirst";
import { readLocalMirror, shouldReadLocalFirst } from "../../../shared/lib/localFirst";

/** Safe accessor for the desktop bridge (undefined in web / test node env). */
function getElectronAPI(): Window["electronAPI"] | undefined {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

export interface ReadAccountsOptions {
  sucursalId?: string | null;
  limit?: number;
}

/**
 * Normalizes a receivable/payable account row. SQLite stores `monto_pendiente`
 * and a masculine `estado` (CHECK); the cloud/IndexedDB shape (and the billing
 * UI) use `monto_pagado` and a feminine `estado` (pagada/vencida). This exposes
 * both amounts and the feminine estado the UI compares against.
 */
export function normalizeAccount(raw: Record<string, unknown>): Record<string, unknown> {
  const montoTotal = Number(raw.monto_total ?? 0);
  const montoPagado = raw.monto_pagado != null
    ? Number(raw.monto_pagado)
    : Math.max(0, montoTotal - Number(raw.monto_pendiente ?? 0));
  let estado = String(raw.estado ?? "").toLowerCase();
  estado = estado === "pagado" ? "pagada" : estado === "vencido" ? "vencida" : estado;
  if (!estado) estado = montoTotal > 0 && montoPagado >= montoTotal ? "pagada" : "pendiente";
  return { ...raw, monto_total: montoTotal, monto_pagado: montoPagado, estado };
}

/** Normalizes a payment row (id string, monto number). */
export function normalizePago(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, id: String(raw.id), monto: Number(raw.monto ?? 0) };
}

async function unionLocal(
  tenantId: string,
  options: ReadAccountsOptions,
  mirrorTable: LocalFirstMirrorTable,
  fetchSqlite: (() => Promise<{ ok?: boolean; data?: unknown } | undefined>) | undefined,
  normalize: (raw: Record<string, unknown>) => Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  const { sucursalId } = options;
  const byId = new Map<string, Record<string, unknown>>();

  let sqliteAvailable = false;
  if (fetchSqlite) {
    try {
      const res = await fetchSqlite();
      if (res?.ok && Array.isArray(res.data)) {
        sqliteAvailable = true;
        for (const raw of res.data) {
          const row = normalize(raw as Record<string, unknown>);
          byId.set(String(row.id), row);
        }
      }
    } catch (error) {
      console.warn(`[accountsLocal] SQLite read for ${mirrorTable} failed:`, error);
    }
  }

  const useMirror = sqliteAvailable
    ? true
    : await shouldReadLocalFirst(tenantId, [mirrorTable]).catch(() => false);
  if (useMirror) {
    try {
      const mirrorRows = await readLocalMirror<Record<string, unknown>>(tenantId, mirrorTable);
      for (const raw of mirrorRows) {
        const row = normalize(raw);
        if (!byId.has(String(row.id))) byId.set(String(row.id), row);
      }
    } catch (error) {
      console.warn(`[accountsLocal] IndexedDB read for ${mirrorTable} failed:`, error);
    }
  }

  let rows = Array.from(byId.values());
  if (sucursalId) {
    rows = rows.filter((row) => {
      const branch = row.sucursal_id;
      return !branch || branch === sucursalId;
    });
  }
  return rows;
}

export function readLocalCuentasCobrar(tenantId: string, options: ReadAccountsOptions = {}): Promise<Array<Record<string, unknown>>> {
  const api = getElectronAPI();
  return unionLocal(tenantId, options, "cuentas_cobrar",
    api?.listCuentasCobrar ? () => api.listCuentasCobrar!({ tenantId, sucursalId: options.sucursalId || undefined, limit: options.limit }) : undefined,
    normalizeAccount);
}

export function readLocalCuentasPagar(tenantId: string, options: ReadAccountsOptions = {}): Promise<Array<Record<string, unknown>>> {
  const api = getElectronAPI();
  return unionLocal(tenantId, options, "cuentas_pagar",
    api?.listCuentasPagar ? () => api.listCuentasPagar!({ tenantId, sucursalId: options.sucursalId || undefined, limit: options.limit }) : undefined,
    normalizeAccount);
}

export function readLocalCxcPagos(tenantId: string, options: ReadAccountsOptions = {}): Promise<Array<Record<string, unknown>>> {
  const api = getElectronAPI();
  return unionLocal(tenantId, options, "cxc_pagos",
    api?.listCxcPagos ? () => api.listCxcPagos!({ tenantId, sucursalId: options.sucursalId || undefined, limit: options.limit }) : undefined,
    normalizePago);
}

export function readLocalCxpPagos(tenantId: string, options: ReadAccountsOptions = {}): Promise<Array<Record<string, unknown>>> {
  const api = getElectronAPI();
  return unionLocal(tenantId, options, "cxp_pagos",
    api?.listCxpPagos ? () => api.listCxpPagos!({ tenantId, sucursalId: options.sucursalId || undefined, limit: options.limit }) : undefined,
    normalizePago);
}
