# ecf-certification-testset

## Objective
Phase 2 of the real DGII certification flow: take the DGII "Set de Pruebas" Excel (portal step 2), build every
e-CF and RFCE from it, sign them with the tenant's cloud certificate, send them to the DGII CerteCF services in a
valid order, track their status, and hand the user the signed consumo (<250k) e-CF to upload in the portal.

## Problem
Wizard step 2 is a mock ("El procesamiento todavia no esta conectado"). Outbound DGII calls were never made from the
cloud (only inbound receptor). No xlsx parser in the repo; no XSDs in the repo.

## Why
Salpimentao passed DGII step 1 (postulacion) on 2026-10-18 and is now at step 2. Built once for every tenant.

## Facts (verified 2026-10-18 from the real set 133488485-18102026163551.xlsx)
- Sheet `ECF`: 25 rows, 5215 flat columns in DGII schema order (`FormaPago[1]`, `MontoPago[1]`, ... item/line groups
  indexed with [n]); first column `CasoPrueba` (= RNC + eNCF), types 31,32,33,34,41,43,44,45,46,47.
- Sheet `RFCE`: 4 rows, 56 columns, all E32 (E320000000012..15) incl. `CodigoSeguridadeCF`.
- DGII portal step 2: RFCE for each consumo < RD$250k goes to the summaries service; once accepted, those full E32 are
  uploaded through the portal UI (not the API). Other e-CF go to the reception service; status via trackId.
- DGII endpoints (modulo-ecf/src/networking/RestApi.ts:23-39, restClient.ts:4-8): Semilla / ValidarSemilla,
  recepcion/api/FacturasElectronicas, recepcionfc/api/recepcion/ecf (fc host), consultaresultado (trackId).

## Scope
In: edge function `ecf-certification` (auth check, test-set run in resumable batches, status polling, signed consumo
download), dependency-free xlsx reader, flat-columns -> e-CF/RFCE XML builder, DGII client on fetch, persistence of
submissions, wizard step 2 UI, banner fix, tests. Out: ACECF/simulation/printed representation (phase 3); deployment.

## Constraints
- Never log or return .p12 bytes, passphrases, ECF_ENCRYPTION_KEY or DGII bearer tokens.
- Tenant admin only; per-tenant token (no shared global state across tenants).
- Migrations as files only; prod apply and Dokploy deploy need user confirmation. Real DGII calls only after deploy.
- Do not commit pre-existing unrelated dirty files.
- English artifacts; UI copy in the screen's Spanish.

## Route
Delegated direct (writer trigger). Stacked on feat/ecf-certification-signing.

## TDD
Mode: off (no project TDD config). Runner: `npx vitest run`, `npm run typecheck`.

## Tasks
- [x] T1 DGII client on fetch (seed -> sign -> token, send e-CF, send RFCE, trackId status) + `auth-check` action; tests with mocked fetch. Commit cf03366. Route: delegated (writer).
- [x] T2 xlsx reader (zip + DecompressionStream, no deps) and flat-columns -> XML builder for e-CF and RFCE (incl. FechaHoraFirma, CodigoSeguridadeCF from the signed E32); tests. Commit 2e7bdd9. Route: delegated (writer).
- [x] T3 Orchestration: migration `ecf_certification_submissions`; actions `start`, `send-next` (resumable batches), `status`, `download` (+ `latest` for resuming); dependency-aware order; tests. Commit 654a82c. Route: delegated (writer).
- [x] T4 Wizard step 2 UI (upload, progress table, poll, download consumo XMLs) + activation banner fix; tests for pure helpers. Commit cf5ca85. Route: delegated (writer).

## Progress
- 2026-10-18 created; test-set structure captured.

- 2026-10-18 T1-T4 implemented (one delegated writer).

## Verification evidence (2026-10-18)
- `npm run typecheck`: pass.
- `npx vitest run`: 178 files passed, 1 skipped; 1234 tests passed, 2 skipped (RLS tests without DATABASE_URL).
- Local builder run against the real set (scratchpad only, nothing committed): 25 e-CF + 4 RFCE built, 0 errors;
  all 29 signed with a throwaway certificate and their XMLDSig verified (29/0). Spot-checked E31/E34/RFCE nesting
  and element order against the header order and IECF.ts.
- No DGII network calls were made; migration not applied; function not deployed.

## Design notes
- Function `supabase/functions/ecf-certification/` (self-contained): dgiiClient.ts (fetch, hand-built fixed-length
  multipart field `xml`, per-call token, 20s timeout, 1 retry only on network/timeout for GET/ValidarSemilla, never
  for submissions), xlsx.ts, builder.ts, run.ts (plan/send-next/status/latest/download), context.ts, store.ts.
- Order: consumo E32 from the RFCE sheet -> sign as portal_upload (ready_for_portal), then its RFCE with the
  security code (first 6 chars of SignatureValue); then the other e-CF in sheet order, referenced documents moved
  before their notes; a note is only sent after its referenced document is accepted (send-next returns waitingFor).
- Concurrency: optimistic claim (status+attempts) per submission; DGII failures keep the item pending (max 3
  attempts), stop the batch; auth failures do not consume attempts.
- Migration adds `unsigned_xml` (built at start, not granted to clients), `depends_on_case_id`, `security_code`
  beyond the planned columns.
- Banner: activation notice now shown only while tenants.fiscal_mode === 'dgii_ecf' (`activationNotice` helper).

## Unmapped / unverified columns
- No column of the real set is unmapped (every column carrying data maps; unknown columns with data fail loudly).
- `SubtotalImpuestoAdicionalPaginaTabla[n]` is treated as a layout marker (must be empty).
- Mapped without an XSD in the repo (unused in this set, verify against the DGII XSD when available): item
  `Mineria` wrapper (PesoNetoKilogramo, PesoNetoMineria, TipoAfiliacion, Liquidacion); `MontosubRecargo` ->
  `MontoSubRecargo`; `NumeroLineaDoR` -> `NumeroLinea`; `SubtotalImpuestoAdicional` treated as a single element.
- RFCE built without FechaHoraFirma (as dgii-ecf convertECF32ToRFCE).

- 2026-10-18 PROD: migration ecf_certification_submissions applied + NOTIFY pgrst reload (RLS on, no client table grants, unsigned_xml hidden). ecf-certification deployed as 11 Dokploy file mounts (content verified, index.ts last); unauthenticated call -> 401. Added "Probar conexion con la DGII" (auth-check) button, commit 74dfe1c (inline, 1 mechanical change; typecheck + 12 tests pass). Real CerteCF auth pending the user click.

## Next step
User confirmation to apply migration 20261018140000 in production and deploy `ecf-certification` on Dokploy
(file mounts); then `auth-check` against CerteCF, then run the set from wizard step 2.
