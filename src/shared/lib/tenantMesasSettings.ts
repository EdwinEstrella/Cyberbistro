import { insforgeClient } from "./insforge";

export async function loadCantidadMesas(tenantId: string): Promise<number> {
  const { data, error } = await insforgeClient.database
    .from("tenants")
    .select("cantidad_mesas")
    .eq("id", tenantId)
    .maybeSingle();
    
  if (error || !data || !data.cantidad_mesas) return 20;
  return data.cantidad_mesas as number;
}

export async function saveCantidadMesas(tenantId: string, cantidad: number): Promise<{ error: any | null }> {
  const { error } = await insforgeClient.database
    .from("tenants")
    .update({ cantidad_mesas: cantidad })
    .eq("id", tenantId);
  return { error };
}
