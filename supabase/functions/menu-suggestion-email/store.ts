import type { SuggestionEmailStore, SuggestionRow, TenantInfo } from "./handler.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClientLike = any;

/**
 * Creates a Supabase-backed store using the service role client.
 */
export function createSupabaseStore(client: SupabaseClientLike): SuggestionEmailStore {
  return {
    async claimSuggestion(suggestionId: string): Promise<SuggestionRow | null> {
      // Atomically claim the row: transitions from 'pending' to 'sent' as an in-flight guard.
      // If already processed or not pending, 0 rows are returned.
      // The handler is responsible for correcting it to 'failed' or 'skipped' when sending does not complete.
      const { data, error } = await client
        .from("menu_suggestions")
        .update({ email_status: "sent" })
        .eq("id", suggestionId)
        .eq("email_status", "pending")
        .select("id, tenant_id, sucursal_id, mesa_numero, message, contact, created_at, email_status, email_error")
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        return null;
      }

      return data as SuggestionRow;
    },

    async resolveTenantInfo(tenantId: string): Promise<TenantInfo> {
      // 1. Fetch business name and fallback email from tenants table
      const { data: tenantRow } = await client
        .from("tenants")
        .select("nombre_negocio, email")
        .eq("id", tenantId)
        .maybeSingle();

      const businessName = tenantRow?.nombre_negocio || null;
      let ownerEmail = typeof tenantRow?.email === "string" && tenantRow.email.trim() ? tenantRow.email.trim() : null;

      // 2. Fetch primary active admin user email from tenant_users
      const { data: adminUser } = await client
        .from("tenant_users")
        .select("email")
        .eq("tenant_id", tenantId)
        .eq("rol", "admin")
        .eq("activo", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (typeof adminUser?.email === "string" && adminUser.email.trim()) {
        ownerEmail = adminUser.email.trim();
      }

      return {
        businessName,
        ownerEmail,
      };
    },

    async getPublicContactEmail(tenantId: string, sucursalId: string | null): Promise<string | null> {
      if (sucursalId) {
        const { data: sucursalSettings } = await client
          .from("digital_menu_settings")
          .select("public_contact")
          .eq("tenant_id", tenantId)
          .eq("sucursal_id", sucursalId)
          .maybeSingle();

        const email = sucursalSettings?.public_contact?.suggestion_email;
        if (typeof email === "string" && email.trim()) {
          return email.trim();
        }
      }

      const { data: tenantSettings } = await client
        .from("digital_menu_settings")
        .select("public_contact")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const email = tenantSettings?.public_contact?.suggestion_email;
      return typeof email === "string" && email.trim() ? email.trim() : null;
    },

    async markSent(suggestionId: string): Promise<void> {
      const { error } = await client
        .from("menu_suggestions")
        .update({ email_status: "sent", email_error: null })
        .eq("id", suggestionId);

      if (error) {
        throw new Error(error.message);
      }
    },

    async markFailed(suggestionId: string, errorMessage: string): Promise<void> {
      const { error } = await client
        .from("menu_suggestions")
        .update({ email_status: "failed", email_error: errorMessage })
        .eq("id", suggestionId);

      if (error) {
        throw new Error(error.message);
      }
    },

    async markSkipped(suggestionId: string, reason: string): Promise<void> {
      const { error } = await client
        .from("menu_suggestions")
        .update({ email_status: "skipped", email_error: reason })
        .eq("id", suggestionId);

      if (error) {
        throw new Error(error.message);
      }
    },
  };
}
