/**
 * Permisos de navegación por rol en tenant_users.
 * Registro público (con PIN SaaS) → siempre admin.
 * Login: cada rol ve solo lo necesario.
 */

export type TenantRol = "admin" | "cocina" | "cajera";

const VENTA_PATHS = ["/dashboard", "/tables", "/entregas"] as const;

/** Cierre de día / caja — admin ve todo; cajera también. */
export const CIERRE_PATH = "/cierre";

/**
 * Canonicaliza roles legacy para evitar duplicados operativos:
 * - "mesero", "vender", "vendedor", "cajero" => "cajera"
 */
export function normalizeTenantRol(rol: string | null): TenantRol | null {
  if (!rol) return null;
  if (rol === "admin" || rol === "cocina" || rol === "cajera") return rol;
  if (rol === "mesero" || rol === "vender" || rol === "vendedor" || rol === "cajero") {
    return "cajera";
  }
  return null;
}

/** Primera pantalla tras iniciar sesión. */
export function defaultRouteForRol(rol: string | null): string {
  const normalized = normalizeTenantRol(rol);
  if (normalized === "cocina") return "/cocina";
  return "/dashboard";
}

/** ¿Puede abrir la vista Cocina (ruta o badge)? */
export function canAccessCocinaRoute(rol: string | null): boolean {
  const normalized = normalizeTenantRol(rol);
  return normalized === "admin" || normalized === "cocina";
}

/** Rutas bajo AppLayout permitidas para el rol (pathname exacto, hash router). */
export function isAppRouteAllowed(rol: string | null, pathname: string): boolean {
  const normalized = normalizeTenantRol(rol);
  if (normalized === "admin") return true;
  if (pathname === "/ajustes" || pathname === "/soporte") return false;
  if (normalized === "cocina") return pathname === "/cocina";
  if (normalized === "cajera") {
    if ((VENTA_PATHS as readonly string[]).includes(pathname)) return true;
    if (pathname === CIERRE_PATH) return true;
    return false;
  }
  return pathname === "/dashboard";
}

export function showAjustesInSidebar(rol: string | null): boolean {
  return normalizeTenantRol(rol) === "admin";
}

export function showSoporteInSidebar(rol: string | null): boolean {
  return normalizeTenantRol(rol) === "admin";
}
