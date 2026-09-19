import { supabase } from "../../../shared/lib/supabase";

/** Safe accessor for the desktop bridge (undefined in web / test node env). */
function getElectronAPI(): Window["electronAPI"] | undefined {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

export interface ReadInvoicesOptions {
  sucursalId?: string | null;
  limit?: number;
  /** Inclusive start day (YYYY-MM-DD, local calendar). */
  dateFrom?: string | null;
  /** Inclusive end day (YYYY-MM-DD, local calendar). */
  dateTo?: string | null;
}

/**
 * Converts a local calendar day (YYYY-MM-DD) into the ISO-UTC start/end-of-day
 * bounds used to filter the ISO-UTC `created_at` column. Mirrors the semantics
 * the billing UI used for its in-memory date filter.
 */
function toIsoBounds(dateFrom?: string | null, dateTo?: string | null): {
  from?: string;
  to?: string;
} {
  const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined;
  const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined;
  return { from, to };
}

/**
 * Normalizes a raw invoice row from SQLite (items stored as a JSON string) or
 * Supabase into the shape the billing UI consumes. Every original field is
 * preserved; only `items` is coerced to an array and `id` to a string.
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
 * Reads invoices from SQLite (desktop authoritative) or Supabase (web).
 * Never reads from IndexedDB.
 */
export async function readLocalInvoices(
  tenantId: string,
  options: ReadInvoicesOptions = {}
): Promise<Array<Record<string, unknown>>> {
  const { sucursalId, limit } = options;
  const { from: isoFrom, to: isoTo } = toIsoBounds(options.dateFrom, options.dateTo);
  const api = getElectronAPI();

  // 1. Electron Desktop: SQLite (authoritative, zero IndexedDB).
  if (api?.listInvoices) {
    try {
      const res = await api.listInvoices({
        tenantId,
        sucursalId: sucursalId || undefined,
        limit: typeof limit === "number" && limit > 0 ? limit : undefined,
        dateFrom: isoFrom,
        dateTo: isoTo,
      });
      if (res?.ok && Array.isArray(res.data)) {
        let rows = res.data.map((raw) => normalizeInvoice(raw as Record<string, unknown>));
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
    } catch (error) {
      console.warn("[invoicesLocal] SQLite listInvoices failed:", error);
    }
  }

  // 2. Pure Web: Supabase directly (zero IndexedDB).
  try {
    let query = supabase.from("facturas").select("*").eq("tenant_id", tenantId);
    if (sucursalId) {
      query = query.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`);
    }
    if (isoFrom) query = query.gte("created_at", isoFrom);
    if (isoTo) query = query.lte("created_at", isoTo);
    query = query.order("created_at", { ascending: false });
    if (typeof limit === "number" && limit > 0) {
      query = query.limit(limit);
    }
    const { data, error } = await query;
    if (error) {
      console.warn("[invoicesLocal] Supabase facturas query error:", error);
      return [];
    }
    return (data || []).map((raw) => normalizeInvoice(raw as Record<string, unknown>));
  } catch (error) {
    console.warn("[invoicesLocal] Web facturas read failed:", error);
    return [];
  }
}

/**
 * Saves an invoice directly to SQLite (desktop) or Supabase (web).
 * Never touches IndexedDB.
 */
export async function saveLocalInvoice(
  invoice: Record<string, unknown>
): Promise<void> {
  const api = getElectronAPI();
  if (api?.saveInvoiceLocal) {
    await api.saveInvoiceLocal(invoice);
    return;
  }
  const { error } = await supabase.from("facturas").upsert([invoice], { onConflict: "id" });
  if (error) {
    throw new Error(`Failed to save invoice in cloud: ${error.message}`);
  }
}

/**
 * Deletes an invoice directly from SQLite (desktop) or Supabase (web).
 * Never touches IndexedDB.
 */
export async function deleteLocalInvoice(
  tenantId: string,
  invoiceId: string
): Promise<void> {
  const api = getElectronAPI();
  if (api?.deleteInvoiceLocal) {
    await api.deleteInvoiceLocal({ tenantId, invoiceId });
    return;
  }
  const { error } = await supabase.from("facturas").delete().eq("id", invoiceId);
  if (error) {
    throw new Error(`Failed to delete invoice in cloud: ${error.message}`);
  }
}
