import { insforgeClient } from "./insforge";
import { prepareNcfForFacturaInsert, type TenantNcfRow } from "./ncf";

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

/** Incrementa secuencia NCF solo en la fila `tenants.id` del negocio actual. */
export async function incrementTenantNcfSequence(tenantId: string, usedSequence: number): Promise<void> {
  await insforgeClient.database
    .from("tenants")
    .update({
      ncf_secuencia_siguiente: usedSequence + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);
}
