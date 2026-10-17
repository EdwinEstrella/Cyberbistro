# e-CF receptor: deployment runbook

The `ecf-receptor` edge function implements the DGII inbound services for every tenant:

| Method | Public URL | Purpose |
| --- | --- | --- |
| GET | `https://cloudix-ecf.azokia.com/{rnc}/fe/autenticacion/api/semilla` | Issue a stateless, single-use, 5 min seed (XML `SemillaModel`) |
| POST | `https://cloudix-ecf.azokia.com/{rnc}/fe/autenticacion/api/validacioncertificado` | Exchange a seed signed with a **trusted Dominican certificate that asserts an RNC** for a 1 h bearer token (`token`, `expira`, `expedido`) |
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

## 1. Migrations (apply first)

Forward-only, apply in lexicographic order: `20261017160000_ecf_receptor.sql`, then
`20261017170000_ecf_receptor_hardening.sql` (hash-only rejected documents, one approval per eNCF, pg_cron purge
when the extension exists, otherwise run `select public.ecf_receptor_purge_expired()` daily from any scheduler).
The first needs `public.tenants`, `public.tenant_users`
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
ecf-receptor/trustedCas.ts
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
| `ECF_RECEPTOR_SEED_SECRET` | receptor (**required**) | HMAC keying material for stateless seeds, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. No fallback to other secrets: without it seed issuance and the seed exchange answer `503 NOT_CONFIGURED` (fail closed) |
| `ECF_RECEPTOR_TRUSTED_CA_PEMS` | receptor (optional) | Extra trusted CA certificates, PEM bundle (multi-line value). Use for DGII certification-environment CAs if they differ from the built-in list |

Without `ECF_ENCRYPTION_KEY` the receptor still authenticates callers but answers reception with
`503 {"code":"NOT_CONFIGURED"}` and stores nothing (it fails closed with a non-secret message).
Do not put these values in the repository, in `config.toml`, or in client environment variables.

## 4. JWT verification

The compose sets `VERIFY_JWT: ${FUNCTIONS_VERIFY_JWT}` globally and the VPS currently has it `false`, which is
required: DGII sends no Supabase JWT. If `FUNCTIONS_VERIFY_JWT` is ever switched to `true`, every DGII call
returns 401 before reaching the function. Per-function control exists only via the Supabase CLI
(`[functions.ecf-receptor] verify_jwt = false`). The function authenticates its own callers with the
bearer token issued by `validacioncertificado`. `validate-ecf-certificate` keeps its own JWT check inside the code.

## 5. Certificate trust (who may authenticate and deliver)

Authentication is only as strong as the certificate check, so the receptor never trusts the certificate embedded
in the caller's XML by itself:

1. The signer certificate must chain to a trust anchor: the built-in Dominican list in
   `supabase/functions/ecf-receptor/trustedCas.ts` plus `ECF_RECEPTOR_TRUSTED_CA_PEMS`. Self-signed certificates,
   CA certificates used as signers, expired links and unknown issuers are rejected. An empty trust store rejects
   everything (fail closed). Revocation (OCSP/CRL) is **not** checked.
2. What the certificate says about the signer is read ONLY from the exact ETSI EN 319 412-1 identifiers, matched by
   OID with a required prefix, in a subject whose `countryName` is `DO`: `organizationIdentifier` (2.5.4.97) =
   `VATDO-<9|11 digits>` (a company vouched for by the CA) and `serialNumber` (2.5.4.5) = `IDCDO-<9|11 digits>` (a
   person). Names, organizations and unit names are never read, because anyone can choose them when requesting a
   certificate. What was found is stored on the token (`subject_rnc`) and on each received document (`signer_ids`,
   plus the raw `signer_serial` for information).
3. **The usual DGII signer certificate is a person certificate.** Viafirma's "Procedimientos Tributarios" profile
   (`VIAFIRMA-PI-DGII`) and Digifirma's "Certificado Facturacion Electronica" are issued to an individual linked to a
   company; their published properties are name, cedula/passport and email only, with the link to the company
   established by DGII records (see the evidence in `odd/tasks/ecf-receptor.md`, T7). So the company RNC is normally
   NOT in the certificate, and requiring it would reject every legitimate sender. The binding rule is therefore:
   - the certificate names a company (`VATDO-`): the document's RNC (`RNCEmisor` for an e-CF, `RNCComprador` for an
     ACECF) must be that company, otherwise reject (token: 403, document: ARECF code 2 / ACECF 400);
   - the certificate names no company (person-only, or no recognised identifier): accept on chain trust + signature
     validity and set `signer_rnc_mismatch = true` on the stored document/approval (the ARECF still says Estado 0),
     unless the person's cedula equals the RNC (persona fisica), which is "bound".
   **Consequence:** with person-only certificates the receptor can prove WHO signed (a person vetted by an
   authorized CA) but not that this person represents the issuer RNC. Tenants must review flagged documents;
   the open decision is whether to require an allow-list of signer documents per issuer.
4. Commercial approval uses the same rules with `RNCComprador` as the signing party and `RNCEmisor` = the tenant.

Built-in anchors (CA certificates downloaded from each operator's own site, as linked by INDOTEL's list of
authorized certification entities, https://indotel.gob.do/firma-digital/entidades-de-certificacion/ ; SHA-256
fingerprints are pinned by `test/ecf-receptor-trust.test.ts`):

