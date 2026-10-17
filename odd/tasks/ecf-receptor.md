# Feature: e-CF receptor (DGII inbound services)

## Objective
Expose the DGII-mandated inbound services for every tenant so DGII certification (and later
production) can reach Cloudix:
- `GET  /{rnc}/fe/autenticacion/api/semilla`
- `POST /{rnc}/fe/autenticacion/api/validacioncertificado`
- `POST /{rnc}/fe/recepcion/api/ecf` (returns signed ARECF)
- `POST /{rnc}/fe/aprobacioncomercial/api/ecf` (receives ACECF)

## Problem
- DGII postulation (step 1) registers the receptor URLs. They were placeholders
  (`api.cloudix.com`, hardcoded in `ActivationPanel.tsx`) and no server implemented them.
- The tracker `odd/tasks/ecf-activation.md` left e-CF reception and ACECF out of scope.

## Why
DGII certification calls these URLs for real (reception and commercial approval tests). Without
them the tenant cannot certify as an electronic issuer/receiver.

## Infrastructure (verified 2026-10-17)
- Public base registered at DGII for tenant RNC 133488485: `https://cloudix-ecf.azokia.com/133488485`.
- Cloudflare: CNAME `cloudix-ecf.azokia.com` → tunnel `ec49e873…cfargotunnel.com` (proxied);
  tunnel ingress → `https://localhost:443`, `noTLSVerify: true` (config version 109).
- Dokploy (compose `bases-de-datos-supabase-lsx27y`, self-hosted Supabase): domain
  `cloudix-ecf.azokia.com` on service `kong`, port 8000, Internal Path
  `/functions/v1/ecf-receptor`, HTTPS Let's Encrypt. Redeployed by the user.
- Probe: `https://cloudix-ecf.azokia.com/...` returns the same edge-runtime error as
  `cloudix-db.azokia.com/functions/v1/ecf-receptor/...` ("could not find an appropriate
  entrypoint") → routing works end to end, no JWT/apikey demanded.
- Edge runtime image: `supabase/edge-runtime:v1.74.0`; functions dir
  `../files/volumes/functions` → `/home/deno/functions`; main service
  `/home/deno/functions/main`; `VERIFY_JWT: ${FUNCTIONS_VERIFY_JWT}` (global).
- Deployment method (verified by read-only VPS diagnosis): there are NO per-function Dokploy file
  mounts. The compose bind-mounts the whole host dir
  `/etc/dokploy/compose/bases-de-datos-supabase-lsx27y/files/volumes/functions` ->
  `/home/deno/functions`. Existing dirs: hello, lookup-business-rnc, main, validate-ecf-certificate.
  Deploying = placing `ecf-receptor/` (every imported file) in that host dir (root-owned; the
  previous upload used `docker cp <dir> bases-de-datos-supabase-lsx27y-functions-1:/home/deno/functions/`).
  A NEW function dir is picked up on its first request. Editing an already-booted function may
  need the `functions` container restarted: in the T1 Docker run (main service `forceCreate: false`)
  an edited file was not re-read until `forceCreate: true` / container restart. Confirm on the VPS.
- Functions container env: SUPABASE_URL defined, SUPABASE_SERVICE_ROLE_KEY defined, VERIFY_JWT=false
  (global), **ECF_ENCRYPTION_KEY NOT defined** (needed by the receptor and `validate-ecf-certificate`;
  same value as the fiscal worker). The receptor must fail closed with a non-secret error without it.
- ROOT CAUSE of `module is not defined`: the deployed `validate-ecf-certificate/index.ts` (783 bytes)
  is NOT the repo version; it is an old Insforge stub using CommonJS
  `module.exports = async function validateEcfCertificate(request)`, copied 2026-09-11 via
  `docker cp`. `npm:dgii-ecf` is not the cause (see T1 evidence). Fix = deploy the repo version
  (follow-up, out of scope here).

## Scope
In: receptor edge function, persistence migration, pure protocol logic + tests, local
verification in the same edge-runtime image, deployment instructions, replace placeholder URLs in
ActivationPanel with the real base.
Out (separate authorization): applying migrations / deploying to production, fixing the deployed
`validate-ecf-certificate` (diagnosis only here), outbound ACECF sending, UI for received e-CF.

## Constraints
- Never log or return `.p12` bytes, passwords or `ECF_ENCRYPTION_KEY`.
- Receptor signs ARECF with the tenant's cloud-custodied certificate (same custody as
  `worker/fiscal/certificateCustody.ts` / `validate-ecf-certificate`).
