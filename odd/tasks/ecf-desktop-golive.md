# Feature: ecf-desktop-golive

## Objective
Enable desktop POS checkouts operating in `dgii_ecf` mode to successfully push `facturas`, `ecf_documents`, and `fiscal_outbox` entries to the cloud Supabase backend so that the cloud fiscal worker can sign, submit, and track e-CF documents with DGII, without regressions, status downgrades, or duplicated outbox rows.

## Problem
In desktop checkouts with `dgii_ecf` mode:
1. `TenantStore.applyCheckoutFiscalWrite` (`electron/persistence/tenantStore.ts:231-248`) inserts rows into local SQLite tables `ecf_documents` (status `'pending_offline'`) and `fiscal_outbox` (status `'pending_sync'`), but never enqueues corresponding rows in `sync_outbox` via `insertCheckoutOutbox`. Thus, nothing reaches the cloud.
2. `SUPPORTED_OUTBOX_TABLES` (`electron/persistence/payrollSyncStore.ts:50-76`), which gates the `claim()` query, does not include `'ecf_documents'` or `'fiscal_outbox'`.
3. `electron/persistence/payrollSyncClient.ts` lacks remote table mappings and payload mappers for `ecf_documents` and `fiscal_outbox`.
4. `mapFacturaPayload` (`payrollSyncClient.ts:1058-1098`) drops `fiscal_mode`, `fiscal_status`, and `fiscal_document_id`, causing cloud invoices to default to `fiscal_mode = 'ncf_legacy'`.
5. Cloud pull (`electron/persistence/cloudApply.ts:520-535` and `tenantStore.ts:1320-1330`, `ON CONFLICT ... DO UPDATE SET fiscal_mode = excluded.fiscal_mode`) overwrites the local `'dgii_ecf'` with cloud `'ncf_legacy'`.
Consequently, the cloud fiscal worker (which only queries cloud `fiscal_outbox` with status `IN ('queued','retryable_error','processing')`) never receives or processes e-CFs from desktop checkouts.

## Scope
- Desktop push of `ecf_documents` and `fiscal_outbox` via `sync_outbox`.
- Payload mappers with cloud column whitelist and status translations (`'pending_offline'` -> `'queued'`, `'pending_sync'` -> `'queued'`).
- Dependency ordering: `facturas` -> `ecf_documents` -> `fiscal_outbox`.
- Sending `facturas` fiscal columns (`fiscal_mode`, `fiscal_status`, `fiscal_document_id`).
- Protecting local `'dgii_ecf'` facturas and local NCFs from being downgraded or nulled during cloud pull.
- Startup backfill for existing stuck local `ecf_documents` and `fiscal_outbox` rows and their facturas.
- Unit and integration tests for all above behaviors.

## Out of Scope
- Printing, UI, cloud migrations, cloud worker code.

## Constraints
- Code, comments, and documentation in English.
- Do NOT commit changes.
- Do NOT weaken, skip, or delete existing tests.
- TDD discipline: write failing tests first, observe them fail, then implement.
- Maintain existing local SQLite schema and Supabase cloud schema boundaries.
- No `document_type` or `sucursal_id` sent to cloud for `ecf_documents` or `fiscal_outbox`.
- Upsert conflict targets: `ecf_documents` on `id`; `fiscal_outbox` on `idempotency_key`.

## Tasks
- [x] T0 Cert lookup by environment (commit `41ee0e6`)
- [x] T1 Desktop push of `ecf_documents` + `fiscal_outbox`
- [x] T2 Facturas fiscal fields preservation and pull non-downgrade
- [x] T3 Backfill of already-stuck rows on store open / sync start
- [x] T4 Comprehensive tests for mappers, outbox atomicity, ordering, pull protection, and backfill idempotency

## Acceptance Criteria
1. Desktop checkouts in `dgii_ecf` mode insert `sync_outbox` rows for `ecf_documents` and `fiscal_outbox` atomically with the invoice.
2. `SUPPORTED_OUTBOX_TABLES` includes both tables so outbox claims process them.
3. Outbox push sends only whitelisted cloud columns, translating statuses (`pending_offline` -> `queued`, `pending_sync` -> `queued`), upserting `ecf_documents` on `id` and `fiscal_outbox` on `idempotency_key`.
4. Sync ordering guarantees `facturas` are pushed before `ecf_documents`, which are pushed before `fiscal_outbox`.
5. `mapFacturaPayload` sends `fiscal_mode`, `fiscal_status`, and `fiscal_document_id`.
6. Cloud pull does not downgrade a local factura with `fiscal_mode = 'dgii_ecf'` to a default or legacy mode, nor clear existing local NCFs when cloud has null/default.
7. Startup backfill safely and idempotently enqueues unpushed `ecf_documents`, `fiscal_outbox`, and re-pushes their `facturas`.
8. All unit and integration tests pass cleanly without regressions.

## Checks
- `npm run typecheck` (PASSED)
- `npx vitest run test/ src/shared/lib` (PASSED: 178 test files, 1226 passed, 2 skipped)
- `npm run test:schema` (PASSED: 3 test files, 15 passed)
- `npm run test:sql` (Docker is not running)

## Review round 1
Addressed all code review findings:
1. Prevented duplicate DGII submissions by treating cloud `ecf_documents` and `fiscal_outbox` as append-only (`ignoreDuplicates: true` in `PayrollSyncClient.push` and `pushBatch`).
2. Tracked local pushed state: when `sync_outbox` operation settles with `status = 'synced'`, transitioned local `ecf_documents` (`'pending_offline'` -> `'queued'`) and `fiscal_outbox` (`'pending_sync'` -> `'queued'`) in the same local transaction.
3. Updated backfill query in `TenantStore` to filter strictly for unpushed rows (`ecf_documents.status = 'pending_offline'`, `fiscal_outbox.status = 'pending_sync'`), ignoring rows in `'pending_configuration'` / `'blocked_configuration'` and preventing re-enqueues after settlement.
4. Backfill is now executed in exactly one place: `TenantStore.open` (as a private method on `TenantStore`), removing circular coupling and constructor side effects from `SQLitePayrollSyncStore`.
5. Moved mid-file import of `buildEcfDocumentPayloadForServer` and `buildFiscalOutboxPayloadForServer` in `localFirst.ts` to the top import block while preserving the export.
6. Reverted `vitest.config.ts` inclusion and relocated tests from `electron/persistence/__tests__/ecfDesktopGolive.test.ts` to `test/ecf-desktop-golive.test.ts`, deleting the empty directory.
7. Cleaned up `mapEcfDocumentPayload` redundant `certificate_metadata_id` branch and added tenant ID logging on backfill failure.

## Progress
| Task | Description | Status | Verification |
|------|-------------|--------|--------------|
| T0 | Cert lookup by environment | DONE | Commit 41ee0e6 |
| T1 | Desktop push of ecf_documents + fiscal_outbox | DONE | Outbox enqueue on checkout, SUPPORTED_OUTBOX_TABLES, payload mappers, onConflict id / idempotency_key with ignoreDuplicates: true |
| T2 | Facturas fiscal fields & pull non-downgrade | DONE | Sent fiscal_mode/status/docId in mapFacturaPayload, guarded pull ON CONFLICT in cloudApply and tenantStore |
| T3 | Backfill of already-stuck rows on open/sync | DONE | Private backfillUnpushedFiscalRows on TenantStore.open filtering pending_offline/pending_sync |
| T4 | Comprehensive unit/integration tests | DONE | test/ecf-desktop-golive.test.ts (12 tests) & fiscalSyncPayload.test.ts (4 tests) passing |
