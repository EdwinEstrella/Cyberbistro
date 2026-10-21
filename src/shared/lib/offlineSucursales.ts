/**
 * Last-resort branch list for the desktop when the cloud is unreachable and the
 * mirror/last-known cache have nothing. The allowed branch ids from the restored
 * local device session and the device's saved default branch live in the main
 * process, so they survive without any cloud round-trip. Names are unknown here,
 * so rows are labelled generically; real names replace them once the cloud answers.
 */
export interface OfflineSucursalRow {
  id: string;
  tenant_id: string;
  nombre: string;
  direccion: null;
  telefono: null;
  activa: true;
}

export function buildOfflineSucursales(input: {
  tenantId: string;
  allowedBranchIds?: readonly string[] | null;
  defaultBranchId?: string | null;
}): OfflineSucursalRow[] {
  const ids: string[] = [];
  const push = (id: unknown) => {
    if (typeof id === "string" && id.trim() && !ids.includes(id)) ids.push(id);
  };
  push(input.defaultBranchId);
  for (const id of input.allowedBranchIds ?? []) push(id);

  return ids.map((id, index) => ({
    id,
    tenant_id: input.tenantId,
    nombre: ids.length === 1 ? "Principal" : `Sucursal ${index + 1}`,
    direccion: null,
    telefono: null,
    activa: true,
  }));
}
