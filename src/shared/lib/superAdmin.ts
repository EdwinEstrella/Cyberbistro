import { supabase } from "./supabase";

export const SUPER_ADMIN_ROLE = "super_admin";
export const SUPER_ADMIN_TENANT_ID = "__super_admin__";
export const SUPER_ADMIN_ROUTE = "/super-admin";

/**
 * Checks whether the current authenticated user is a super administrator
 * via the secure authoritative RPC `cyberbistro_am_i_super_admin`.
 * Fails closed (returns false) on error, non-true responses, or network failure.
 */
export async function fetchIsSuperAdmin(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("cyberbistro_am_i_super_admin");
    if (error) {
      console.warn("fetchIsSuperAdmin: rpc error", error);
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn("fetchIsSuperAdmin: failed to verify super admin status", err);
    return false;
  }
}
