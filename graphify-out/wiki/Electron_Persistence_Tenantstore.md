# Electron Persistence Tenantstore

> 71 nodes

## Key Concepts

- **TenantStore** (113 connections) — `electron/persistence/tenantStore.ts`
- **.beginImmediateTransaction()** (23 connections) — `electron/persistence/tenantStore.ts`
- **.commitTransaction()** (23 connections) — `electron/persistence/tenantStore.ts`
- **.rollbackTransaction()** (23 connections) — `electron/persistence/tenantStore.ts`
- **.commitCheckout()** (14 connections) — `electron/persistence/tenantStore.ts`
- **.executeCatalogCommand()** (8 connections) — `electron/persistence/tenantStore.ts`
- **DesktopCheckoutWrite** (8 connections) — `src/shared/lib/checkoutContracts.ts`
- **.executeReceivablesCommand()** (7 connections) — `electron/persistence/tenantStore.ts`
- **.saveConsumo()** (6 connections) — `electron/persistence/tenantStore.ts`
- **.saveInvoice()** (6 connections) — `electron/persistence/tenantStore.ts`
- **.applyCheckoutComanda()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.applyCheckoutConsumo()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.deleteComanda()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.deleteConsumo()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.executeCashPurchaseCommand()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.executeCustomerCommand()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.executeDesktopCommand()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.executeExpenseCommand()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.executeOrdersCommand()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.executePayablesCommand()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.executeSalesFiscalCommand()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.saveComanda()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.saveMesaEstado()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.syncCloudCustomers()** (5 connections) — `electron/persistence/tenantStore.ts`
- **.syncCloudExpenseCategories()** (5 connections) — `electron/persistence/tenantStore.ts`
- *... and 46 more nodes in this community*

## Relationships

- [Shared Types Electrond](Shared_Types_Electrond.md) (17 shared connections)
- [Test Compras-crud](Test_Compras-crud.md) (16 shared connections)
- [Electron Persistence Importer](Electron_Persistence_Importer.md) (7 shared connections)
- [Electron Persistence Syncworker](Electron_Persistence_Syncworker.md) (7 shared connections)
- [Electron Persistence Ipc](Electron_Persistence_Ipc.md) (6 shared connections)
- [Electron Persistence Cloudapply](Electron_Persistence_Cloudapply.md) (5 shared connections)
- [Electron Persistence Salesfiscalrepository](Electron_Persistence_Salesfiscalrepository.md) (4 shared connections)
- [Electron Persistence Catalogrepository](Electron_Persistence_Catalogrepository.md) (2 shared connections)
- [Electron Persistence Ordersrepository](Electron_Persistence_Ordersrepository.md) (2 shared connections)
- [Gastos](Gastos.md) (1 shared connections)

## Source Files

- `electron/persistence/tenantStore.ts`
- `src/shared/lib/checkoutContracts.ts`
- `test/sync-batch-upsert.test.ts`

## Audit Trail

- EXTRACTED: 221 (98%)
- INFERRED: 4 (2%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*