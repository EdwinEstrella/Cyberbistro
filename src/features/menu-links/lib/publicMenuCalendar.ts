import { enqueueLocalWrite, getDeviceId, readLocalMirror } from "../../../shared/lib/localFirst";
import { supabase } from "../../../shared/lib/supabase";
import { isNetworkError } from "./menuLinksRepo";
import { buildPublicMenuUrl } from "./menuLinkUrl";

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

/**
 * Resolves the active DigitalMenuSettings row for a given tenant and sucursal.
 * Follows the precedence rule:
 * 1. Branch-specific row (`sucursal_id === sucursalId`) wins over a tenant-wide (`sucursal_id IS NULL`) row.
 * 2. When no branch-specific row is present, falls back to the tenant-wide row (`sucursal_id IS NULL`).
 * 3. Rows belonging to other tenants are ignored.
 * 4. Empty rows array or unresolvable targets return `null`.
 */
export function pickPublicMenuSettings(
  rows: readonly DigitalMenuSettings[] | null | undefined,
  tenantId: string,
  sucursalId?: string | null
): DigitalMenuSettings | null {
  if (!rows || rows.length === 0 || !tenantId) {
    return null;
  }

  const tenantRows = rows.filter((r) => Boolean(r && r.tenant_id === tenantId));
  if (tenantRows.length === 0) {
    return null;
  }

  const targetSucursal = sucursalId?.trim() || null;

  if (targetSucursal) {
    const branchRow = tenantRows.find((r) => r.sucursal_id === targetSucursal);
    if (branchRow) {
      return branchRow;
    }
  }

  const nullRow = tenantRows.find((r) => !r.sucursal_id);
  return nullRow ?? null;
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
    const found = pickPublicMenuSettings(settingsLocal, tenantId, sucursalId);
    if (found) return found;

    // Fallback to cloud if available and online
    if (typeof navigator === "undefined" || navigator.onLine) {
      const { data, error } = await supabase
        .from("digital_menu_settings")
        .select("*")
        .eq("tenant_id", tenantId);

      if (!error && data) {
        return pickPublicMenuSettings(data as DigitalMenuSettings[], tenantId, sucursalId);
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
          ? buildPublicMenuUrl(payload.public_slug)
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
