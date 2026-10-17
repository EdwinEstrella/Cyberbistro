# e-CF receptor: deployment runbook

The `ecf-receptor` edge function implements the DGII inbound services for every tenant:

| Method | Public URL | Purpose |
| --- | --- | --- |
| GET | `https://cloudix-ecf.azokia.com/{rnc}/fe/autenticacion/api/semilla` | Issue a single-use seed (XML `SemillaModel`) |
| POST | `https://cloudix-ecf.azokia.com/{rnc}/fe/autenticacion/api/validacioncertificado` | Exchange a signed seed for a 1 h bearer token (`token`, `expira`, `expedido`) |
| POST | `https://cloudix-ecf.azokia.com/{rnc}/fe/recepcion/api/ecf` | Receive an e-CF, answer a signed ARECF (requires the bearer token) |
| POST | `https://cloudix-ecf.azokia.com/{rnc}/fe/aprobacioncomercial/api/ecf` | Receive a signed ACECF (requires the bearer token) |

Path matching is case-insensitive. Nothing in this runbook has been applied to production; every step needs explicit authorization.

## How a request reaches the function

```
DGII -> Cloudflare (CNAME cloudix-ecf.azokia.com -> tunnel, proxied)
     -> tunnel ingress https://localhost:443 (noTLSVerify)
     -> Dokploy/Traefik domain on service `kong`:8000, Internal Path /functions/v1/ecf-receptor
     -> Kong /functions/v1/ route -> functions:9000, which sees /ecf-receptor/{rnc}/fe/...
        (verified by probe: the edge runtime reports the function entrypoint for this name)
     -> edge-runtime main service routes on the first path segment: /home/deno/functions/ecf-receptor
```

The function also accepts `/{rnc}/fe/...` and `/functions/v1/ecf-receptor/{rnc}/fe/...`.

## 1. Migration (apply first)

Forward-only, apply in lexicographic order. The receptor migration is
`supabase/migrations/20261017160000_ecf_receptor.sql`; it needs `public.tenants`, `public.tenant_users`
and the earlier `20261017*` ecf migrations (certificate custody and lockdown) to be applied already.
It creates `ecf_receptor_seeds`, `ecf_receptor_tokens`, `ecf_received_documents`,
`ecf_received_approvals` (RLS on, no client write access) and two `service_role`-only RPCs
(`ecf_receptor_resolve_tenant`, `ecf_receptor_purge_expired`). It is idempotent (re-running is safe).

## 2. Function files

Deployment on the VPS is **not** per-function Dokploy file mounts. The compose bind-mounts the whole host
directory `/etc/dokploy/compose/bases-de-datos-supabase-lsx27y/files/volumes/functions` to
`/home/deno/functions` in the `functions` container. Deploying means placing the complete directory
`supabase/functions/ecf-receptor/` (every file it imports) in that host directory:

```
ecf-receptor/index.ts      ecf-receptor/handler.ts    ecf-receptor/protocol.ts
ecf-receptor/custody.ts    ecf-receptor/security.ts   ecf-receptor/store.ts
```

The host directory is root-owned. The previous upload method was
`docker cp ecf-receptor bases-de-datos-supabase-lsx27y-functions-1:/home/deno/functions/`.
`config.toml` (`verify_jwt = false`) is only for the Supabase CLI; the self-hosted runtime has no per-function
JWT setting (see step 4).

A new function directory is picked up on its first request. After *editing* files of an already-booted
function, restart the `functions` container so cached workers reload (observed in the edge-runtime
v1.74.0 image: workers are cached per function). First cold start downloads `npm:` packages and
`https://esm.sh/@supabase/supabase-js@2`, so the container needs outbound internet.

## 3. Environment on the `functions` service (names only)

| Variable | Needed by | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | receptor, validator | Already defined |
| `SUPABASE_SERVICE_ROLE_KEY` | receptor, validator | Already defined |
| `ECF_ENCRYPTION_KEY` | receptor, validator | **Currently NOT defined on the VPS.** Same value as the fiscal worker, format `ecf-v1:<base64url 32 bytes>` |
| `SUPABASE_PUBLISHABLE_KEY` | validator only | Used by `validate-ecf-certificate` |

Without `ECF_ENCRYPTION_KEY` the receptor still serves seeds and tokens but answers reception with
`503 {"code":"NOT_CONFIGURED"}` and stores nothing (it fails closed with a non-secret message).
Do not put these values in the repository, in `config.toml`, or in client environment variables.

## 4. JWT verification

The compose sets `VERIFY_JWT: ${FUNCTIONS_VERIFY_JWT}` globally and the VPS currently has it `false`, which is
required: DGII sends no Supabase JWT. If `FUNCTIONS_VERIFY_JWT` is ever switched to `true`, every DGII call
returns 401 before reaching the function. Per-function control exists only via the Supabase CLI
(`[functions.ecf-receptor] verify_jwt = false`). The function authenticates its own callers with the
bearer token issued by `validacioncertificado`. `validate-ecf-certificate` keeps its own JWT check inside the code.

## 5. Related, out of scope here

The `validate-ecf-certificate` function currently deployed on the VPS (783 bytes) is an old Insforge stub using
CommonJS `module.exports`, which is why it fails with `ReferenceError: module is not defined`. Replace it with the
repository version (`supabase/functions/validate-ecf-certificate/index.ts`, verified to load in the same image).

## 6. Smoke tests

Use a tenant whose `tenants.rnc` is set. Read-only until step 3 (which writes a seed row).

```bash
RNC=133488485
BASE=https://cloudix-ecf.azokia.com/$RNC

# 1. Routing and case-insensitivity: expect 200 and an XML <SemillaModel>
curl -si "$BASE/fe/autenticacion/api/semilla"
curl -si "$BASE/fe/autenticacion/api/Semilla" | head -1

# 2. Unknown taxpayer: expect 404 {"code":"TENANT_NOT_FOUND"}
curl -si https://cloudix-ecf.azokia.com/999999999/fe/autenticacion/api/semilla | head -1

# 3. Auth required: expect 401 {"code":"UNAUTHENTICATED"}
curl -si -X POST "$BASE/fe/recepcion/api/ecf" | head -1
curl -si -X POST "$BASE/fe/aprobacioncomercial/api/ecf" | head -1

# 4. Unsigned seed is rejected: expect 401
curl -si -X POST "$BASE/fe/autenticacion/api/validacioncertificado" \
  -F 'xml=@seed.xml;type=text/xml' | head -1
```

Full flow (sign the seed with a test certificate, obtain the token, send an e-CF) is what the `dgii-ecf`
`RestApi` client does with its `buyerHost` argument: `getSeedApi(host)`, sign with `Signature`,
`getAuthTokenApi(signedSeed, host)`, `setAuthToken(token)`, `sendElectronicDocumentApi(signedEcf, fileName, host)`
where `host` is `https://cloudix-ecf.azokia.com/{rnc}`. The reception response must be an XML `<ARECF>` whose
`Estado` is `0`; the tenant must have a ready certificate (`ecf_certificate_metadata.is_ready`) and
`ECF_ENCRYPTION_KEY` must be set, otherwise expect `503`.

## Known limits

- The signer certificate of incoming documents is validated for signature integrity and validity dates only; its
  chain of trust to a DGII-accepted CA is not checked.
- The ACECF acknowledgement body (`{"message","encf"}`) is not a DGII-specified shape.
- No rate limiting is applied at the function; rely on Cloudflare rules if abuse appears.
- Expired seeds/tokens are kept until `select public.ecf_receptor_purge_expired()` runs (no schedule is created).
