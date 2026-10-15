# Fiscal Postgresfiscalworkerrepository

> 22 nodes

## Key Concepts

- **FiscalWorkerRepository** (19 connections) — `worker/fiscal/types.ts`
- **PostgresFiscalWorkerRepository** (13 connections) — `worker/fiscal/postgresFiscalWorkerRepository.ts`
- **fiscal-worker-repository.test.ts** (7 connections) — `test/fiscal-worker-repository.test.ts`
- **.recordAudit()** (4 connections) — `worker/fiscal/postgresFiscalWorkerRepository.ts`
- **.query()** (4 connections) — `worker/fiscal/postgresFiscalWorkerRepository.ts`
- **updateByWhitelist()** (4 connections) — `worker/fiscal/postgresFiscalWorkerRepository.ts`
- **FiscalWorkerRuntimeOptions** (3 connections) — `worker/fiscal/fiscalWorkerRuntime.ts`
- **.enqueueJob()** (3 connections) — `worker/fiscal/postgresFiscalWorkerRepository.ts`
- **.updateDocument()** (3 connections) — `worker/fiscal/postgresFiscalWorkerRepository.ts`
- **.updateJob()** (3 connections) — `worker/fiscal/postgresFiscalWorkerRepository.ts`
- **Queryable** (3 connections) — `worker/fiscal/postgresFiscalWorkerRepository.ts`
- **auditEventToStatus()** (2 connections) — `worker/fiscal/postgresFiscalWorkerRepository.ts`
- **CLAIM_JOB_SQL** (2 connections) — `worker/fiscal/postgresFiscalWorkerRepository.ts`
- **claimRow** (1 connections) — `test/fiscal-worker-repository.test.ts`
- **.constructor()** (1 connections) — `worker/fiscal/postgresFiscalWorkerRepository.ts`
- **.findNextRunnableJob()** (1 connections) — `worker/fiscal/postgresFiscalWorkerRepository.ts`
- **.claimJob()** (1 connections) — `worker/fiscal/types.ts`
- **.enqueueJob()** (1 connections) — `worker/fiscal/types.ts`
- **.findNextRunnableJob()** (1 connections) — `worker/fiscal/types.ts`
- **.recordAudit()** (1 connections) — `worker/fiscal/types.ts`
- **.updateDocument()** (1 connections) — `worker/fiscal/types.ts`
- **.updateJob()** (1 connections) — `worker/fiscal/types.ts`

## Relationships

- [Fiscal Types](Fiscal_Types.md) (12 shared connections)
- [Fiscal Fiscalworkerruntime](Fiscal_Fiscalworkerruntime.md) (5 shared connections)
- [Fiscal Fiscalworker](Fiscal_Fiscalworker.md) (3 shared connections)
- [Test Compras-crud](Test_Compras-crud.md) (1 shared connections)
- [Fiscal Rfcebatchworker](Fiscal_Rfcebatchworker.md) (1 shared connections)
- [Test Fiscal-offline-reconnect](Test_Fiscal-offline-reconnect.md) (1 shared connections)
- [Fiscal Mapper](Fiscal_Mapper.md) (1 shared connections)
- [Fiscal Certificatecustody](Fiscal_Certificatecustody.md) (1 shared connections)

## Source Files

- `test/fiscal-worker-repository.test.ts`
- `worker/fiscal/fiscalWorkerRuntime.ts`
- `worker/fiscal/postgresFiscalWorkerRepository.ts`
- `worker/fiscal/types.ts`

## Audit Trail

- EXTRACTED: 52 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*