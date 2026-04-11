import { insforgeClient } from "./insforge";

/** Bucket InsForge para assets de configuración (logos multitenant). */
export const TENANT_ASSETS_BUCKET = "configuracion";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

function sanitizeFileName(name: string): string {
  const base = name.replace(/[/\\]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 0 ? base.slice(0, 120) : "logo";
}

/**
 * Ruta en el bucket: un directorio por tenant para aislar archivos entre negocios.
 * `logos/{tenantId}/{timestamp}-{nombre}`
 */
export function tenantLogoObjectPath(tenantId: string, file: File): string {
  const stamp = Date.now();
  const safe = sanitizeFileName(file.name);
  return `logos/${tenantId}/${stamp}-${safe}`;
}

export type UploadTenantLogoResult =
  | { ok: true; publicUrl: string; path: string }
  | { ok: false; message: string };

/**
 * Sube el logo al bucket (ruta por tenant) y devuelve la URL pública.
 * No escribe en la tabla `tenants`; el caller debe persistir `logo_url`.
 */
export async function uploadTenantLogoFile(
  tenantId: string,
  file: File
): Promise<UploadTenantLogoResult> {
  if (!tenantId) {
    return { ok: false, message: "No hay negocio seleccionado." };
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return {
      ok: false,
      message: "Formato no permitido. Usá PNG, JPG, WebP o SVG.",
    };
  }

  if (file.size > MAX_BYTES) {
    return { ok: false, message: "El archivo no puede superar 2 MB." };
  }

  const path = tenantLogoObjectPath(tenantId, file);

  const { error } = await insforgeClient.storage
    .from(TENANT_ASSETS_BUCKET)
    .upload(path, file);

  if (error) {
    return {
      ok: false,
      message: error.message || "No se pudo subir el archivo al almacenamiento.",
    };
  }

  const publicUrl = insforgeClient.storage
    .from(TENANT_ASSETS_BUCKET)
    .getPublicUrl(path);

  if (!publicUrl) {
    return { ok: false, message: "Subida ok pero no se obtuvo la URL pública." };
  }

  return { ok: true, publicUrl, path };
}

/** Persiste la URL del logo (subida o externa) en el tenant actual. */
export async function saveTenantLogoUrl(
  tenantId: string,
  logoUrl: string | null
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await insforgeClient.database
    .from("tenants")
    .update({
      logo_url: logoUrl?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  if (error) {
    return { ok: false, message: error.message || "Error al guardar en la base de datos." };
  }
  return { ok: true };
}
