import { supabase } from "./supabase";
import { ncfPayloadFromReservedSequence } from "./ncf";
import { mapEcfRangeRpcError } from "./ecfRangeErrors";
import { isCloudAvailabilityFailure, recordCloudFailure, recordCloudSuccess } from "./cloudAvailability";

/** Resultado al emitir factura: si `sequenceReservedAtomically`, la BD ya incremento la secuencia (RPC). */
export type ResolvedNcfForInvoice = {
  ncf: string;
  ncf_tipo: string;
  tipoCodigo: string;
  usedSequence: number;
  sequenceReservedAtomically: boolean;
  reservationSource?: "remote_rpc" | "remote_legacy" | "local_mirror" | "local_sqlite";
};

/**
 * Reserva e-NCF de forma atómica a través de la RPC `cloudix_reserve_ecf`.
 * Los comprobantes de la serie B ya no se emiten para documentos nuevos.
 */
export async function resolveNcfForNewInvoice(
  tenantId: string,
  preferredType?: string | null
): Promise<ResolvedNcfForInvoice | null> {
  const isEcf = Boolean(preferredType && preferredType.trim().toUpperCase().startsWith("E"));
  if (!isEcf) {
    return null;
  }

  const rpcName = "cloudix_reserve_ecf";

  const rpcArgs: Record<string, unknown> = {
    p_tenant_id: tenantId,
    p_ncf_tipo: preferredType && preferredType.trim() ? preferredType.trim().toUpperCase() : "E32",
  };

  const { data, error } = await supabase.rpc(rpcName, rpcArgs);

  if (error) {
    // Authorized-range errors are business rules, not connectivity: surface them as typed
    // errors and never fall back to another fiscal mode.
    const rangeError = mapEcfRangeRpcError(error, String(rpcArgs.p_ncf_tipo ?? "E32"));
    if (rangeError) {
      recordCloudSuccess();
      throw rangeError;
    }
    const cloudUnavailable = isCloudAvailabilityFailure(error);
    if (cloudUnavailable) recordCloudFailure();
    // Flag connectivity failures so the desktop can fall back to its local sequence.
    throw Object.assign(new Error(error.message || "No se pudo reservar NCF fiscal."), { cloudUnavailable });
  }

  recordCloudSuccess();

  if (data != null) {
    const rows = Array.isArray(data) ? data : [data];
    const row = rows[0] as {
      ncf_fiscal_activo?: boolean;
      ncf_tipo_codigo?: string | null;
      ncf_tipo_default?: string | null;
      seq_reserved?: number | null;
    } | undefined;
    if (row && row.seq_reserved != null && row.seq_reserved >= 1) {
      const payload = ncfPayloadFromReservedSequence(
        row.ncf_tipo_codigo ?? row.ncf_tipo_default ?? preferredType,
        row.seq_reserved
      );
      if (payload) {
        return { ...payload, sequenceReservedAtomically: true, reservationSource: "remote_rpc" };
      }
    }
  }

  // e-CF must come from the atomic RPC so the authorized range is always enforced.
  throw new Error("No se pudo reservar el e-NCF. Intentá de nuevo.");
}