- New tables: RLS on, no anon/authenticated write grants (mirror T1d lockdown).
- Migrations as files only; production apply requires user confirmation.
- Generated artifacts in English.

## Route
Delegated direct. Trigger evidence: 4+ files to understand (modulo-ecf client auth, custody,
migrations, edge function) and 2+ non-trivial files to write.

## TDD
Mode: off (no project TDD config). Runner: `npm test` (vitest), `npm run typecheck`.
User norm: typecheck + vitest after every change; tests for all new logic.

## Review / delivery
RDD: off (default). Delivery strategy: ask-on-risk. Forecast > 400 authored lines → ask chain
strategy before opening PRs.

## Tasks
- [x] T1 Spike: in Docker `supabase/edge-runtime:v1.74.0`, prove which XML-signing/verification
  stack loads and works (npm:dgii-ecf vs npm:xml-crypto + npm:node-forge/@xmldom); reproduce and
  explain the `module is not defined` failure of `validate-ecf-certificate`.
- [x] T2 Migration: seeds/tokens, received e-CF, received approvals tables (+ storage refs) with
  RLS and lockdown; migration test.
- [x] T3 `supabase/functions/ecf-receptor`: routing by `/{rnc}/fe/...`, tenant lookup by RNC,
  seed issue/validate, short-lived token, reception with signed ARECF, ACECF intake; pure logic
  extracted and unit-tested; `config.toml` `verify_jwt = false` for this function.
- [x] T4 ActivationPanel: real base `cloudix-ecf.azokia.com/{rnc}`; tests.
- [x] T5 Deployment doc (Dokploy file mounts, required env, migration order) — deploy itself
  needs user OK.

## Progress
- 2026-10-17: infra created and verified (see Infrastructure). Branch `feat/ecf-receptor`.

- 2026-10-17 T1 DONE. Evidence (Docker `supabase/edge-runtime:v1.74.0`, throwaway main service
  routing by first path segment, files under the session scratchpad, not in the repo):
  - (a) static `import { P12Reader, Signature, CustomAuthentication, SenderReceiver } from "npm:dgii-ecf"`
    (unpinned) and pinned `npm:dgii-ecf@1.8.0` both load and run. With the repo's `SAMPLE_CERT.p12`
    (pass `pass123`): `P12Reader.getCertificateInfoFromBase64` ok, `getKeyFromStringBase64` ok,
    `Signature.signXml(seed, "SemillaModel")` produced a 3824-char signed doc and
    `npm:xml-crypto@6.1.2` `checkSignature` returned `true` for it (independent verification).
  - (b) Stack for T3: `npm:dgii-ecf@1.8.0` (P12Reader + Signature) for cert parsing/signing,
    `npm:xml-crypto@6.1.2` + `npm:@xmldom/xmldom@0.8.12` for verifying incoming signed XML,
    WebCrypto for AES-GCM/SHA-256/random. Runtime facts: `npm:` specifiers must be static (a
    template-literal dynamic `import(\`npm:dgii-ecf@${v}\`)` fails with "Could not find constraint");
    sibling data files are NOT readable at runtime via `Deno.readFile` (code is compiled to
    `/var/tmp/sb-compile-edge-runtime/`), but sibling `.ts` imports work; workers are cached per file.
  - (c) `module is not defined` reproduced with a CommonJS stub (`module.exports = async function ...`)
    as `index.ts`: log `ReferenceError: module is not defined`, HTTP 500 even on OPTIONS. The repo's
    `validate-ecf-certificate/index.ts` copied verbatim answers OPTIONS 200 in the same image, so the
    production failure is the stale Insforge stub (see Infrastructure), not `npm:dgii-ecf`. Follow-up:
    deploy the repo version of `validate-ecf-certificate` (and set `ECF_ENCRYPTION_KEY`).

- 2026-10-17 T2 DONE: `supabase/migrations/20261017160000_ecf_receptor.sql` (tables
  `ecf_receptor_seeds`, `ecf_receptor_tokens` (hash only), `ecf_received_documents`,
  `ecf_received_approvals`; RLS on; client roles revoked, tenant read of non-XML columns only;
  RPCs `ecf_receptor_resolve_tenant(rnc)` digits-only and unique-or-nothing, `ecf_receptor_purge_expired()`,
  both service_role only). Received XML is stored in table columns (no storage bucket) - decision
  for simplicity; revisit if XML size becomes a concern. Verified against a throwaway
  `postgres:16-alpine` container with stub tenants/tenant_users/auth.uid: applied twice without
  error (idempotent); RNC `133-488-485` resolves from `133488485`; an RNC shared by 2 tenants returns 0
  rows. Tests: `test/ecf-receptor-migration.test.ts` (7). Note: `tenants.ecf_environment` is not
  defined in repo migrations, so the RPC does not use it; the function reads it at runtime.
  Pre-existing/unrelated failure: `test/local-sync-protocol.test.ts` (needs docker compose via
  `scripts/local-sync-postgres.ps1`; fails in this environment).

