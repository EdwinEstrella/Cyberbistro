import { supabase } from "../../../../shared/lib/supabase";
import { getCachedLogoDataUrl } from "../../../../shared/lib/logoCache";
import { readLocalTenant } from "../../../../shared/lib/localTenant";
import type { CompanyStatementData, StatementTenantInfo } from "../types";

export const ONLINE_REQUIRED_ERROR =
  "Se requiere conexión a internet para generar el estado de cuenta.";

/**
 * Checks if the runtime environment currently has network connectivity.
 */
export function isOnline(): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    return navigator.onLine;
  }
  return true;
}

/**
 * Fetches company statement data from Supabase RPC `get_company_statement`.
 * Strictly online-only.
 */
export async function fetchCompanyStatement(
  customerId: string,
  from: string,
  to: string
): Promise<CompanyStatementData> {
  if (!isOnline()) {
    throw new Error(ONLINE_REQUIRED_ERROR);
  }

  try {
    const { data, error } = await supabase.rpc("get_company_statement", {
      p_customer_id: customerId,
      p_from: from,
      p_to: to,
    });

    if (error) {
      const msg = error.message || "";
      if (
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("offline") ||
        msg.includes("AbortError")
      ) {
        throw new Error(ONLINE_REQUIRED_ERROR);
      }
      if (msg.includes("CUSTOMER_NOT_FOUND")) {
        throw new Error("Cliente no encontrado.");
      }
      if (msg.includes("UNAUTHORIZED")) {
        throw new Error("No tiene permisos para consultar este estado de cuenta.");
      }
      throw new Error(msg || "Error al obtener el estado de cuenta.");
    }

    if (!data) {
      throw new Error("No se recibieron datos del estado de cuenta.");
    }

    return data as CompanyStatementData;
  } catch (err: unknown) {
    if (err instanceof Error) {
      const msg = err.message;
      if (
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("offline") ||
        msg.includes("AbortError")
      ) {
        throw new Error(ONLINE_REQUIRED_ERROR);
      }
      throw err;
    }
    throw new Error(ONLINE_REQUIRED_ERROR);
  }
}

/**
 * Resolves tenant info for printing header.
 */
export async function resolveStatementTenant(
  tenantId: string
): Promise<StatementTenantInfo> {
  let tenantInfo: StatementTenantInfo = {
    nombre_negocio: null,
    rnc: null,
    telefono: null,
    direccion: null,
    logo_url: null,
    moneda: "DOP",
  };

  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("nombre_negocio, rnc, direccion, telefono, logo_url, moneda")
      .eq("id", tenantId)
      .maybeSingle();

    if (!error && data) {
      tenantInfo = {
        nombre_negocio: (data as any).nombre_negocio ?? null,
        rnc: (data as any).rnc ?? null,
        direccion: (data as any).direccion ?? null,
        telefono: (data as any).telefono ?? null,
        logo_url: (data as any).logo_url ?? null,
        moneda: (data as any).moneda ?? "DOP",
      };
    } else {
      // Fallback to local SQLite tenant if available
      const local = await readLocalTenant(tenantId);
      if (local) {
        tenantInfo = {
          nombre_negocio: (local.nombre_negocio as string) ?? null,
          rnc: (local.rnc as string) ?? null,
          direccion: (local.direccion as string) ?? null,
          telefono: (local.telefono as string) ?? null,
          logo_url: (local.logo_url as string) ?? null,
          moneda: (local.moneda as string) ?? "DOP",
        };
      }
    }
  } catch {
    // Non-blocking fallback to local
    const local = await readLocalTenant(tenantId).catch(() => null);
    if (local) {
      tenantInfo = {
        nombre_negocio: (local.nombre_negocio as string) ?? null,
        rnc: (local.rnc as string) ?? null,
        direccion: (local.direccion as string) ?? null,
        telefono: (local.telefono as string) ?? null,
        logo_url: (local.logo_url as string) ?? null,
        moneda: (local.moneda as string) ?? "DOP",
      };
    }
  }

  // Convert logo_url to cached base64 data URL if available
  if (tenantInfo.logo_url) {
    const cached = getCachedLogoDataUrl(tenantInfo.logo_url);
    if (cached) {
      tenantInfo.logo_url = cached;
    }
  }

  return tenantInfo;
}
