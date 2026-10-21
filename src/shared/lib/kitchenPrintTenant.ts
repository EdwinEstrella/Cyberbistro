import type { TenantReceiptInfo } from "./receiptTemplates";

const TENANT_PRINT_COLUMNS = "nombre_negocio, rnc, direccion, telefono, logo_url, moneda";

export interface KitchenPrintTenantDeps {
  /** Cloud read of the tenant print columns; may throw or return an error when offline. */
  fetchCloud: (columns: string) => Promise<{ data: unknown; error: unknown }>;
  /** Local tenant row (SQLite mirror on desktop); null when never synced. */
  readLocal: () => Promise<Partial<TenantReceiptInfo> | null>;
  /** Skip the cloud round-trip entirely (offline / desktop cloud unavailable). */
  cloudUnavailable: boolean;
}

function toPrintRow(row: Partial<TenantReceiptInfo> | null | undefined): TenantReceiptInfo | null {
  if (!row) return null;
  return {
    nombre_negocio: row.nombre_negocio ?? null,
    rnc: row.rnc ?? null,
    direccion: row.direccion ?? null,
    telefono: row.telefono ?? null,
    logo_url: row.logo_url ?? null,
    moneda: row.moneda ?? null,
  };
}

/**
 * Resolves the header data for the kitchen ticket. Cloud first when reachable,
 * then the local tenant row, and finally a minimal header: a comanda ticket must
 * never be skipped just because tenant branding is unavailable.
 */
export async function resolveKitchenPrintTenant(deps: KitchenPrintTenantDeps): Promise<TenantReceiptInfo> {
  if (!deps.cloudUnavailable) {
    try {
      const { data, error } = await deps.fetchCloud(TENANT_PRINT_COLUMNS);
      const row = !error ? toPrintRow(data as Partial<TenantReceiptInfo> | null) : null;
      if (row) return row;
    } catch {
      // fall through to local data
    }
  }
  try {
    const local = toPrintRow(await deps.readLocal());
    if (local) return local;
  } catch {
    // fall through to the minimal header
  }
  return { nombre_negocio: null, rnc: null, direccion: null, telefono: null, logo_url: null, moneda: null };
}
