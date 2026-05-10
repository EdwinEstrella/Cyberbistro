export type ManagedUserRole = "admin" | "cajera" | "cocina" | "mesero";

export interface TenantUserLimitConfig {
  userLimitEnabled: boolean;
  adminUserLimit: number | null;
  cajeraUserLimit: number | null;
  cocinaUserLimit: number | null;
  meseroUserLimit: number | null;
}

type UnknownTenantRow = Record<string, unknown>;

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

export function extractTenantUserLimitConfig(row: UnknownTenantRow | null | undefined): TenantUserLimitConfig {
  return {
    userLimitEnabled: row?.user_limit_enabled === true,
    adminUserLimit: toNullableNumber(row?.admin_user_limit),
    cajeraUserLimit: toNullableNumber(row?.cajera_user_limit),
    cocinaUserLimit: toNullableNumber(row?.cocina_user_limit),
    meseroUserLimit: toNullableNumber(row?.mesero_user_limit),
  };
}

export function tenantUserLimitColumnsPresent(row: UnknownTenantRow | null | undefined): boolean {
  if (!row) return false;
  return [
    "user_limit_enabled",
    "admin_user_limit",
    "cajera_user_limit",
    "cocina_user_limit",
    "mesero_user_limit",
  ].some((key) => key in row);
}

export function getLimitForRole(
  config: TenantUserLimitConfig,
  role: ManagedUserRole
): number | null {
  if (!config.userLimitEnabled) return null;
  if (role === "admin") return config.adminUserLimit;
  if (role === "cajera") return config.cajeraUserLimit;
  if (role === "cocina") return config.cocinaUserLimit;
  return config.meseroUserLimit;
}

export function countActiveUsersByRole<T extends { rol: string; activo?: boolean | null }>(
  rows: T[],
  role: ManagedUserRole
): number {
  return rows.filter((row) => row.rol === role && row.activo !== false).length;
}

export function formatRoleLabel(role: ManagedUserRole): string {
  if (role === "admin") return "Admin";
  if (role === "cajera") return "Cajera";
  if (role === "cocina") return "Cocina";
  return "Camarera";
}
