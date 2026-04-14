import { insforgeClient } from "./insforge";
import {
  ncfPayloadFromReservedSequence,
  prepareNcfForFacturaInsert,
  type TenantNcfRow,
} from "./ncf";

/** Resultado al emitir factura: si `sequenceReservedAtomically`, la BD ya incrementó la secuencia (RPC). */
export type ResolvedNcfForInvoice = {
  ncf: string;
  ncf_tipo: string;
  usedSequence: number;
  sequenceReservedAtomically: boolean;
};

/** Solo la fila del tenant de la sesión (`tenants.id` = tenant del usuario). */
export async function loadTenantNcfRow(tenantId: string): Promise<TenantNcfRow | null> {
  const { data, error } = await insforgeClient.database
    .from("tenants")
    .select("ncf_fiscal_activo, ncf_tipo_default, ncf_secuencia_siguiente")
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data) return null;
  return data as TenantNcfRow;
}

export function ncfPayloadForInsert(row: TenantNcfRow | null): {
  ncf: string;
  ncf_tipo: string;
  usedSequence: number;
} | null {
  if (!row) return null;
  return prepareNcfForFacturaInsert(row);
}

/**
 * Reserva NCF de forma atómica si existe la RPC `cyberbistro_reserve_ncf` (ver sql/cyberbistro_reserve_ncf.sql).
 * Si la RPC no está desplegada o falla, usa lectura + incremento posterior (legado, vulnerable a carreras).
 */
export async function resolveNcfForNewInvoice(tenantId: string): Promise<ResolvedNcfForInvoice | null> {
  const { data, error } = await insforgeClient.database.rpc("cyberbistro_reserve_ncf", {
    p_tenant_id: tenantId,
  });

  if (!error && data != null) {
    const rows = Array.isArray(data) ? data : [data];
    const row = rows[0] as {
      ncf_fiscal_activo?: boolean;
      ncf_tipo_default?: string | null;
      seq_reserved?: number | null;
    } | undefined;
    if (row && row.seq_reserved != null && row.seq_reserved >= 1) {
      const payload = ncfPayloadFromReservedSequence(row.ncf_tipo_default, row.seq_reserved);
      if (payload) {
        return { ...payload, sequenceReservedAtomically: true };
      }
    }
  }

  const legacyRow = await loadTenantNcfRow(tenantId);
  const payload = ncfPayloadForInsert(legacyRow);
  if (!payload) return null;
  return { ...payload, sequenceReservedAtomically: false };
}

/** Incrementa secuencia NCF solo cuando no se usó la RPC atómica. */
export async function incrementTenantNcfSequence(tenantId: string, usedSequence: number): Promise<void> {
  await insforgeClient.database
    .from("tenants")
    .update({
      ncf_secuencia_siguiente: usedSequence + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);
}
