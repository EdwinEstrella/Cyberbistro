// ecf-certification: runs the DGII certification test set with the tenant certificate.
// VERIFY_JWT is off globally, so the handler authenticates the bearer token itself.
import { createDgiiClient } from "./dgiiClient.ts";
import { handleRequest } from "./handler.ts";
import { readSigningMaterial, sign } from "./signer.ts";
import { createSupabaseStore } from "./store.ts";

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

let store: ReturnType<typeof createSupabaseStore> | null = null;

Deno.serve((req) => {
  try {
    store ??= createSupabaseStore({
      url: env("SUPABASE_URL"),
      publishableKey: env("SUPABASE_PUBLISHABLE_KEY"),
      serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    });
  } catch {
    console.warn("ecf-certification: missing required environment");
    return new Response(JSON.stringify({ error: "The certification request failed.", code: "INTERNAL" }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
    });
  }
  return handleRequest(req, {
    store,
    readSigningMaterial,
    sign,
    encryptionKey: () => Deno.env.get("ECF_ENCRYPTION_KEY"),
    dgii: (environment) => createDgiiClient({ environment }),
    // Event names and short codes only: never payloads, certificates, tokens or secrets.
    log: (event, detail) => console.warn(`ecf-certification: ${event}`, detail ?? {}),
  });
});
