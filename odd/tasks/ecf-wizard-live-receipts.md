# ecf-wizard-live-receipts

## Objective
Make DGII certification steps 8–11 of the Activation wizard show what the tenant's receptor really received and let
the tenant advance on that evidence, so every tenant can complete the wizard without manual database fixes.

## Problem / why
- Steps 8–11 in `src/features/fiscal/components/ActivationPanel.tsx` are unfinished mockups: a hard-coded
  "Certificado Raíz CA — No encontrado" warning, a fixed "Ninguno aún" list, an "Actualizar" button that only shows
  "Simulación de actualización…", and the advance button permanently disabled on step 8 (line ~947).
- Step 9 is mislabeled "RFCE (E32) Recibidas"; on the DGII portal step 9 is "Recepción e-CF".
- 2026-10-20: Salpimentao passed DGII steps 8–11 (4 e-CF tipo 31 accepted, 11 ACECF received) but the wizard stayed
  stuck on step 8; progress was moved to step 12 by hand in `ecf_certification_progress` (user approved).

## Facts
- DGII portal mapping: 8 Inicio Prueba Recepción e-CF, 9 Recepción e-CF, 10 Inicio Prueba Aprobación Comercial,
  11 Recepción Aprobación Comercial.
- Data: `ecf_received_documents` (authenticated may SELECT id, tenant_id, emisor_rnc, comprador_rnc, encf, tipo_ecf,
  estado, motivo_no_recibido, received_at, signer_rnc_mismatch) and `ecf_received_approvals` (id, tenant_id,
  emisor_rnc, comprador_rnc, encf, estado, detalle_motivo_rechazo, received_at, signer_rnc_mismatch). RLS: active
  tenant_users only. estado 0 = received, 1 = not received (documents); approvals estado 1 = aprobado, 2 = rechazado.
- The CA warning is obsolete: the receptor trusts the pinned DGII certification signer (commit 162636d).
- Progress persistence: `ecf_certification_progress` via `src/features/fiscal/lib/ecfCertificationProgress.ts`.

## Scope
In: pure evidence helpers + loader; a received-evidence panel for steps 8–11 (real list, refresh, light polling while
the step is open); remove the fake CA warning; fix the step 9 label; advance button enabled when the step's evidence
exists; tests.
Out: steps 7/12 "Guardar configuración" placeholders, step 13 signer, production activation, edge/DB changes.

## Constraints
English code / Spanish UI copy matching the panel. No schema changes. Do not commit unrelated dirty files.
No AI attribution in commits.

## Route
Delegated direct (writer trigger: new lib + component + ActivationPanel edits, 2+ non-trivial files).

## TDD
Mode: off (project convention). Runner: `npx vitest run`, `npm run typecheck`.

## Delivery
Strategy ask-on-risk; forecast ~300 authored lines. Branch feat/ecf-wizard-live-receipts (stacked on
feat/ecf-legal-name-80mm @ 162636d). Ships to tenants with the next desktop release.

## Tasks
- [x] T1 Evidence lib: pure summarizer + step rules (8/9 need >= 1 received e-CF with estado 0; 10/11 need >= 1
      ACECF) + Supabase loader; unit tests.
- [x] T2 Wizard: received-evidence panel on steps 8–11, remove CA mockup, step 9 label, advance gated on evidence;
      component/unit tests; typecheck + vitest.

## Acceptance
- A tenant with received e-CF sees them listed (eNCF, emisor, tipo, estado, fecha) on steps 8/9 and can advance.
- A tenant with ACECF sees them on steps 10/11 and can advance.
- No evidence → clear "aún no llegó nada" state, advance disabled, refresh works.

## Progress
- 2026-10-20: document created; branch created.
- 2026-10-20: T1 done (lib/ecfReceivedEvidence.ts + test). npx vitest run src/features/fiscal: 10 files / 98 tests passed.
- 2026-10-20: T2 done (components/ReceivedEvidencePanel.tsx + test; ActivationPanel steps 8-11 live evidence, 10 s polling, gated advance, fake CA block removed). npm run typecheck: clean. Route: delegated direct (writer).

## Next step
Parent commits T1+T2; then review/deliver.
