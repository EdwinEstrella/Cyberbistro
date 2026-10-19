# ecf-signer-identity

## Objective
Accept Dominican e-CF signer certificates issued to a natural person (the company representative), instead of
rejecting them as "otro RNC", and let the tenant record the representative's cedula so the app can confirm it.

## Problem
`isRncMismatch` (src/features/ajustes/lib/ecfCertificateHealth.ts) treats every 9/11-digit number in the certificate
subject as an RNC. Viafirma "QUALIFIED CERTIFICATE FOR NATURAL PERSON - TAX PROCEDURES" carries only the person's
cedula (`IDCDO-12100129126`), so Salpimentao (RNC 133488485) got RNC_MISMATCH. The same health check gates
activation (src/shared/lib/ecfActivationReadiness.ts:79). Subject labels also render as `undefined=` for OIDs
without a short name (surname, givenName, serialNumber).

## Why
DGII e-CF: invoice data always carries the company RNC (`RNCEmisor`); the signer certificate is the representative's
personal certificate, linked to the RNC by DGII (portal shows representative cedula 12100129126). Invoices do not change.

## Scope
In: certificate health classification (company vs person identifiers), representative cedula field on tenants
(migration + Datos de la empresa form + local-first allow-list), friendly subject labels in validate-ecf-certificate, tests.
Out: invoices/XML mapping, DGII certification flow steps (separate feature).

## Constraints
- Do not commit unrelated dirty hunks in src/shared/lib/localFirst.ts and the other pre-existing dirty files.
- Generated artifacts in English; UI copy in neutral Spanish like the existing screens.
- Migration file only; prod apply needs explicit user confirmation.

## Route
Delegated direct (writer trigger: 2+ non-trivial files).

## TDD
Mode: off (no project TDD config). Runner: `npx vitest run`, `npm run typecheck`. User norm: typecheck + vitest after every change.

## Tasks
- [x] T1 Health: classify subject identifiers; company-ID mismatch stays an error; person cert accepted
      (confirmed when it matches the stored representative cedula, warning when it differs); tests. Commit ff1feb7. Route: delegated. Evidence: ecfCertificateHealth + readiness tests green.
- [x] T2 Representative cedula: migration `tenants.ecf_representative_id`, form field + load/save, allow-list; tests. Commit a1353a9. Route: delegated. Migration file only, NOT applied (needs user OK).
- [x] T3 validate-ecf-certificate: friendly OID labels in subject/issuer; tests where testable. Commit 04975ca. Route: delegated. Labels come from dgii-ecf (forge), so the function re-reads the cert via node-forge and formats with a pure helper (distinguishedName.ts); falls back to library strings. Function NOT deployed.

## Progress
- 2026-10-18 created from user report (Salpimentao certificate flagged as other RNC).

- 2026-10-18 T1–T3 implemented and committed; typecheck + full vitest green.

## Next step
Apply migration 20261018120000 and deploy validate-ecf-certificate only with user confirmation; re-upload cert to refresh stored subject labels.
