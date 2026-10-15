# Electron Persistence Syncworker

> 125 nodes

## Key Concepts

- **initializeTenantSchema()** (38 connections) — `electron/persistence/schema.ts`
- **schema.ts** (37 connections) — `electron/persistence/schema.ts`
- **SQLitePayrollSyncStore** (34 connections) — `electron/persistence/payrollSyncStore.ts`
- **ref_node_sqlite** (32 connections)
- **PayrollSyncClient** (30 connections) — `electron/persistence/payrollSyncClient.ts`
- **syncWorker.ts** (28 connections) — `electron/persistence/syncWorker.ts`
- **sync-branch-sentinel.test.ts** (22 connections) — `test/sync-branch-sentinel.test.ts`
- **DurableSyncWorker** (21 connections) — `electron/persistence/syncWorker.ts`
- **ref_node_crypto** (21 connections)
- **payrollSyncClient.test.ts** (19 connections) — `test/payrollSyncClient.test.ts`
- **payroll-sync-pull.test.ts** (17 connections) — `test/payroll-sync-pull.test.ts`
- **local-sqlite-compras-sync.test.ts** (15 connections) — `test/local-sqlite-compras-sync.test.ts`
- **local-sqlite-invoice-header-edit.test.ts** (15 connections) — `test/local-sqlite-invoice-header-edit.test.ts`
- **local-sqlite-receivables-payables.test.ts** (14 connections) — `test/local-sqlite-receivables-payables.test.ts`
- **sync-batch-upsert.test.ts** (14 connections) — `test/sync-batch-upsert.test.ts`
- **catalog-numeric-id-pull.test.ts** (13 connections) — `test/catalog-numeric-id-pull.test.ts`
- **local-sqlite-cierres-pull.test.ts** (13 connections) — `test/local-sqlite-cierres-pull.test.ts`
- **local-sqlite-compras-pull.test.ts** (13 connections) — `test/local-sqlite-compras-pull.test.ts`
- **payrollSyncOrchestrator.ts** (12 connections) — `electron/persistence/payrollSyncOrchestrator.ts`
- **receivablesRepository.ts** (12 connections) — `electron/persistence/receivablesRepository.ts`
- **PayrollSyncOrchestrator** (11 connections) — `electron/persistence/payrollSyncOrchestrator.ts`
- **getTableColumns()** (11 connections) — `electron/persistence/schema.ts`
- **local-sqlite-payroll-sync.test.ts** (11 connections) — `test/local-sqlite-payroll-sync.test.ts`
- **ServerSyncClient** (10 connections) — `electron/persistence/syncWorker.ts`
- **local-sqlite-payroll.test.ts** (10 connections) — `test/local-sqlite-payroll.test.ts`
- *... and 100 more nodes in this community*

## Relationships

- [Test Compras-crud](Test_Compras-crud.md) (33 shared connections)
- [Electron Persistence Cloudapply](Electron_Persistence_Cloudapply.md) (29 shared connections)
- [Electron Persistence Payrollsyncclient](Electron_Persistence_Payrollsyncclient.md) (27 shared connections)
- [Shared Types Electrond](Shared_Types_Electrond.md) (23 shared connections)
- [Electron Persistence Ipc](Electron_Persistence_Ipc.md) (18 shared connections)
- [Electron Persistence Importer](Electron_Persistence_Importer.md) (13 shared connections)
- [Electron Persistence Tenantstore](Electron_Persistence_Tenantstore.md) (7 shared connections)
- [Shared Lib Payrollcontracts](Shared_Lib_Payrollcontracts.md) (5 shared connections)
- [Test Schema-v12129](Test_Schema-v12129.md) (4 shared connections)
- [Fiscal Certificatecustody](Fiscal_Certificatecustody.md) (3 shared connections)
- [Electron Persistence Payrollrepository](Electron_Persistence_Payrollrepository.md) (3 shared connections)
- [Gastos](Gastos.md) (2 shared connections)

## Source Files

- `electron/persistence/fiscalSequenceRepository.ts`
- `electron/persistence/payablesRepository.ts`
- `electron/persistence/payrollSyncClient.ts`
- `electron/persistence/payrollSyncOrchestrator.ts`
- `electron/persistence/payrollSyncStore.ts`
- `electron/persistence/receivablesRepository.ts`
- `electron/persistence/schema.ts`
- `electron/persistence/syncWorker.ts`
- `test/catalog-numeric-id-pull.test.ts`
- `test/durable-sync-worker.test.ts`
- `test/local-sqlite-cash-purchases-schema.test.ts`
- `test/local-sqlite-cierres-pull.test.ts`
- `test/local-sqlite-compras-pull.test.ts`
- `test/local-sqlite-compras-sync.test.ts`
- `test/local-sqlite-extended-schema.test.ts`
- `test/local-sqlite-fiscal-sequence.test.ts`
- `test/local-sqlite-invoice-header-edit.test.ts`
- `test/local-sqlite-payroll-sync.test.ts`
- `test/local-sqlite-payroll.test.ts`
- `test/local-sqlite-receivables-payables.test.ts`

## Audit Trail

- EXTRACTED: 448 (95%)
- INFERRED: 22 (5%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*