/**
 * Desktop NCF reservation.
 *
 * e-CF (E31/E32) stays cloud-only: those numbers are range-enforced and signed
 * by the cloud. Legacy B-series NCFs are retired and no longer reserved.
 */
import { resolveNcfForNewInvoice, type ResolvedNcfForInvoice } from "./invoiceNcf";

export interface DesktopNcfDeps {
  cloudReserve: (tenantId: string, preferredType?: string | null) => Promise<ResolvedNcfForInvoice | null>;
}

export async function resolveNcfForNewInvoiceDesktop(
  tenantId: string,
  preferredType?: string | null,
  deps: DesktopNcfDeps = defaultDesktopNcfDeps(),
): Promise<ResolvedNcfForInvoice | null> {
  const isEcf = Boolean(preferredType?.trim().toUpperCase().startsWith("E"));
  if (!isEcf) {
    return null;
  }
  return deps.cloudReserve(tenantId, preferredType);
}

export function defaultDesktopNcfDeps(): DesktopNcfDeps {
  return {
    cloudReserve: resolveNcfForNewInvoice,
  };
}
