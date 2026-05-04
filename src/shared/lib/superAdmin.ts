import type { UserSchema } from "@insforge/sdk";

export const SUPER_ADMIN_EMAIL = "admin@gmail.com";
export const SUPER_ADMIN_ROLE = "super_admin";
export const SUPER_ADMIN_TENANT_ID = "__super_admin__";
export const SUPER_ADMIN_ROUTE = "/super-admin";

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function isSuperAdminUser(user: UserSchema | null | undefined): boolean {
  return isSuperAdminEmail(user?.email);
}
