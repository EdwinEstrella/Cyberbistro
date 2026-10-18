# ecf-certification-acecf

## Objective
Phase 3a of the real DGII certification flow: DGII portal step 3 ("Pruebas de Datos Aprobacion Comercial"). Read the
DGII ACECF data set, build one signed ACECF per row with the tenant certificate, send them to the DGII commercial
approval service (CerteCF), track results and show progress in wizard step 3.

## Facts (verified 2026-10-18 from the real set 133488485-18102026172843.xlsx)
- One sheet `ACEECF_Generadas`, 11 rows. Columns: Version | RNCEmisor | eNCF | FechaEmision | MontoTotal | RNCComprador |
  Estado | DetalleMotivoRechazo | FechaHoraAprobacionComercial. RNCEmisor = 131880681 (DGII test emitter),
  RNCComprador = tenant RNC 133488485, Estado = 1 (approved) for all, DetalleMotivoRechazo empty, timestamp given.
- Step 2 (test set) passed with every document accepted using supabase/functions/ecf-certification (deployed).
- CerteCF authentication from the edge runtime is proven (auth-check OK).
- Portal services for this step: autenticacion + aprobacion comercial.

## Scope
In: ACECF set detection/parsing in ecf-certification, ACECF XML builder + signing, DGII client `sendCommercialApproval`,
run type separation (test set vs ACECF) with a migration, wizard step 3 UI, tests. Out: steps 4+, deployment.

## Constraints
- Same as ecf-certification-testset (no secrets in logs/responses, tenant admin only, per-call token, migration file
  only, no DGII calls from tests, do not commit pre-existing unrelated dirty files, English artifacts / Spanish UI).

## Route
Delegated direct (writer trigger). Stacked on feat/ecf-certification-testset.

## TDD
Mode: off. Runner: `npx vitest run`, `npm run typecheck`.

## Tasks
- [x] T1 ACECF builder + DGII client sendCommercialApproval + run type (migration) + actions; tests. Commit fde4e4a. Route: delegated (writer trigger: 10+ files).
- [x] T2 Wizard step 3 UI reusing the test-set runner pattern; tests for pure helpers. Commit 5a01431. Route: delegated.

## Progress
- 2026-10-18 created; ACECF set structure captured.
- 2026-10-18 T1 and T2 done (delegated writer).

## Evidence
- npm run typecheck: clean. npx vitest run: 180 files passed, 1 skipped; 1273 tests passed, 2 skipped (RLS tests without DATABASE_URL).
- Local build of the real ACECF set (11 rows, sheet ACEECF_Generadas): 11 built, 0 errors, 11 of 11 signatures verified with a throwaway certificate; outputs only in the scratchpad, nothing copied into the repo.
- Design notes: ACECF file name = RNCComprador + eNCF + ".xml"; endpoint {ecf host}/{CerteCF|TesteCF|eCF}/aprobacionComercial/api/AprobacionComercial (multipart field xml); answer codigo 01/02 (Aprobada/Rechazada). A "rechazada" answer to an approval that itself declared Estado 2 counts as accepted. start accepts an optional runType and rejects a workbook of the other type (INVALID_TEST_SET).
- Fixed a pre-existing flaky assertion in test/ecf-certification-run.test.ts (security code regex \w+ failed when the signature started with + or /).

## Redeploy (supabase/functions/ecf-certification)
Changed: dgiiClient.ts, run.ts, store.ts. New: commercialApproval.ts. Apply migration 20261018150000_ecf_certification_run_types.sql BEFORE redeploying (store now selects/filters run_type).

## Next step
Apply the migration, redeploy the changed ecf-certification files, run step 3 against CerteCF with the real set; then steps 4+.
