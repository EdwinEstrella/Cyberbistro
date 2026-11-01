import { supabase } from "../../../shared/lib/supabase";
import type { TenantOverviewData } from "./types";

export interface TenantOverviewRepoResult {
  data: TenantOverviewData | null;
  error: Error | null;
}

/**
 * Fetches the 360-degree aggregate overview for a specific tenant via the superadmin_tenant_overview RPC.
 */
export async function fetchTenantOverview(tenantId: string): Promise<TenantOverviewRepoResult> {
  try {
    const { data, error } = await supabase.rpc("superadmin_tenant_overview", {
      p_tenant_id: tenantId,
    });

    if (error) {
      return {
        data: null,
        error: new Error(error.message || "Error al cargar la ficha 360 del restaurante."),
      };
    }

    if (!data) {
      return {
        data: null,
        error: new Error("No se recibieron datos para el restaurante solicitado."),
      };
    }

    return {
      data: data as TenantOverviewData,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: null,
      error: new Error(message),
    };
  }
}
