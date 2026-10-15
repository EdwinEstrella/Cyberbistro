---
type: community
members: 65
---

# Shared Lib Localfirst

**Members:** 65 nodes

## Members
- [[COMPOSITE_UPSERT_CONFLICT_TABLES]] - code - src/shared/lib/localFirst.ts
- [[ConflictResolution]] - code - src/shared/lib/localFirst.ts
- [[ConflictResult]] - code - src/shared/lib/localFirst.ts
- [[IncrementalCursor]] - code - src/shared/lib/localFirst.ts
- [[LOCAL_FIRST_PHASES]] - code - src/shared/lib/localFirst.ts
- [[LegacyIndexedDbImportPayload]] - code - src/shared/lib/localFirst.ts
- [[LocalDeviceSession]] - code - src/shared/lib/localFirst.ts
- [[LocalFirstMetadataTable]] - code - src/shared/lib/localFirst.ts
- [[LocalFirstPhase]] - code - src/shared/lib/localFirst.ts
- [[LocalFiscalOutboxEntry]] - code - src/shared/lib/localFirst.ts
- [[OPTIONAL_BACKEND_TABLES]] - code - src/shared/lib/localFirst.ts
- [[OutboxConflictGuardrail]] - code - src/shared/lib/localFirst.ts
- [[OutboxConflictGuardrailAction]] - code - src/shared/lib/localFirst.ts
- [[PURCHASE_OUTBOX_TABLES]] - code - src/shared/lib/localFirst.ts
- [[PayloadAdjustmentResult]] - code - src/shared/lib/localFirst.ts
- [[PurchaseOutboxInsertFailureDisposition]] - code - src/shared/lib/localFirst.ts
- [[PurchaseOutboxInsertFailureResolution]] - code - src/shared/lib/localFirst.ts
- [[SAFE_TENANT_KEYS]] - code - src/shared/lib/localFirst.ts
- [[SyncErrorRow]] - code - src/shared/lib/localFirst.ts
- [[SyncRetryStatus]] - code - src/shared/lib/localFirst.ts
- [[SyncStateRow]] - code - src/shared/lib/localFirst.ts
- [[adjustCierrePayloadForServer()]] - code - src/shared/lib/localFirst.ts
- [[adjustFacturaPayloadForServer()]] - code - src/shared/lib/localFirst.ts
- [[applyLocalFirstDbSchema()]] - code - src/shared/lib/localFirst.ts
- [[buildCierrePayloadWithCycleNumber()]] - code - src/shared/lib/localFirst.ts
- [[buildLegacyIndexedDbManifest()]] - code - src/shared/lib/localFirst.ts
- [[buildMirrorStoreResetSyncStateKeys()]] - code - src/shared/lib/localFirst.ts
- [[checkServerRowExists()]] - code - src/shared/lib/localFirst.ts
- [[compareOutboxEntriesByCreatedAtThenId()]] - code - src/shared/lib/localFirst.ts
- [[deleteOne()]] - code - src/shared/lib/localFirst.ts
- [[extractNcfSequence()]] - code - src/shared/lib/localFirst.ts
- [[findExistingPurchaseOutboxRecord()]] - code - src/shared/lib/localFirst.ts
- [[getAllFromStore()]] - code - src/shared/lib/localFirst.ts
- [[getCompraDependencyId()]] - code - src/shared/lib/localFirst.ts
- [[getFacturaDependencyId()]] - code - src/shared/lib/localFirst.ts
- [[getNextAvailableCierreCycleNumber()]] - code - src/shared/lib/localFirst.ts
- [[getOneFromStore()]] - code - src/shared/lib/localFirst.ts
- [[getPendingOutboxEntries()]] - code - src/shared/lib/localFirst.ts
- [[getTenantReadFilter()]] - code - src/shared/lib/localFirst.ts
- [[hasPendingLocalWrites()]] - code - src/shared/lib/localFirst.ts
- [[hydrateCompraDependencies()]] - code - src/shared/lib/localFirst.ts
- [[indexedDbRecoveryAttempted]] - code - src/shared/lib/localFirst.ts
- [[indexedDbRecoveryInFlight]] - code - src/shared/lib/localFirst.ts
- [[isNcfAvailableForFactura()]] - code - src/shared/lib/localFirst.ts
- [[isOutboxDependencyConfirmed()]] - code - src/shared/lib/localFirst.ts
- [[isOutboxEntryProcessable()]] - code - src/shared/lib/localFirst.ts
- [[isRowAfterCursor()]] - code - src/shared/lib/localFirst.ts
- [[lastFullReconciliation]] - code - src/shared/lib/localFirst.ts
- [[legacyCanonical()]] - code - src/shared/lib/localFirst.ts
- [[localFirst.ts]] - code - src/shared/lib/localFirst.ts
- [[mirrorSyncInFlight]] - code - src/shared/lib/localFirst.ts
- [[normalizeObjectStoreKeyPath()]] - code - src/shared/lib/localFirst.ts
- [[pullFullTableRows()]] - code - src/shared/lib/localFirst.ts
- [[pullIncrementalChanges()]] - code - src/shared/lib/localFirst.ts
- [[pullTablePage()]] - code - src/shared/lib/localFirst.ts
- [[pushOutboxLocks]] - code - src/shared/lib/localFirst.ts
- [[resolveCompraDependencyId()]] - code - src/shared/lib/localFirst.ts
- [[resolveMirrorStoreKeyPath()]] - code - src/shared/lib/localFirst.ts
- [[runTrackedCloudOperation()]] - code - src/shared/lib/localFirst.ts
- [[selectProcessableOutboxEntries()]] - code - src/shared/lib/localFirst.ts
- [[sha256()]] - code - src/shared/lib/localFirst.ts
- [[tablesWithoutUpdateCursor]] - code - src/shared/lib/localFirst.ts
- [[tryAcquireOutboxEntryLease()]] - code - src/shared/lib/localFirst.ts
- [[validateCierreCicleSequence()]] - code - src/shared/lib/localFirst.ts
- [[validateNcfSequence()]] - code - src/shared/lib/localFirst.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Shared_Lib_Localfirst
SORT file.name ASC
```

## Connections to other communities
- 48 edges to [[_COMMUNITY_Shared Lib Localfirst (localFirst)]]
- 30 edges to [[_COMMUNITY_Shared Lib Cloudavailability]]
- 24 edges to [[_COMMUNITY_Shared Lib Localfirst C75]]
- 19 edges to [[_COMMUNITY_Shared Lib Localfirst C94]]
- 14 edges to [[_COMMUNITY_Dashboard]]
- 13 edges to [[_COMMUNITY_Gastos]]
- 12 edges to [[_COMMUNITY_Shared Lib Lanedgeclient]]
- 8 edges to [[_COMMUNITY_Shared Hooks Useauth]]
- 8 edges to [[_COMMUNITY_Shared Lib Ncf]]
- 6 edges to [[_COMMUNITY_Cuentas-pagar Cuentaspagar]]
- 6 edges to [[_COMMUNITY_Compras]]
- 3 edges to [[_COMMUNITY_Cuentas-cobrar Cuentascobrar]]
- 3 edges to [[_COMMUNITY_Camarera]]
- 3 edges to [[_COMMUNITY_Fiscal Fiscalpanel]]
- 2 edges to [[_COMMUNITY_Components Applayout]]
- 2 edges to [[_COMMUNITY_Context Sucursalcontext]]
- 2 edges to [[_COMMUNITY_Shared Lib Ordersuiadapter]]
- 2 edges to [[_COMMUNITY_Inventario]]
- 2 edges to [[_COMMUNITY_Soporte]]
- 1 edge to [[_COMMUNITY_Context Sucursalcontext (SucursalContext)]]
- 1 edge to [[_COMMUNITY_Ajustes]]
- 1 edge to [[_COMMUNITY_Shared Lib Rememberloginstorage]]
- 1 edge to [[_COMMUNITY_Billing]]
- 1 edge to [[_COMMUNITY_Cierre]]
- 1 edge to [[_COMMUNITY_Clientes Customers]]
- 1 edge to [[_COMMUNITY_Shared Lib Printervalidationcache]]
- 1 edge to [[_COMMUNITY_Fiscal Activationpanel]]
- 1 edge to [[_COMMUNITY_Gastos Expenseslocal]]
- 1 edge to [[_COMMUNITY_Historial Historialsync]]
- 1 edge to [[_COMMUNITY_Nomina]]
- 1 edge to [[_COMMUNITY_Shared Lib Currency]]
- 1 edge to [[_COMMUNITY_Shared Types Electrond]]
- 1 edge to [[_COMMUNITY_Shared Lib Lastknowncache]]
- 1 edge to [[_COMMUNITY_Test Fiscal-offline-reconnect]]

## Top bridge nodes
- [[localFirst.ts]] - degree 253, connects to 34 communities
- [[runTrackedCloudOperation()]] - degree 16, connects to 3 communities
- [[adjustFacturaPayloadForServer()]] - degree 6, connects to 3 communities
- [[getTenantReadFilter()]] - degree 5, connects to 2 communities
- [[buildMirrorStoreResetSyncStateKeys()]] - degree 4, connects to 2 communities