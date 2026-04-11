/**
 * Permisos de navegación por rol en tenant_users.
 * Registro público (con PIN SaaS) → siempre admin.
 * Login: cada rol ve solo lo necesario.
 */

export type TenantRol = "admin" | "mesero" | "cocina" | "cajero";

const VENTA_PATHS = ["/dashboard", "/tables", "/entregas"] as const;

/** Cierre de día / caja — admin ve todo; cajero también. */
export const CIERRE_PATH = "/cierre";

/** Primera pantalla tras iniciar sesión. */
export function defaultRouteForRol(rol: string | null): string {
  if (rol === "cocina") return "/cocina";
  return "/dashboard";
}

/** ¿Puede abrir la vista Cocina (ruta o badge)? */
export function canAccessCocinaRoute(rol: string | null): boolean {
  return rol === "admin" || rol === "cocina";
}

/** Rutas bajo AppLayout permitidas para el rol (pathname exacto, hash router). */
export function isAppRouteAllowed(rol: string | null, pathname: string): boolean {
  if (rol === "admin") return true;
  if (pathname === "/ajustes" || pathname === "/soporte") return false;
  if (rol === "cocina") return pathname === "/cocina";
  if (rol === "mesero" || rol === "cajero") {
    if ((VENTA_PATHS as readonly string[]).includes(pathname)) return true;
    if (rol === "cajero" && pathname === CIERRE_PATH) return true;
    return false;
  }
  return pathname === "/dashboard";
}

export function showAjustesInSidebar(rol: string | null): boolean {
  return rol === "admin";
}

export function showSoporteInSidebar(rol: string | null): boolean {
  return rol === "admin";
}
