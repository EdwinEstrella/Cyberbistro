# Electron Persistence Importer

> 49 nodes

## Key Concepts

- **.open()** (22 connections) — `electron/persistence/tenantStore.ts`
- **importer.ts** (19 connections) — `electron/persistence/importer.ts`
- **TenantSQLiteImporter** (13 connections) — `electron/persistence/importer.ts`
- **TenantStoreController** (13 connections) — `electron/persistence/tenantStore.ts`
- **.activate()** (11 connections) — `electron/persistence/tenantStore.ts`
- **.import()** (9 connections) — `electron/persistence/importer.ts`
- **.close()** (8 connections) — `electron/persistence/tenantStore.ts`
- **ExpenseRepository** (7 connections) — `electron/persistence/expenseRepository.ts`
- **.getTenantId()** (7 connections) — `electron/persistence/tenantStore.ts`
- **.importLegacySnapshot()** (7 connections) — `electron/persistence/tenantStore.ts`
- **stringify()** (6 connections) — `electron/persistence/importer.ts`
- **.retryFailedOutboxOperations()** (6 connections) — `electron/persistence/tenantStore.ts`
- **buildLegacyImportManifest()** (5 connections) — `electron/persistence/importer.ts`
- **.activateTemporaryDatabase()** (5 connections) — `electron/persistence/importer.ts`
- **validateChunks()** (5 connections) — `electron/persistence/importer.ts`
- **.close()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.getSyncDiagnosticReport()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.listRowVersions()** (5 connections) — `electron/persistence/tenantStore.ts`
- **ExpenseRepositoryStore** (4 connections) — `electron/persistence/expenseRepository.ts`
- **hashValue()** (4 connections) — `electron/persistence/importer.ts`
- **LegacyImportChunk** (4 connections) — `electron/persistence/importer.ts`
- **.getActiveDatabasePath()** (4 connections) — `electron/persistence/importer.ts`
- **.getRollbackDatabasePath()** (4 connections) — `electron/persistence/importer.ts`
- **.recoverInterruptedActivation()** (4 connections) — `electron/persistence/importer.ts`
- **withStore()** (4 connections) — `test/local-sqlite-catalog-write.test.ts`
- *... and 24 more nodes in this community*

## Relationships

- [Test Compras-crud](Test_Compras-crud.md) (16 shared connections)
- [Electron Persistence Syncworker](Electron_Persistence_Syncworker.md) (13 shared connections)
- [Electron Persistence Ipc](Electron_Persistence_Ipc.md) (8 shared connections)
- [Shared Types Electrond](Shared_Types_Electrond.md) (8 shared connections)
- [Electron Persistence Tenantstore](Electron_Persistence_Tenantstore.md) (7 shared connections)
- [Electron Persistence Salesfiscalrepository](Electron_Persistence_Salesfiscalrepository.md) (2 shared connections)
- [Electron Persistence Cloudapply](Electron_Persistence_Cloudapply.md) (2 shared connections)
- [Electron Persistence Catalogrepository](Electron_Persistence_Catalogrepository.md) (2 shared connections)
- [Electron Persistence Ordersrepository](Electron_Persistence_Ordersrepository.md) (2 shared connections)

## Source Files

- `electron/persistence/expenseRepository.ts`
- `electron/persistence/importer.ts`
- `electron/persistence/tenantStore.ts`
- `test/local-sqlite-analytics-parity.test.ts`
- `test/local-sqlite-catalog-pull.test.ts`
- `test/local-sqlite-catalog-write.test.ts`
- `test/local-sqlite-cierres-list.test.ts`
- `test/local-sqlite-expenses.test.ts`
- `test/local-sqlite-facturas-pull.test.ts`
- `test/local-sqlite-sync-report.test.ts`
- `test/sync-pull-table-isolation.test.ts`

## Audit Trail

- EXTRACTED: 132 (89%)
- INFERRED: 17 (11%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*