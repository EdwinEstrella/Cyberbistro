import { supabase } from "./supabase";
import { enqueueLocalWrite, getDeviceId, readLocalMirror, shouldReadLocalFirst } from "./localFirst";
import { canAttemptCloudRead } from "./cloudAvailability";

const DEFAULT_CANTIDAD_MESAS = 20;

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

  // Desktop with the cloud down: never block the dashboard on a cloud read
  // (supabase calls wait on auth-js token-refresh retries).
  if (!(await canAttemptCloudRead())) {
    return (await readLocalCantidad()) || DEFAULT_CANTIDAD_MESAS;
  }

  const { data, error } = await supabase
    .from("tenants")
    .select("cantidad_mesas")
    .eq("id", tenantId)
    .maybeSingle();
    
  if (error || !data || !data.cantidad_mesas) {
    const localCantidad = await readLocalCantidad();
    return localCantidad || DEFAULT_CANTIDAD_MESAS;
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
