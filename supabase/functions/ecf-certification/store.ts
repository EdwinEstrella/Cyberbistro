// Supabase-backed CertificationStore. Service role only; every query is scoped by tenant_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { CertificationStore } from "./context.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

function fail(operation: string): never {
  throw new Error(`Store operation failed: ${operation}`);
}

export function createSupabaseStore(opts: { url: string; publishableKey: string; serviceRoleKey: string }): CertificationStore {
  const db: Db = createClient(opts.url, opts.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  return {
    async authenticate(token) {
      const authClient = createClient(opts.url, opts.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data, error } = await authClient.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },

    async memberships(userId) {
      const { data, error } = await db.from("tenant_users").select("tenant_id, rol").eq("auth_user_id", userId).eq("activo", true);
      if (error) fail("memberships");
      return (Array.isArray(data) ? data : []).map((row: { tenant_id: string; rol: string }) => ({
        tenantId: row.tenant_id,
        rol: row.rol,
      }));
    },

    async tenantRnc(tenantId) {
      const { data, error } = await db.from("tenants").select("rnc").eq("id", tenantId).maybeSingle();
      if (error) fail("tenantRnc");
      return typeof data?.rnc === "string" ? data.rnc : null;
    },

    async loadCertificate(tenantId, environment) {
      const { data, error } = await db
        .from("ecf_certificate_metadata")
        .select("storage_ref, password_encrypted")
        .eq("tenant_id", tenantId)
        .eq("environment", environment)
        .eq("is_ready", true)
        .maybeSingle();
      if (error) fail("loadCertificate");
      if (
        !data ||
        typeof data.storage_ref !== "string" ||
        !data.storage_ref.startsWith(`${tenantId}/`) ||
        typeof data.password_encrypted !== "string"
      ) {
        return null;
      }
      const { data: file, error: downloadError } = await db.storage.from("fiscal_certificates").download(data.storage_ref);
      if (downloadError || !file) fail("downloadCertificate");
      return { p12Bytes: new Uint8Array(await file.arrayBuffer()), passphraseEncrypted: data.password_encrypted };
    },
  };
}
