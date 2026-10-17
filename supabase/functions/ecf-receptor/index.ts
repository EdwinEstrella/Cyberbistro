// ecf-receptor: DGII inbound services (seed, certificate validation, e-CF reception, commercial approval).
// Routed by the edge-runtime main service on the first path segment; DGII calls
// https://cloudix-ecf.azokia.com/{rnc}/fe/... which Kong forwards as /ecf-receptor/{rnc}/fe/...
// verify_jwt is off for this function (DGII sends no Supabase JWT); callers authenticate with the
// bearer token issued by the validacioncertificado service.
import { handleRequest } from "./handler.ts";
import { xmlSecurity } from "./security.ts";
import { createSupabaseStore } from "./store.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

let store: ReturnType<typeof createSupabaseStore> | null = null;

Deno.serve((req) => {
  store ??= createSupabaseStore(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
  return handleRequest(req, {
    store,
    security: xmlSecurity,
    now: () => new Date(),
    encryptionKey: () => Deno.env.get("ECF_ENCRYPTION_KEY"),
    // Never log payloads, certificates or secrets: event names and short codes only.
    log: (event, detail) => console.warn(`ecf-receptor: ${event}`, detail ?? {}),
  });
});
