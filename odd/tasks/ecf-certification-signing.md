# ecf-certification-signing

## Objective
Phase 1 of making the DGII certification flow real: sign DGII-generated XML documents (postulacion, later the
declaracion jurada) with the tenant's cloud-custodied certificate, expose it in the activation wizard, and persist
certification progress.

## Problem
ActivationPanel certification steps are design mocks (src/features/fiscal/components/ActivationPanel.tsx L700-960);
step 1 has no way to sign the postulacion, step 13 has a disabled "sign XML" picker, and `certificationStep` is
`useState` (lost on reload). DGII portal step 1 requires uploading the postulacion XML signed by the representative.

## Why
Salpimentao (RNC 133488485) is blocked at DGII portal step 1. Built once for every tenant.

## Scope
In: edge function `ecf-sign-document` (auth, tenant admin, allow-listed DGII roots, limits, custody, XMLDSig via
dgii-ecf Signature.signXml), UI sign+download in steps 1 and 13, migration for certification progress + signing audit,
tests. Out: test-set Excel, outbound DGII sending (phase 2), ACECF/simulation (phase 3), deployment (user-approved later).

## Constraints
- Never log or return .p12 bytes, passphrases or ECF_ENCRYPTION_KEY.
- Must not become a generic signing oracle: admin of the tenant only, allow-listed root elements, size cap,
  DOCTYPE/ENTITY rejected, RNC in the document must match the tenant.
- Migrations as files only; prod apply and Dokploy deploy require user confirmation.
- Do not commit pre-existing unrelated dirty files (electron/*, localFirst.ts legacy-import removal, etc.).
- English artifacts; UI copy in the screen's Spanish.

## Route
Delegated direct (writer trigger: 2+ non-trivial files). Based on feat/ecf-signer-identity (ActivationPanel overlap).

## TDD
Mode: off (no project TDD config). Runner: `npx vitest run`, `npm run typecheck`.

## Tasks
- [x] T1 Edge function `supabase/functions/ecf-sign-document` + pure handler tests. (0babeea, route: delegated; 15 tests)
- [x] T2 ActivationPanel steps 1 and 13: select XML -> sign -> download signed file; tests for pure helpers. (0a0a168, route: delegated; 8 tests)
- [x] T3 Migration `ecf_certification_progress` + `ecf_signed_documents` audit; wizard persists/restores step; tests. (5639c89, route: delegated; migration NOT applied)

## Progress
- 2026-10-18 created after read-only map (Engram discovery/ecf-certification-flow-map).

- 2026-10-18 T1-T3 done. Evidence: `npm run typecheck` clean; `npx vitest run` 171 files passed, 1 skipped (RLS, no DATABASE_URL), 1137 tests passed, 2 skipped.
- Open: exact DGII root name of the declaracion jurada (assumed `DeclaracionJurada`, constant in document.ts); postulacion root `Postulacion` and RNC tag `RNCContribuyente` taken from the library sample.

- 2026-10-18 PROD: migration ecf_certification_progress applied (user authorized). Verified: both tables RLS on, no anon
  grants; progress = authenticated SELECT/INSERT/UPDATE gated by 3 policies; signed_documents = column SELECT only for
  admins. Edge function NOT deployed yet (user asked to hold; files exported with hashes for later Dokploy mounts).

## Next step
User-approved: apply migration 20261018130000, deploy ecf-sign-document as Dokploy file mounts (custody.ts, document.ts, handler.ts, signer.ts, store.ts, index.ts), then test with a real DGII postulacion XML.
