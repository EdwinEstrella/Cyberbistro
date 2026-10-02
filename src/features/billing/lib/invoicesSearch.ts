import { supabase } from "../../../shared/lib/supabase";
import { normalizeInvoice, readLocalInvoices } from "./invoicesLocal";
import {
  INVOICE_SEARCH_LIMIT,
  buildInvoiceSearchOrFilter,
  normalizeInvoiceQuery,
  searchInvoices,
  type InvoiceSearchResult,
} from "./invoiceSearch";

type Row = Record<string, unknown>;

/**
 * Global invoice lookup (ignores any date window). Desktop scans the full
 * SQLite history; web pushes a sanitized `or(ilike…)` filter down to Postgres.
 */
export async function searchInvoicesGlobal(
  tenantId: string,
  query: string,
  options: { sucursalId?: string | null; onlyWithNcf?: boolean } = {},
): Promise<InvoiceSearchResult<Row>> {
  const q = normalizeInvoiceQuery(query);
  if (!q) return { rows: [], capped: false };

  const isDesktop = typeof window !== "undefined" && typeof window.electronAPI?.listInvoices === "function";
  if (isDesktop) {
    const all = await readLocalInvoices(tenantId, { sucursalId: options.sucursalId });
    return searchInvoices(all, q, INVOICE_SEARCH_LIMIT, { onlyWithNcf: options.onlyWithNcf });
  }

  const orFilter = buildInvoiceSearchOrFilter(q);
  if (!orFilter) return { rows: [], capped: false };

  let request = supabase.from("facturas").select("*").eq("tenant_id", tenantId);
  if (options.sucursalId) {
    request = request.or(`sucursal_id.eq.${options.sucursalId},sucursal_id.is.null`);
  }
  // One extra row tells us whether the cap truncated the result.
  if (options.onlyWithNcf) request = request.not("ncf", "is", null).neq("ncf", "");
  const { data, error } = await request
    .or(orFilter)
    .order("created_at", { ascending: false })
    .limit(INVOICE_SEARCH_LIMIT + 1);
  if (error) throw error;

  const rows = (data || []).map((raw) => normalizeInvoice(raw as Row));
  const filtered = searchInvoices(rows, q, INVOICE_SEARCH_LIMIT, { onlyWithNcf: options.onlyWithNcf });
  return { rows: filtered.rows, capped: filtered.capped || rows.length > INVOICE_SEARCH_LIMIT };
}
