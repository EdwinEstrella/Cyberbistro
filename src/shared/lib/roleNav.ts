/**
 * Permisos de navegación por rol en tenant_users.
 * Registro público (con PIN SaaS) → siempre admin.
 * Login: cada rol ve solo lo necesario.
 */

import { SUPER_ADMIN_ROLE, SUPER_ADMIN_ROUTE } from "./superAdmin";

export type TenantRol = "admin" | "cocina" | "cajera" | "mesero" | typeof SUPER_ADMIN_ROLE;

const VENTA_PATHS = ["/dashboard", "/tables", "/entregas"] as const;

/** Cierre de día / caja — admin ve todo; cajera y ventas también. */
export const CIERRE_PATH = "/cierre";

/**
 * Canonicaliza roles legacy para evitar duplicados operativos:
 * - "vender", "vendedor", "ventas" => "cajera"  (acceso a ventas + cierre)
 * - "cajero"                       => "cajera"
 * - "mesero"                       => "mesero"  (solo ventas, sin cierre)
 */
export function normalizeTenantRol(rol: string | null): TenantRol | null {
  if (!rol) return null;
  if (
    rol === "admin" ||
    rol === "cocina" ||
    rol === "cajera" ||
    rol === "mesero" ||
    rol === SUPER_ADMIN_ROLE
  ) return rol;
  if (rol === "vender" || rol === "vendedor" || rol === "ventas" || rol === "cajero") {
    return "cajera";
  }
  return null;
}

/** Primera pantalla tras iniciar sesión. */
export function defaultRouteForRol(rol: string | null): string {
  const normalized = normalizeTenantRol(rol);
  if (normalized === SUPER_ADMIN_ROLE) return SUPER_ADMIN_ROUTE;
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
  if (normalized === SUPER_ADMIN_ROLE) return pathname === SUPER_ADMIN_ROUTE;
  if (normalized === "admin") return true;
  if (pathname === "/ajustes" || pathname === "/soporte") return false;
  if (normalized === "cocina") return pathname === "/cocina";
  if (normalized === "cajera") {
    if ((VENTA_PATHS as readonly string[]).includes(pathname)) return true;
    if (pathname === CIERRE_PATH) return true;
    return false;
  }
  if (normalized === "mesero") {
    return (VENTA_PATHS as readonly string[]).includes(pathname);
  }
  return pathname === "/dashboard";
}

export function showAjustesInSidebar(rol: string | null): boolean {
  return normalizeTenantRol(rol) === "admin";
}

export function showSoporteInSidebar(rol: string | null): boolean {
  return normalizeTenantRol(rol) === "admin";
}
