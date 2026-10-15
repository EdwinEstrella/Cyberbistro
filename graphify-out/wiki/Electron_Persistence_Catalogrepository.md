# Electron Persistence Catalogrepository

> 19 nodes

## Key Concepts

- **local-sqlite-catalogs.test.ts** (15 connections) — `test/local-sqlite-catalogs.test.ts`
- **catalogRepository.ts** (9 connections) — `electron/persistence/catalogRepository.ts`
- **CatalogRepository** (8 connections) — `electron/persistence/catalogRepository.ts`
- **CatalogCommand** (8 connections) — `src/shared/lib/catalogContracts.ts`
- **catalogContracts.ts** (7 connections) — `src/shared/lib/catalogContracts.ts`
- **catalogUiAdapter.ts** (7 connections) — `src/shared/lib/catalogUiAdapter.ts`
- **CatalogRepositoryResult** (5 connections) — `src/shared/lib/catalogContracts.ts`
- **.execute()** (4 connections) — `electron/persistence/catalogRepository.ts`
- **CatalogRepositoryIpcMain** (4 connections) — `electron/persistence/ipc.ts`
- **.executeCatalogCommand()** (3 connections) — `electron/persistence/catalogRepository.ts`
- **catalogUiAdapter.test.ts** (3 connections) — `src/shared/lib/catalogUiAdapter.test.ts`
- **withStores()** (3 connections) — `test/local-sqlite-catalogs.test.ts`
- **CatalogRepositoryStore** (2 connections) — `electron/persistence/catalogRepository.ts`
- **CATALOG_REPOSITORY_EXECUTE_CHANNEL** (2 connections) — `electron/persistence/ipc.ts`
- **.constructor()** (1 connections) — `electron/persistence/catalogRepository.ts`
- **.handle()** (1 connections) — `electron/persistence/ipc.ts`
- **.removeHandler()** (1 connections) — `electron/persistence/ipc.ts`
- **handle()** (1 connections) — `test/local-sqlite-catalogs.test.ts`
- **removeHandler()** (1 connections) — `test/local-sqlite-catalogs.test.ts`

## Relationships

- [Electron Persistence Ipc](Electron_Persistence_Ipc.md) (9 shared connections)
- [Test Compras-crud](Test_Compras-crud.md) (7 shared connections)
- [Shared Types Electrond](Shared_Types_Electrond.md) (4 shared connections)
- [Gastos](Gastos.md) (4 shared connections)
- [Electron Persistence Importer](Electron_Persistence_Importer.md) (2 shared connections)
- [Electron Persistence Tenantstore](Electron_Persistence_Tenantstore.md) (2 shared connections)
- [Electron Persistence Syncworker](Electron_Persistence_Syncworker.md) (1 shared connections)

## Source Files

- `electron/persistence/catalogRepository.ts`
- `electron/persistence/ipc.ts`
- `src/shared/lib/catalogContracts.ts`
- `src/shared/lib/catalogUiAdapter.test.ts`
- `src/shared/lib/catalogUiAdapter.ts`
- `test/local-sqlite-catalogs.test.ts`

## Audit Trail

- EXTRACTED: 57 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*