- 2026-10-17 T3 DONE. `supabase/functions/ecf-receptor/`: `protocol.ts` (pure: routing, seed/token, ARECF/ACECF
  rules), `custody.ts` (AES-GCM passphrase decrypt, fail-closed `NotConfiguredError`), `security.ts`
  (npm:dgii-ecf@1.8.0 signing + npm:xml-crypto@6.1.2 verification, requires exactly one Signature whose
  single Reference has empty URI, cert validity checked, NO CA chain check), `handler.ts` (DI flow),
  `store.ts` (service-role Supabase), `index.ts`; `[functions.ecf-receptor] verify_jwt = false`;
  `vitest.config.ts` maps `npm:pkg@ver` imports to node_modules so edge code is tested from Node.
  Contract decisions: seed 5 min single-use (hash stored, atomic consume), token 1 h opaque random
  (hash stored) returned as `{token, expira, expedido}`; reception/approval require the Bearer token of
  the same tenant; ARECF codes 1 spec / 2 signature / 3 duplicate / 4 buyer RNC mismatch (order 1,2,4,3),
  types 31/33/34/44 accepted; ARECF signed with the tenant certificate; missing cert or key -> 503 and
  nothing stored; ACECF response body (`{message, encf}`) is NOT a DGII-specified shape (unverified).
  Tests: `test/ecf-receptor-protocol.test.ts` (34), `test/ecf-receptor-handler.test.ts` (16, real signing
  and verification with a generated .p12), migration test (7).
  Docker (`supabase/edge-runtime:v1.74.0`, main service routing on first segment, workers cached): the
  function files + an in-memory store ran end to end and the REAL `dgii-ecf` `RestApi` client (buyerHost mode)
  completed: getSeedApi -> sign -> getAuthTokenApi (token/expira/expedido) -> sendElectronicDocumentApi
  returned a signed ARECF Estado 0; resubmission -> Estado 1 code 3; tampered -> code 2; `/Semilla` mixed
  case 200; unknown RNC 404; no token 401; signed ACECF 200. The real `index.ts` + `store.ts` graph also
  loads in the image (esm.sh supabase-js resolved) and answers 404/500 with no leak against a dead
  `SUPABASE_URL`. NOT exercised locally: real Supabase (RPC `ecf_receptor_resolve_tenant`, storage download
  of the .p12, PostgREST insert/23505 mapping), Kong/Dokploy/Cloudflare path rewriting, DGII itself.

- 2026-10-17 T4 DONE: `src/features/fiscal/lib/receptorUrls.ts` (single host constant
  `ECF_RECEPTOR_BASE_URL`, `buildReceptorUrls`) + `receptorUrls.test.ts` (4); the 6 placeholder
  `api.cloudix.com/rnc_...` URLs in `ActivationPanel.tsx` now use it (no `rnc_` prefix, digits only).
  typecheck clean; `npm test`: 163 files passed, 1 failed (pre-existing `local-sync-protocol`, needs docker
  compose; fails identically without my changes).

- 2026-10-17 T5 DONE: `docs/ecf-receptor-deployment.md` (request path, migration, host-dir deployment via
  `docker cp`, env names incl. missing `ECF_ENCRYPTION_KEY`, VERIFY_JWT implications, validate stub follow-up,
  curl smoke tests, known limits) linked from `supabase/README.md`. Docs only; checked by readback.

## Open decisions for the user
- Trust model for incoming signatures (CA chain / DGII cert pinning) - currently integrity + validity only.
- ACECF acknowledgement body and error body shapes are not DGII-verified.
- Authorization to apply the migration, set `ECF_ENCRYPTION_KEY`, copy the function dir and deploy the repo
  `validate-ecf-certificate` on the VPS.
- Delivery: forecast well above 400 authored lines -> choose chain strategy (`stacked-to-main` or
  `feature-branch-chain`) before opening PRs.

## Next step
User review; then authorized deployment following the runbook.
