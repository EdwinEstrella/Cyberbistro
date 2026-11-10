import { supabase } from "../../../shared/lib/supabase";
import { fetchCloudInvoicesInRange } from "./invoicesCloud";

/** Safe accessor for the desktop bridge (undefined in web / test node env). */
function getElectronAPI(): Window["electronAPI"] | undefined {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

export interface ReadInvoicesOptions {
  sucursalId?: string | null;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
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

export const INVOICE_RANGE_LOAD_ERROR =
  "No se pudieron cargar las facturas del período. Verificá tu conexión e intentá de nuevo.";

/**
 * Reads invoices from SQLite (desktop authoritative) or Supabase (web).
 * Never reads from IndexedDB.
 */
export async function readLocalInvoices(
  tenantId: string,
  options: ReadInvoicesOptions = {}
): Promise<Array<Record<string, unknown>>> {
  const { sucursalId, limit, dateFrom, dateTo } = options;
  const api = getElectronAPI();

  // 1. Electron Desktop: SQLite (authoritative, zero IndexedDB).
  if (api?.listInvoices) {
    try {
      const res = await api.listInvoices({
        tenantId,
        sucursalId: sucursalId || undefined,
        limit: typeof limit === "number" && limit > 0 ? limit : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
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

  // 2. Pure Web: Range query (isolated straight-line handling).
  if (dateFrom || dateTo) {
    let result: Awaited<ReturnType<typeof fetchCloudInvoicesInRange>>;
    try {
      result = await fetchCloudInvoicesInRange(supabase, tenantId, {
        sucursalId: sucursalId || undefined,
        fromIso: dateFrom,
        toIso: dateTo,
      });
    } catch {
      throw new Error(INVOICE_RANGE_LOAD_ERROR);
    }
    if (result.error) throw new Error(INVOICE_RANGE_LOAD_ERROR);
    return (result.data || []).map((raw) => normalizeInvoice(raw as Record<string, unknown>));
  }

  // 3. Pure Web (non-range): Supabase directly (zero IndexedDB).
  try {
    let query = supabase.from("facturas").select("*").eq("tenant_id", tenantId);
    if (sucursalId) {
      query = query.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`);
    }
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

export class InvoiceNcfDuplicateError extends Error {
  constructor(ncf: string, numeroFactura: number | null | undefined) {
    super(`El NCF ${ncf} ya está asignado a la factura${numeroFactura != null ? ` #${numeroFactura}` : " de otro registro"}.`);
    this.name = "InvoiceNcfDuplicateError";
  }
}

/** Looks for another cloud invoice of the tenant using this NCF. Returns null when none or when the check cannot run. */
async function findCloudNcfClash(
  tenantId: string,
  invoiceId: string,
  ncf: string
): Promise<{ numero_factura: number | null } | null> {
  try {
    const { data, error } = await supabase
      .from("facturas")
      .select("id, numero_factura")
      .eq("tenant_id", tenantId)
      .eq("ncf", ncf)
      .neq("id", invoiceId)
      .limit(1);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return { numero_factura: (data[0] as { numero_factura?: number | null }).numero_factura ?? null };
  } catch {
    return null; // offline: do not block the cashier, the local check still applies
  }
}

/**
 * Updates only the editable header fields of an invoice (never items or amounts).
 * Desktop: SQLite + partial outbox 'update' (synced to the cloud by the sync engine).
 * Web: direct Supabase update. Throws InvoiceNcfDuplicateError when the NCF is taken.
 */
export async function updateInvoiceHeader(
  tenantId: string,
  invoiceId: string,
  changes: Record<string, unknown>
): Promise<void> {
  if (Object.keys(changes).length === 0) return;
  const newNcf = typeof changes.ncf === "string" && changes.ncf ? changes.ncf : null;

  if (newNcf) {
    const clash = await findCloudNcfClash(tenantId, invoiceId, newNcf);
    if (clash) throw new InvoiceNcfDuplicateError(newNcf, clash.numero_factura);
  }

  const api = getElectronAPI();
  if (api?.updateInvoiceHeaderLocal) {
    const res = await api.updateInvoiceHeaderLocal({ tenantId, invoiceId, changes });
    if (!res.ok) {
      if (res.reason === "ncf_duplicate") throw new InvoiceNcfDuplicateError(newNcf ?? "", res.numeroFactura);
      throw new Error("La factura no existe en este equipo.");
    }
    return;
  }

  const { error } = await supabase
    .from("facturas")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId);
  if (error) {
    throw new Error(`No se pudo actualizar la factura en la nube: ${error.message}`);
  }
}
