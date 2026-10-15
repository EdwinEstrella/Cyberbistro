# Fiscal Rfcebatchworker

> 9 nodes

## Key Concepts

- **rfceBatchWorker.ts** (12 connections) — `worker/fiscal/rfceBatchWorker.ts`
- **RfceBatchWorker** (5 connections) — `worker/fiscal/rfceBatchWorker.ts`
- **.processTenant()** (3 connections) — `worker/fiscal/rfceBatchWorker.ts`
- **.constructor()** (2 connections) — `worker/fiscal/rfceBatchWorker.ts`
- **.createAndSubmitBatch()** (2 connections) — `worker/fiscal/rfceBatchWorker.ts`
- **.runBatchProcess()** (2 connections) — `worker/fiscal/rfceBatchWorker.ts`
- **TODO: Build the actual batch XML payload according to DGII standard** (1 connections) — `worker/fiscal/rfceBatchWorker.ts`
- **TODO: Sign the XML** (1 connections) — `worker/fiscal/rfceBatchWorker.ts`
- **TODO: Send using DGII Client** (1 connections) — `worker/fiscal/rfceBatchWorker.ts`

## Relationships

- [Fiscal Dgiiadapters](Fiscal_Dgiiadapters.md) (3 shared connections)
- [Fiscal Types](Fiscal_Types.md) (2 shared connections)
- [Fiscal Fiscalworkerruntime](Fiscal_Fiscalworkerruntime.md) (2 shared connections)
- [Fiscal Certificatecustody](Fiscal_Certificatecustody.md) (1 shared connections)
- [Fiscal Postgresfiscalworkerrepository](Fiscal_Postgresfiscalworkerrepository.md) (1 shared connections)

## Source Files

- `worker/fiscal/rfceBatchWorker.ts`

## Audit Trail

- EXTRACTED: 19 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*