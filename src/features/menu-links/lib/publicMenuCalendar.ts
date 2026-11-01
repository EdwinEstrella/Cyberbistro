import { enqueueLocalWrite, getDeviceId, readLocalMirror } from "../../../shared/lib/localFirst";
import { supabase } from "../../../shared/lib/supabase";
import { isNetworkError } from "./menuLinksRepo";

export interface DigitalMenuSettings {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  enabled: boolean;
  public_slug: string;
  title: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  theme?: { accentColor?: string } | null;
  menu_id: string | null;
  updated_at: string;
}

export function mapCalendarError(error: unknown): string {
  if (!error) return "Ocurrió un error inesperado al actualizar el calendario.";

  const msg =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error);

  const details =
    typeof error === "object" && error !== null && "details" in error
      ? String((error as { details?: unknown }).details ?? "")
      : "";

  if (msg.includes("TENANT_MISMATCH") || details.includes("TENANT_MISMATCH")) {
    return "El menú seleccionado no pertenece a este restaurante.";
  }

  if (
    isNetworkError(error) ||
    (typeof navigator !== "undefined" && navigator.onLine === false) ||
    msg.toLowerCase().includes("offline") ||
    msg.toLowerCase().includes("network")
  ) {
    return "Se requiere conexión a internet para sincronizar la configuración.";
  }

  if (msg.includes("foreign key") || msg.includes("23503")) {
    return "El menú seleccionado no existe o no es válido.";
  }

  return msg || "No se pudo actualizar la asignación del calendario.";
}

export async function fetchPublicMenuSettings(
  tenantId: string,
  sucursalId?: string | null
): Promise<DigitalMenuSettings | null> {
  try {
    const settingsLocal = await readLocalMirror<DigitalMenuSettings>(tenantId, "digital_menu_settings");
    const found = settingsLocal.find(
      (s) => s.tenant_id === tenantId && (!s.sucursal_id || s.sucursal_id === sucursalId)
    );
    if (found) return found;

    // Fallback to cloud if available and online
    if (typeof navigator === "undefined" || navigator.onLine) {
      let query = supabase
        .from("digital_menu_settings")
        .select("*")
        .eq("tenant_id", tenantId);

      if (sucursalId) {
        query = query.or(`sucursal_id.is.null,sucursal_id.eq.${sucursalId}`);
      }

      const { data, error } = await query.limit(1).maybeSingle();
      if (!error && data) {
        return data as DigitalMenuSettings;
      }
    }

    return null;
  } catch (err) {
    console.warn("[publicMenuCalendar] Error fetching public menu settings:", err);
    return null;
  }
}

export interface SavePublicMenuSettingsInput {
  tenantId: string;
  sucursalId?: string | null;
  existingSettings?: DigitalMenuSettings | null;
  enabled: boolean;
  publicSlug: string;
  title?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  accentColor?: string;
}

export async function savePublicMenuSettings(
  input: SavePublicMenuSettingsInput
): Promise<DigitalMenuSettings> {
  const isEdit = Boolean(input.existingSettings?.id);
  const settingsId = input.existingSettings?.id || crypto.randomUUID();

  const payload: Omit<DigitalMenuSettings, "menu_id"> = {
    id: settingsId,
    tenant_id: input.tenantId,
    sucursal_id: input.sucursalId || null,
    enabled: input.enabled,
    public_slug: input.publicSlug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, ""),
    title: input.title?.trim() || null,
    description: input.description?.trim() || null,
    logo_url: input.logoUrl?.trim() || null,
    banner_url: input.bannerUrl?.trim() || null,
    theme: { accentColor: input.accentColor || "#f97316" },
    updated_at: new Date().toISOString(),
  };

  try {
    const deviceId = await getDeviceId();

    await enqueueLocalWrite({
      tenantId: input.tenantId,
      tableName: "digital_menu_settings",
      rowId: settingsId,
      op: isEdit ? "update" : "insert",
      payload: payload as unknown as Record<string, unknown>,
      deviceId,
    });

    // Also sync the menu_url to the tenants table for receipt printing
    await enqueueLocalWrite({
      tenantId: input.tenantId,
      tableName: "tenants",
      rowId: input.tenantId,
      op: "update",
      payload: {
        id: input.tenantId,
        menu_url: input.enabled
          ? `https://cloudix-app.azokia.com/#/menu/${payload.public_slug}`
          : null,
        updated_at: new Date().toISOString(),
      },
      deviceId,
    });

    return {
      ...payload,
      menu_id: input.existingSettings?.menu_id ?? null,
    };
  } catch (err) {
    const message = mapCalendarError(err);
    throw new Error(message);
  }
}

export async function assignPublicMenuCalendar(
  tenantId: string,
  _sucursalId: string | null | undefined,
  menuId: string,
  currentSettings?: DigitalMenuSettings | null
): Promise<DigitalMenuSettings> {
  if (!currentSettings?.id) {
    throw new Error("Guarda primero la configuración del menú público antes de asignar un calendario.");
  }

  try {
    const updatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("digital_menu_settings")
      .update({ menu_id: menuId, updated_at: updatedAt })
      .eq("id", currentSettings.id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No se pudo actualizar la configuración del menú público.");
    }
    return data as DigitalMenuSettings;
  } catch (err) {
    const message = mapCalendarError(err);
    throw new Error(message);
  }
}

export async function removePublicMenuCalendar(
  tenantId: string,
  _sucursalId: string | null | undefined,
  currentSettings?: DigitalMenuSettings | null
): Promise<DigitalMenuSettings> {
  if (!currentSettings?.id) {
    throw new Error("Guarda primero la configuración del menú público antes de asignar un calendario.");
  }

  try {
    const updatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("digital_menu_settings")
      .update({ menu_id: null, updated_at: updatedAt })
      .eq("id", currentSettings.id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("No se pudo actualizar la configuración del menú público.");
    }
    return data as DigitalMenuSettings;
  } catch (err) {
    const message = mapCalendarError(err);
    throw new Error(message);
  }
}
