# ecf-legal-name-80mm

## Objective
Pass DGII portal step 5 after the 2026-10-19 rejection: "La Razón Social de la empresa debe estar en la RI y en la
consulta timbre al escanear el QR." Printed representations must be 80 mm continuous roll with no overlapping text.

## Problem / why
- Step-4 simulation XMLs copied the DGII workbook Emisor cells verbatim: RazonSocialEmisor / NombreComercial =
  "DOCUMENTOS ELECTRONICOS DE 02" (RFCE: "DOCUMENTOS ELECTRONICOS PRUEBA FACTURA DE CONSUMO MENOR 250MIL").
- Consulta timbre shows the razón social from the XML DGII received (verified: E310000000011 shows the placeholder),
  so fixing only the PDF is not enough: the simulation must be re-sent with the legal name.
- A4 RI for 32<250k had the long razón social overlapping the document title.

## Facts
- Tenant Salpimentao ff1eccd5-8d41-483a-9d51-ca65fa8af21a. `tenants.nombre_negocio` is the "Razón social" field
  (src/shared/lib/ecfIssuerRequirements.ts:27); set to "SALPIMENTAO RESTAURANT CAFE & GRILL SRL" on 2026-10-19 with
  user approval (was "Salpimentao Restaurant MAO"). `ecf_issuer_sucursal` still holds the same legal name (misfiled;
  left unchanged).
- builder.ts runs only in the edge function; re-running a simulation allocates new e-NCFs above issued ones
  (simulation.ts allocateSequences) and creates a new run. Step 5 picks from the latest simulation run.
- Edge deploy is manual (Dokploy file mounts + restart functions-1).

## Scope
In: simulation emisor override (RazonSocialEmisor + NombreComercial when present) from tenants.nombre_negocio; 80 mm
roll RI PDF with wrapped, non-overlapping text; tests.
Out: production mapper changes, POS receipt templates, schema changes.

## Constraints
DGII §18: QR bottom-left, >= 22x22 mm, starts >= 2 cm from sheet edge, 3 mm quiet margin; "Código de Seguridad" +
"Fecha de Firma Digital" under the QR. No DGII calls from tests. Do not commit pre-existing unrelated dirty files.
English artifacts / Spanish UI. No AI attribution in commits.

## Route
Delegated direct (writer trigger: edge + PDF, 2+ non-trivial files; mapping done by explorer).

## TDD
Mode: off (project convention). Runner: `npx vitest run`, `npm run typecheck`.

## Delivery
Strategy ask-on-risk; forecast ~250 authored lines (under budget, single PR).

## Tasks
- [x] T1 Simulation emisor override from tenant legal name (simulation.ts/run.ts/store.ts) + tests. Commit a9f3a8b
  (delegated writer). 422 LEGAL_NAME_MISSING when nombre_negocio empty.
- [x] T2 80 mm roll RI PDF (dynamic height, wrapped text, QR rules) + overlap test. Commit c6aadc6 (delegated
  writer); pure layoutReceipt in ecfReceiptLayout.ts, QR 25 mm at x=23, >=23 mm below.
- [x] T3 Deploy edge (user, Dokploy), re-run step 4 simulation, verify consulta timbre shows legal name.
  First re-run (portal at step 5) rejected by DGII: "No se encuentra en una fase válida dentro del proceso de
  certificación." User returned portal to step 4, re-ran: run 01ff29cd-6d0f-474a-b046-26d2b5ef419e, 29/29 accepted,
  RazonSocialEmisor = legal name. Consulta timbre E310000000023 and FC E320000000035 show the legal name.
- [x] T4 Generate 11 RI, overlap check, user uploads to portal step 5. Uploaded 2026-10-19 ~21:16 local, 80 mm,
  1 page each, legal name present, all 11 QR decode. Span check only flags font-bbox touches (~1.5 pt, not visible).

## Acceptance
- New simulation signed XMLs carry RazonSocialEmisor = tenant legal name; consulta timbre shows it.
- 11 RI PDFs are 80 mm wide, pass automated span-overlap check, QR decodes to correct URL.

## Progress
- 2026-10-19 branch feat/ecf-legal-name-80mm created; tenant name data fix applied.
- 2026-10-19 T1+T2 done. Verified by parent: `npx vitest run test/ecf-certification-simulation.test.ts
  test/ecf-certification-run.test.ts src/features/fiscal` -> 142 passed; writer: `npm run typecheck` -> pass.
  XML escaping checked: single `&amp;`. RDD off (not run).
- 2026-10-19 Dokploy mounts updated (agent pasted via UI, user approved saves); deployed SHA-256 prefixes match branch:
  simulation 14e57a9f, run 70ce90f0, context dcc074f8, store 899d13de. User restarted functions-1.
- 2026-10-19 Step 4 re-passed, step 5 RIs uploaded; waiting for DGII step 6 review.
- Follow-ups: TestSetRunner does not show edge 422 errors in UI; step-5 picker uses the latest simulation run even
  if it was rejected; ecf_issuer_sucursal still holds the legal name (misfiled); branch not pushed/merged.
