import type { SupabaseClient } from "@supabase/supabase-js";

/** Days loaded by default in Billing/Analytics; older ranges are opt-in via "Desde". */
export const DEFAULT_INVOICE_WINDOW_DAYS = 7;

/** Also the cap when no start date is set: one page, never a full-history scan. */
const PAGE_SIZE = 1000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local YYYY-MM-DD of `days - 1` days before `now` (today counts as day one). */
export function defaultInvoiceDateFrom(now: Date = new Date(), days = DEFAULT_INVOICE_WINDOW_DAYS): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

/** Converts local YYYY-MM-DD day bounds to UTC ISO instants for created_at filters. */
export function localDayBoundsToIso(dateFrom?: string, dateTo?: string): { fromIso?: string; toIso?: string } {
  return {
    fromIso: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
    toIso: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
  };
}

/**
 * Loads invoices from the cloud for a date range. The range is pushed down to
 * Postgres: large tenants have thousands of invoices, and paging the whole
 * history hits the 8s statement timeout of the authenticated role (RLS runs
 * per row), which used to leave every analytics figure at 0.
 */
export async function fetchCloudInvoicesInRange<T = Record<string, unknown>>(
  client: Pick<SupabaseClient, "from">,
  tenantId: string,
  options: { sucursalId?: string | null; dateFrom?: string; dateTo?: string } = {},
): Promise<{ data: T[]; error: unknown }> {
  const { fromIso, toIso } = localDayBoundsToIso(options.dateFrom, options.dateTo);
  const all: T[] = [];
  let from = 0;
  while (true) {
    let query = client.from("facturas").select("*").eq("tenant_id", tenantId);
    if (options.sucursalId) query = query.or(`sucursal_id.eq.${options.sucursalId},sucursal_id.is.null`);
    if (fromIso) query = query.gte("created_at", fromIso);
    if (toIso) query = query.lte("created_at", toIso);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    // Without a start date only the most recent page is read.
    if (!fromIso || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
}
