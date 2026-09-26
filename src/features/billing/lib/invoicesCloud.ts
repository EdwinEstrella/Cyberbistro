import type { SupabaseClient } from "@supabase/supabase-js";

/** Cycles loaded by default in Billing/Analytics; older ones are opt-in via Desde/Hasta. */
export const RECENT_CYCLES_LIMIT = 5;

/** Invoice list window shown by default (the rest of the loaded invoices only feed cycle totals). */
export const INVOICE_LIST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Also the cap when no start instant is set: one page, never a full-history scan. */
const PAGE_SIZE = 1000;

type CycleTimes = { opened_at: string; created_at?: string | null };

function cycleStartMs(cycle: CycleTimes): number {
  const opened = new Date(cycle.opened_at).getTime();
  const created = cycle.created_at ? new Date(cycle.created_at).getTime() : Number.NaN;
  return Number.isNaN(created) ? opened : Math.min(opened, created);
}

/** The `limit` most recently opened cycles, newest first. */
export function pickRecentCycles<T extends CycleTimes>(cycles: T[], limit = RECENT_CYCLES_LIMIT): T[] {
  return [...cycles]
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
    .slice(0, limit);
}

/**
 * Earliest instant whose invoices must be loaded: the last 24h for the list,
 * extended back to the start of the oldest loaded cycle so its totals are exact.
 */
export function invoiceLoadStartIso(cycles: CycleTimes[], now: Date = new Date()): string {
  let start = now.getTime() - INVOICE_LIST_WINDOW_MS;
  for (const cycle of cycles) {
    const cycleStart = cycleStartMs(cycle);
    if (!Number.isNaN(cycleStart) && cycleStart < start) start = cycleStart;
  }
  return new Date(start).toISOString();
}

/** Converts local YYYY-MM-DD day bounds to UTC ISO instants for created_at filters. */
export function localDayBoundsToIso(dateFrom?: string, dateTo?: string): { fromIso?: string; toIso?: string } {
  return {
    fromIso: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
    toIso: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
  };
}

/**
 * Loads invoices from the cloud for a time range. The range is pushed down to
 * Postgres: large tenants have thousands of invoices, and paging the whole
 * history hits the 8s statement timeout of the authenticated role (RLS runs
 * per row), which used to leave every analytics figure at 0.
 */
export async function fetchCloudInvoicesInRange<T = Record<string, unknown>>(
  client: Pick<SupabaseClient, "from">,
  tenantId: string,
  options: { sucursalId?: string | null; fromIso?: string; toIso?: string } = {},
): Promise<{ data: T[]; error: unknown }> {
  const { fromIso, toIso } = options;
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
    // Without a start instant only the most recent page is read.
    if (!fromIso || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
}
