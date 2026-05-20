import { insforgeClient } from "./insforge";
import { enqueueLocalWrite, getDeviceId, readLocalMirror, shouldReadLocalFirst } from "./localFirst";

export async function loadCantidadMesas(tenantId: string): Promise<number> {
  const readLocalCantidad = async () => {
    const tenants = await readLocalMirror<{ id: string; cantidad_mesas?: number | null }>(tenantId, "tenants").catch(() => []);
    const tenant = tenants.find((row) => row.id === tenantId);
    return tenant?.cantidad_mesas || null;
  };

  const useLocalRead = await shouldReadLocalFirst(tenantId, ["tenants"]).catch(() => false);
  if (useLocalRead) {
    const localCantidad = await readLocalCantidad();
    if (localCantidad) return localCantidad;
  }

  const { data, error } = await insforgeClient.database
    .from("tenants")
    .select("cantidad_mesas")
    .eq("id", tenantId)
    .maybeSingle();
    
  if (error || !data || !data.cantidad_mesas) {
    const localCantidad = await readLocalCantidad();
    return localCantidad || 20;
  }
  return data.cantidad_mesas as number;
}

export async function saveCantidadMesas(tenantId: string, cantidad: number): Promise<{ error: any | null }> {
  try {
    await enqueueLocalWrite({
      tenantId,
      tableName: "tenants",
      rowId: tenantId,
      op: "update",
      payload: { cantidad_mesas: cantidad },
      deviceId: await getDeviceId(),
    });
    return { error: null };
  } catch (error) {
    return { error };
  }
}
