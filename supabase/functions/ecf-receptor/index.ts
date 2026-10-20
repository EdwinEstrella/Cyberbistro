// ecf-receptor: DGII inbound services (seed, certificate validation, e-CF reception, commercial approval).
// Routed by the edge-runtime main service on the first path segment; DGII calls
// https://cloudix-ecf.azokia.com/{rnc}/fe/... which Kong forwards as /ecf-receptor/{rnc}/fe/...
// verify_jwt is off for this function (DGII sends no Supabase JWT); callers authenticate with the
// bearer token issued by the validacioncertificado service.
import { handleRequest } from "./handler.ts";
import { createXmlSecurity } from "./security.ts";
import { createSupabaseStore } from "./store.ts";
import { BUILT_IN_TRUSTED_CAS, DGII_CERTIFICATION_SIGNERS } from "./trustedCas.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

/** Built-in Dominican CAs plus an optional PEM bundle (e.g. DGII certification-environment CAs). */
function trustedCaPems(): string[] {
  const extra = Deno.env.get("ECF_RECEPTOR_TRUSTED_CA_PEMS")?.trim();
  return [...BUILT_IN_TRUSTED_CAS.map((ca) => ca.pem), ...(extra ? [extra] : [])];
}

/** Pinned DGII certification-environment signers plus an optional PEM bundle, so ops can rotate the pin without a deploy. */
function pinnedSignerPems(): string[] {
  const extra = Deno.env.get("ECF_RECEPTOR_PINNED_SIGNER_PEMS")?.trim();
  return [...DGII_CERTIFICATION_SIGNERS.map((signer) => signer.pem), ...(extra ? [extra] : [])];
}

const security = createXmlSecurity({ trustedCaPems: trustedCaPems(), pinnedSignerPems: pinnedSignerPems() });
let store: ReturnType<typeof createSupabaseStore> | null = null;

function internalError(): Response {
  return new Response(JSON.stringify({ error: "Internal error.", code: "INTERNAL" }), {
    status: 500,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve((req) => {
  try {
    store ??= createSupabaseStore(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
  } catch {
    console.warn("ecf-receptor: missing required environment");
    return internalError();
  }
  return handleRequest(req, {
    store,
    security,
    now: () => new Date(),
    encryptionKey: () => Deno.env.get("ECF_ENCRYPTION_KEY"),
    // Seeds are HMAC-authenticated with a dedicated server-only secret. Required: without it the
    // receptor answers 503 (fail closed) instead of deriving keys from unrelated secrets.
    seedSecret: () => Deno.env.get("ECF_RECEPTOR_SEED_SECRET")?.trim() || undefined,
    // Never log payloads, certificates or secrets: event names and short codes only.
    log: (event, detail) => console.warn(`ecf-receptor: ${event}`, detail ?? {}),
  });
});
