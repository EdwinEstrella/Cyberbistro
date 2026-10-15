---
source_file: "electron/persistence/payrollSyncStore.ts"
type: "code"
community: "Electron Persistence Cloudapply"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Electron_Persistence_Cloudapply
---

# payrollSyncStore.ts

## Connections
- [[CloudRowApplier]] - `contains` [EXTRACTED]
- [[DurableOperation]] - `imports` [EXTRACTED]
- [[DurableOperationKind]] - `imports` [EXTRACTED]
- [[DurableOperationStatus]] - `imports` [EXTRACTED]
- [[DurableSyncStore]] - `imports` [EXTRACTED]
- [[PULL_APPLIERS]] - `contains` [EXTRACTED]
- [[PullBatch]] - `imports` [EXTRACTED]
- [[PullTableFailure]] - `contains` [EXTRACTED]
- [[SQLitePayrollSyncStore]] - `contains` [EXTRACTED]
- [[SUPPORTED_OUTBOX_TABLES]] - `contains` [EXTRACTED]
- [[SUPPORTED_TABLES_SQL]] - `contains` [EXTRACTED]
- [[SYNC_PULLABLE_LOCAL_TABLES]] - `imports` [EXTRACTED]
- [[SYNC_PULL_DELETE_ORDER]] - `imports` [EXTRACTED]
- [[SYNC_PULL_TABLES]] - `imports` [EXTRACTED]
- [[applyCloudCocinaEstadoRows()]] - `indirect_call` [INFERRED]
- [[applyCloudComandaRows()]] - `indirect_call` [INFERRED]
- [[applyCloudCompraFiscalRows()]] - `indirect_call` [INFERRED]
- [[applyCloudCompraRows()]] - `indirect_call` [INFERRED]
- [[applyCloudConsumoRows()]] - `indirect_call` [INFERRED]
- [[applyCloudCustomerRows()]] - `indirect_call` [INFERRED]
- [[applyCloudCxcPagoRows()]] - `indirect_call` [INFERRED]
- [[applyCloudCxpPagoRows()]] - `indirect_call` [INFERRED]
- [[applyCloudDeletes()]] - `imports` [EXTRACTED]
- [[applyCloudExpenseCategoryRows()]] - `indirect_call` [INFERRED]
- [[applyCloudExpenseRows()]] - `indirect_call` [INFERRED]
- [[applyCloudFacturaRows()]] - `indirect_call` [INFERRED]
- [[applyCloudInventoryProductRows()]] - `indirect_call` [INFERRED]
- [[applyCloudMenuCategoryRows()]] - `indirect_call` [INFERRED]
- [[applyCloudMesasEstadoRows()]] - `indirect_call` [INFERRED]
- [[applyCloudOperationalCycleRows()]] - `indirect_call` [INFERRED]
- [[applyCloudPayableRows()]] - `indirect_call` [INFERRED]
- [[applyCloudPayrollAdjustments()]] - `indirect_call` [INFERRED]
- [[applyCloudPayrollEmployees()]] - `indirect_call` [INFERRED]
- [[applyCloudPayrollPayments()]] - `indirect_call` [INFERRED]
- [[applyCloudPlatoRows()]] - `indirect_call` [INFERRED]
- [[applyCloudReceivableRows()]] - `indirect_call` [INFERRED]
- [[applyCloudRecipeRows()]] - `indirect_call` [INFERRED]
- [[canonical()]] - `contains` [EXTRACTED]
- [[catalog-numeric-id-pull.test.ts]] - `imports_from` [EXTRACTED]
- [[cloudApply.ts]] - `imports_from` [EXTRACTED]
- [[hashCanonical()]] - `contains` [EXTRACTED]
- [[isClaimablePayrollRow()]] - `contains` [EXTRACTED]
- [[local-sqlite-catalog-write.test.ts]] - `imports_from` [EXTRACTED]
- [[local-sqlite-cierres-pull.test.ts]] - `imports_from` [EXTRACTED]
- [[local-sqlite-compras-pull.test.ts]] - `imports_from` [EXTRACTED]
- [[local-sqlite-compras-sync.test.ts]] - `imports_from` [EXTRACTED]
- [[local-sqlite-customers.test.ts]] - `imports_from` [EXTRACTED]
- [[local-sqlite-expenses.test.ts]] - `imports_from` [EXTRACTED]
- [[local-sqlite-invoice-header-edit.test.ts]] - `imports_from` [EXTRACTED]
- [[local-sqlite-payroll-sync.test.ts]] - `imports_from` [EXTRACTED]
- [[normalizeStoredResult()]] - `contains` [EXTRACTED]
- [[payroll-sync-pull.test.ts]] - `imports_from` [EXTRACTED]
- [[payrollCloudApply.ts]] - `imports_from` [EXTRACTED]
- [[payrollSyncClient.test.ts]] - `imports_from` [EXTRACTED]
- [[payrollSyncOrchestrator.ts]] - `imports_from` [EXTRACTED]
- [[ref_node_crypto]] - `imports_from` [EXTRACTED]
- [[ref_node_sqlite]] - `imports_from` [EXTRACTED]
- [[safeParseJson()]] - `contains` [EXTRACTED]
- [[sync-batch-upsert.test.ts]] - `imports_from` [EXTRACTED]
- [[sync-branch-sentinel.test.ts]] - `imports_from` [EXTRACTED]
- [[sync-pull-table-isolation.test.ts]] - `imports_from` [EXTRACTED]
- [[syncPullRegistry.ts]] - `imports_from` [EXTRACTED]
- [[syncWorker.ts]] - `imports_from` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/Electron_Persistence_Cloudapply