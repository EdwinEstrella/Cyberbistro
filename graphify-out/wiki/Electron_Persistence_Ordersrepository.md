# Electron Persistence Ordersrepository

> 17 nodes

## Key Concepts

- **local-sqlite-orders.test.ts** (13 connections) — `test/local-sqlite-orders.test.ts`
- **ordersRepository.ts** (9 connections) — `electron/persistence/ordersRepository.ts`
- **OrdersRepository** (8 connections) — `electron/persistence/ordersRepository.ts`
- **ordersContracts.ts** (8 connections) — `src/shared/lib/ordersContracts.ts`
- **OrdersCommand** (8 connections) — `src/shared/lib/ordersContracts.ts`
- **OrdersRepositoryResult** (5 connections) — `src/shared/lib/ordersContracts.ts`
- **OrdersRepositoryIpcMain** (4 connections) — `electron/persistence/ipc.ts`
- **.execute()** (4 connections) — `electron/persistence/ordersRepository.ts`
- **.executeOrdersCommand()** (3 connections) — `electron/persistence/ordersRepository.ts`
- **withStore()** (3 connections) — `test/local-sqlite-cierres-write.test.ts`
- **withStores()** (3 connections) — `test/local-sqlite-orders.test.ts`
- **ORDERS_REPOSITORY_EXECUTE_CHANNEL** (2 connections) — `electron/persistence/ipc.ts`
- **OrdersRepositoryStore** (2 connections) — `electron/persistence/ordersRepository.ts`
- **.handle()** (1 connections) — `electron/persistence/ipc.ts`
- **.removeHandler()** (1 connections) — `electron/persistence/ipc.ts`
- **.constructor()** (1 connections) — `electron/persistence/ordersRepository.ts`
- **OrderItem** (1 connections) — `src/shared/lib/ordersContracts.ts`

## Relationships

- [Electron Persistence Ipc](Electron_Persistence_Ipc.md) (9 shared connections)
- [Test Compras-crud](Test_Compras-crud.md) (7 shared connections)
- [Shared Types Electrond](Shared_Types_Electrond.md) (4 shared connections)
- [Shared Lib Ordersuiadapter](Shared_Lib_Ordersuiadapter.md) (3 shared connections)
- [Electron Persistence Tenantstore](Electron_Persistence_Tenantstore.md) (2 shared connections)
- [Electron Persistence Importer](Electron_Persistence_Importer.md) (2 shared connections)
- [Electron Persistence Syncworker](Electron_Persistence_Syncworker.md) (1 shared connections)

## Source Files

- `electron/persistence/ipc.ts`
- `electron/persistence/ordersRepository.ts`
- `src/shared/lib/ordersContracts.ts`
- `test/local-sqlite-cierres-write.test.ts`
- `test/local-sqlite-orders.test.ts`

## Audit Trail

- EXTRACTED: 52 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*