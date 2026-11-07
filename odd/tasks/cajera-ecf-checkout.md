# Feature: cajera-ecf-checkout

## Objective
Enable cashier (non-admin) checkouts under `dgii_ecf` fiscal mode to successfully create e-CF records (`pending_offline`) and fiscal outbox queue entries (`pending_sync`) even when `certificateId` is null, so that the invoices reach the cloud and the fiscal worker can sign and submit them to DGII.

## Problem
In production, a tenant operating in `fiscal_mode = dgii_ecf` allows admin checkouts to resolve a certificate ID and emit e-CFs accepted by DGII. However, non-admin cashiers (`rol = 'cajera'`) cannot query `ecf_certificate_metadata` due to Row-Level Security (RLS), and offline checkouts also return `certificateId: null`.

In `src/shared/lib/fiscalEngine.ts`, `buildEcfDocumentWrites` treated a missing `certificateId` as an incomplete configuration, saving `ecf_documents.status = 'pending_configuration'` and `fiscal_outbox.status = 'blocked_configuration'`. Because the local sync worker only pushes `pending_sync`, these records were never synchronized to the cloud and never picked up by the server worker. The E31/E32 NCF sequence number was consumed, but the e-CF never reached DGII.

The backend worker is already equipped to resolve the certificate server-side when `certificate_metadata_id` is null (matching on `tenant_id` and `environment`). The client should only block when issuer configuration fields are actually missing or incomplete.

In addition, the fiscal resolution `useEffect` hooks in `MesaCloseAccountModal.tsx` and `Dashboard.tsx` invoke `resolveActiveFiscalMode(..., rol)` but lacked `rol` in their dependency arrays.

## Scope
- `odd/tasks/cajera-ecf-checkout.md`
- `src/shared/lib/fiscalEngine.ts`
- `src/features/billing/components/MesaCloseAccountModal.tsx`
- `src/features/dashboard/components/Dashboard.tsx`
- `src/shared/lib/fiscalEngine.test.ts`
- `supabase/migrations/20261106130000_issuer_select_certificate_metadata.sql`
- `test/ecf-certificate-metadata-issuer-select.test.ts`

## Constraints
- All code, comments, test names, and docs in English.
- Do NOT weaken, skip, or delete any existing test assertions.
- TDD mode: off (source: no project TDD configuration); ordinary checks apply.

## Tasks
- [x] T1 Fiscal engine: Decouple certificate presence from configuration completeness in `buildEcfDocumentWrites`, using `isEcfIssuerConfigComplete(settings)`.
- [x] T2 Role-aware effects: Add `rol` to dependency arrays of fiscal mode resolution `useEffect` hooks in `MesaCloseAccountModal.tsx` and `Dashboard.tsx`.
- [x] T3 Tests in `src/shared/lib/fiscalEngine.test.ts`: Replace the bug-encoding test with null certificate handling, add null settings test, and verify role-based certificate resolution.
- [x] T4 Least-privilege issuer SELECT policy on ecf_certificate_metadata (admin + cashier/sales roles via cyberbistro_has_tenant_role) with contract test; applied to production by the reviewer.
- [ ] T5 Map POS payment methods to DGII FormaPago/TipoPago in worker/fiscal/mapper.ts (transferencia must be 2, fiado is a credit sale) — pending product decision for `digital`.

## Acceptance Criteria
1. `buildEcfDocumentWrites` relies strictly on `isEcfIssuerConfigComplete(settings)` (with null settings treated as incomplete); `certificateId: null` does not block outbox sync (`pending_offline` and `pending_sync` are written).
2. The payload retains `certificate_metadata_id: args.certificateId` (null is permitted and resolved server-side by the worker).
3. `MesaCloseAccountModal.tsx` includes `rol` in the `useEffect` dependency array for fiscal mode resolution.
4. `Dashboard.tsx` includes `rol` in the `useEffect` dependency array for fiscal mode resolution.
5. All test suites pass without regression:
   - `npm run typecheck`
   - `npx vitest run --config vitest.config.ts src/shared/lib/fiscalEngine.test.ts`
   - `npm test`

## Checks
- `npm run typecheck`
- `npx vitest run --config vitest.config.ts src/shared/lib/fiscalEngine.test.ts`
- `npm test`

## Progress
- T1–T3 committed in 131eadb (fix(fiscal): queue cashier and offline e-CF checkouts without a client certificate). Route: delegated (agy writer, 4 files).
- T4 committed in f3bddf0 (fix(rls): let invoice issuers read e-CF certificate readiness); applied to production on 2026-11-07 as migration `issuer_select_certificate_metadata` after a drift check (only `cb_ecf_certificate_metadata_admin_select` existed).
- Next: T5 payment-method mapping, blocked on the product meaning of `digital`.

## Verification evidence
- `npm run typecheck`: passed (tsc --noEmit, no errors).
- `npm test`: 270 files passed / 1 skipped; 1978 tests passed / 2 skipped.
- Production RLS check (simulated JWT, rolled back): cajera sees the ready production certificate; cajera SELECT on `password_encrypted` → permission denied; random non-member UUID → 0 rows.