| Operator | Anchor | Source |
| --- | --- | --- |
| Avansi / Viafirma Dominicana | Avansi Certificacion (root), Avansi Certificados Digitales, Viafirma Qualified Certificates | https://cps.viafirma.do/ |
| Camara de Comercio y Produccion de Santo Domingo (Digifirma) | Digifirma CA Raiz, Digifirma CA Subordinada 1 | https://digi.camarasantodomingo.do/informacion-adicional/certificados-raiz/ |
| Novosit (NovoFirma) | Novosit CA1 (its global Uanataca root is deliberately not trusted) | https://novofirma.com/RootCertificate |
| Digito Financial Technology Group | Digito Root CA (valid 2026-06-22 to 2046-06-17, RSA 4096, SHA-256; same fingerprint over HTTP and HTTPS; operator authorized by INDOTEL Res. 115-2025) | http://pki.digito.do/CAs/DigitoRootCA.crt |

Authorized entities whose DR-specific CA certificates could not be obtained from a primary source and are NOT
trusted yet: ABA (firmadigital.aba.org.do), OGTIC (ca.ogtic.gob.do), Lleidanet Dominicana (the Indenova root is
global), Thomas Signe. Add them with `ECF_RECEPTOR_TRUSTED_CA_PEMS` once the PEMs are verified.

DGII's own certification environment: DGII's published process only requires a certificate from an authorized trust
service provider; nothing found says the test platform signs with a separate DGII CA. If DGII's sender certificate
in certification tests is not covered by the list above, add its CA through `ECF_RECEPTOR_TRUSTED_CA_PEMS`.

## 6. Rate limits (Cloudflare, recommended)

The function is public. Seeds are stateless (no database write on GET), but every request still costs CPU.
Recommended Cloudflare rules for `cloudix-ecf.azokia.com`: 30 req/min per IP on `*/fe/autenticacion/*`,
120 req/min per IP on `*/fe/recepcion/*` and `*/fe/aprobacioncomercial/*`, block methods other than GET/POST,
and block requests with a body larger than 5 MB (content-length rule): behind the edge runtime proxy a server-side 413 for a client that is still uploading may stall instead of replying cleanly. Allow-list DGII's source addresses once DGII publishes them.

## 7. Related, out of scope here

The `validate-ecf-certificate` function currently deployed on the VPS (783 bytes) is an old Insforge stub using
CommonJS `module.exports`, which is why it fails with `ReferenceError: module is not defined`. Replace it with the
repository version (`supabase/functions/validate-ecf-certificate/index.ts`, verified to load in the same image).

## 8. Smoke tests

Nothing below writes to the database (a failed login or a missing token touches no table).

```bash
RNC=133488485
BASE=https://cloudix-ecf.azokia.com/$RNC

# 1. Routing and case-insensitivity: expect 200 and an XML <SemillaModel>
curl -si "$BASE/fe/autenticacion/api/semilla"
curl -si "$BASE/fe/autenticacion/api/Semilla" | head -1

# 2. Unknown taxpayers get a seed too (no tenant oracle) but can never log in: expect 200
curl -si https://cloudix-ecf.azokia.com/999999999/fe/autenticacion/api/semilla | head -1

# 3. Auth required: expect 401 {"code":"UNAUTHENTICATED"}
curl -si -X POST "$BASE/fe/recepcion/api/ecf" | head -1
curl -si -X POST "$BASE/fe/aprobacioncomercial/api/ecf" | head -1

# 4. Unsigned or self-signed seed is rejected: expect 401
curl -si -X POST "$BASE/fe/autenticacion/api/validacioncertificado" \
  -F "xml=@seed.xml;type=text/xml" | head -1
```

The full flow needs a certificate from a trusted CA that asserts the RNC. It is what the `dgii-ecf` `RestApi`
client does with its `buyerHost` argument: `getSeedApi(host)`, sign with `Signature`,
`getAuthTokenApi(signedSeed, host)`, `setAuthToken(token)`, `sendElectronicDocumentApi(signedEcf, fileName, host)`
where `host` is `https://cloudix-ecf.azokia.com/{rnc}`. The reception response must be an XML `<ARECF>` whose
`Estado` is `0`; the tenant must have a ready certificate (`ecf_certificate_metadata.is_ready`) and
`ECF_ENCRYPTION_KEY` must be set, otherwise expect `503`.

## Known limits

- Revocation of signer certificates (OCSP/CRL) is not checked.
- The ACECF acknowledgement body (`{"message","encf"}`) is not a DGII-specified shape.
- Rate limiting is not applied in the function; see section 6.
- Most real signer certificates are person-only (see section 5): documents they sign are accepted but flagged
  `signer_rnc_mismatch`; the receptor cannot tell whether the signer is authorized to act for the claimed RNC.
- Viafirma/Avansi's policy places an UNPREFIXED cedula/passport in `serialNumber`; it is recorded in
  `signer_serial` but never used for binding.
- Incoming XML with DTDs, entities, comments, CDATA or processing instructions, repeated key fields (`RNCEmisor`,
  `RNCComprador`, `eNCF`, `Estado`) or more than 5 embedded certificates is rejected.
- Seeds are single use per decoded value (a non-canonical base64 spelling of a used seed is rejected).
- Commercial approvals are unique per (tenant, issuer, eNCF, buyer); a different buyer never overwrites another one.
- Consumed seeds and expired tokens are kept until `select public.ecf_receptor_purge_expired()` runs (daily via
  pg_cron when available).
