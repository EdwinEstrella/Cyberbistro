# ecf-test-send

## Objective
Let a tenant admin send one test e-CF (E31) to the DGII TesteCF environment with the tenant's own certificate and
see DGII's answer (trackId, estado, mensajes) from the Activation panel — without touching certification or
production and without the fiscal worker.

## Problem / why
- After certification (Salpimentao finished CerteCF step 15 on 2026-10-20) there is no way to check that the
  tenant's certificate, data and DGII authentication work end to end before going to production.
- `supabase/functions/ecf-certification` already authenticates, signs and sends to any DGII environment
  (`dgiiClient.ts` `dgiiUrls(environment)`), but only for xlsx-driven runs (`run.ts` start/send-next).

## Facts
- DGII client: `supabase/functions/ecf-certification/dgiiClient.ts` (sendEcf → `{ecf}/{path}/recepcion/api/FacturasElectronicas`,
  trackStatus). Signer: `loadSigner(ctx, environment)`; certificate lookup by exact `(tenant, environment)` in
  `ecf_certificate_metadata` (`store.ts:93-110`). Actions routed in `handler.ts:56-63`; admin/super_admin only.
- XML builder helpers: `builder.ts` (escapeXml, stampSignatureTime, securityCodeFromSignedXml), driven by test-set rows.
- E31 returns a trackId (E32 < 250k goes through RFCE on fc.dgii.gov.do and answers synchronously) → use E31.
- The tenant has no `ecf_certificate_metadata` row for `test`; the user will upload the same .p12 choosing
  "Pruebas (TesteCF)" in Activation (without pressing Guardar ambiente).
- Fiscal worker picks the certificate row (hence environment) by newest `valid_until/created_at`, not by
  `tenants.ecf_environment` (`worker/fiscal/postgresFiscalWorkerRepository.ts:249-256`) → ambiguous once a tenant
  has test + certification rows. Out of scope here; must be fixed before production (follow-up).

## Scope
In: `send-test` action (test environment only) that builds a minimal valid E31 from tenant fiscal data, signs,
authenticates, sends to TesteCF, returns trackId and then the status; a status re-check; Activation UI button + result
view when the selected environment is "Pruebas (TesteCF)"; tests with mocked DGII.
Out: schema changes, fiscal worker, production/certification sends, E32/RFCE.

## Constraints
Never send to certification or production from this action. No DGII calls from tests. English code / Spanish UI.
No AI attribution in commits. Edge deploy is manual (Dokploy mounts + restart functions-1).

## Route
Delegated direct (writer trigger: edge action + UI + tests, 2+ non-trivial files).

## TDD
Mode: off (project convention). Runner: `npx vitest run`, `npm run typecheck`.

## Delivery
Strategy ask-on-risk; forecast ~350 authored lines; branch feat/ecf-test-send from master @ 09520bb.

## Tasks
- [x] T1 Edge: `send-test` + `test-status` actions in ecf-certification (E31 builder from tenant data, TesteCF only,
      structured result), tests.
- [x] T2 UI: "Enviar factura de prueba a TesteCF" in Activation (test env), shows trackId/estado/mensajes, re-check
      status; tests.

## Follow-ups
- Fiscal worker must select the certificate by `tenants.ecf_environment` before production.

## Progress
- 2026-10-20: document created; branch created.
- 2026-10-20 T1 (delegated writer): `testSend.ts` (send-test, test-status; environment hard-coded "test", request must say
  `environment: "test"` else 400 TEST_ENVIRONMENT_ONLY), routed in `handler.ts`, `tenantIssuerProfile` added to
  CertificationStore (`context.ts`, `store.ts`: tenants.rnc, nombre_negocio, direccion, ecf_issuer_*). Missing
  RNC/razón social/dirección -> 422 ISSUER_INCOMPLETE; no test cert -> 409 CERTIFICATE_NOT_READY; send without trackId ->
  422 DGII_REJECTED with mensajes; best-effort immediate trackStatus. Tests: `test/ecf-certification-test-send.test.ts` (14).
- 2026-10-20 T2 (delegated writer): `lib/ecfTestSend.ts` (+test), `components/EcfTestSendCard.tsx` (container + pure
  `EcfTestSendView`, +test), rendered in Activation step 2 under CertificateUploader when environment is "test".
- Checks: `npx vitest run test/ecf-certification src/features/fiscal` -> 24 files / 276 tests passed;
  `npm run typecheck` -> clean. `graphify update .` not run (graphify-out/ excluded from this writer's scope).
- Decisions: buyer default RNC 131880681 / "CLIENTE DE PRUEBA" (RNC from the DGII test-set sample fixtures), overridable via
  `compradorRnc` / `compradorRazonSocial`; eNCF = E31 + `secuencia` (optional) or current Unix second (10 digits);
  Municipio/Provincia only emitted when they are 6-digit DGII codes (free text would fail the schema); no XSD in repo,
  so XML shape is asserted structurally.
- Open questions: does TesteCF accept an eNCF outside an authorized range and a buyer RNC it may not know (131880681)?
  Verify with the first real send; adjust the default buyer if DGII rejects it.

## Next step
Parent: review + commit T1/T2; manual edge deploy (Dokploy mount + restart functions-1); upload the .p12 as "Pruebas (TesteCF)" and run one real send.
