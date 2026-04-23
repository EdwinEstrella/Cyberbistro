import { insforgeClient } from "./insforge";
import {
  buildBSequenceMapFromRow,
  buildTenantNcfUpdatePayload,
  DEFAULT_NCF_B_CODE,
  isNcfBCode,
  NCF_B_SEQUENCE_FIELDS_SELECT,
  ncfPayloadFromReservedSequence,
  prepareNcfForFacturaInsert,
  type TenantNcfRow,
} from "./ncf";

/** Resultado al emitir factura: si `sequenceReservedAtomically`, la BD ya incremento la secuencia (RPC). */
export type ResolvedNcfForInvoice = {
  ncf: string;
  ncf_tipo: string;
  tipoCodigo: string;
  usedSequence: number;
  sequenceReservedAtomically: boolean;
};

/** Solo la fila del tenant de la sesion (`tenants.id` = tenant del usuario). */
export async function loadTenantNcfRow(tenantId: string): Promise<TenantNcfRow | null> {
  let res = await insforgeClient.database
    .from("tenants")
    .select(
      `ncf_fiscal_activo, ncf_tipo_default, ncf_secuencia_siguiente, ncf_secuencias_por_tipo, ${NCF_B_SEQUENCE_FIELDS_SELECT}`
    )
    .eq("id", tenantId)
    .maybeSingle();

  if (res.error) {
    res = await insforgeClient.database
      .from("tenants")
      .select("ncf_fiscal_activo, ncf_tipo_default, ncf_secuencia_siguiente")
      .eq("id", tenantId)
      .maybeSingle();
  }

  if (res.error || !res.data) return null;
  return res.data as TenantNcfRow;
}

export function ncfPayloadForInsert(row: TenantNcfRow | null): {
  ncf: string;
  ncf_tipo: string;
  tipoCodigo: string;
  usedSequence: number;
} | null;
export function ncfPayloadForInsert(
  row: TenantNcfRow | null,
  preferredType: string | null | undefined
): {
  ncf: string;
  ncf_tipo: string;
  tipoCodigo: string;
  usedSequence: number;
} | null;
export function ncfPayloadForInsert(
  row: TenantNcfRow | null,
  preferredType?: string | null
): {
  ncf: string;
  ncf_tipo: string;
  tipoCodigo: string;
  usedSequence: number;
} | null {
  if (!row) return null;
  return prepareNcfForFacturaInsert(row, preferredType);
}

/**
 * Reserva NCF de forma atomica si existe la RPC `cyberbistro_reserve_ncf` (ver sql/cyberbistro_reserve_ncf.sql).
 * Si la RPC no esta desplegada o falla, usa lectura + incremento posterior (legado, vulnerable a carreras).
 */
export async function resolveNcfForNewInvoice(
  tenantId: string,
  preferredType?: string | null
): Promise<ResolvedNcfForInvoice | null> {
  const rpcArgs: Record<string, unknown> = {
    p_tenant_id: tenantId,
  };
  if (preferredType && preferredType.trim()) {
    rpcArgs.p_ncf_tipo = preferredType.trim().toUpperCase();
  }

  const { data, error } = await insforgeClient.database.rpc("cyberbistro_reserve_ncf", rpcArgs);

  if (!error && data != null) {
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
        return { ...payload, sequenceReservedAtomically: true };
      }
    }
  }

  const legacyRow = await loadTenantNcfRow(tenantId);
  const payload = ncfPayloadForInsert(legacyRow, preferredType);
  if (!payload) return null;
  return { ...payload, sequenceReservedAtomically: false };
}

/** Incrementa secuencia NCF solo cuando no se uso la RPC atomica. */
export async function incrementTenantNcfSequence(
  tenantId: string,
  tipoCodigo: string,
  usedSequence: number
): Promise<void> {
  const row = await loadTenantNcfRow(tenantId);
  const nextSequence = usedSequence + 1;
  const nextMap = buildBSequenceMapFromRow(row);
  if (isNcfBCode(tipoCodigo)) {
    nextMap[tipoCodigo] = nextSequence;
  }

  const defaultType = isNcfBCode(row?.ncf_tipo_default)
    ? row.ncf_tipo_default
    : DEFAULT_NCF_B_CODE;
  const updatePayload = buildTenantNcfUpdatePayload(
    Boolean(row?.ncf_fiscal_activo),
    defaultType,
    nextMap,
    row?.ncf_secuencias_por_tipo
  );

  await insforgeClient.database
    .from("tenants")
    .update({
      ...updatePayload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);
}
