# Fiscal Fiscalworker

> 16 nodes

## Key Concepts

- **FiscalWorker** (20 connections) — `worker/fiscal/fiscalWorker.ts`
- **FiscalWorkerSnapshot** (14 connections) — `worker/fiscal/types.ts`
- **.auditForSnapshot()** (10 connections) — `worker/fiscal/fiscalWorker.ts`
- **.submit()** (10 connections) — `worker/fiscal/fiscalWorker.ts`
- **.pollStatus()** (9 connections) — `worker/fiscal/fiscalWorker.ts`
- **.processJob()** (9 connections) — `worker/fiscal/fiscalWorker.ts`
- **.persistSubmissionResult()** (8 connections) — `worker/fiscal/fiscalWorker.ts`
- **.persistPollResult()** (7 connections) — `worker/fiscal/fiscalWorker.ts`
- **EcfFiscalStatus** (7 connections) — `worker/fiscal/types.ts`
- **.failJob()** (6 connections) — `worker/fiscal/fiscalWorker.ts`
- **.nowIso()** (6 connections) — `worker/fiscal/fiscalWorker.ts`
- **.now()** (5 connections) — `worker/fiscal/fiscalWorker.ts`
- **.assertTenantBoundary()** (4 connections) — `worker/fiscal/fiscalWorker.ts`
- **.audit()** (4 connections) — `worker/fiscal/fiscalWorker.ts`
- **.nextAttemptIso()** (3 connections) — `worker/fiscal/fiscalWorker.ts`
- **.resolveSecurityCode()** (3 connections) — `worker/fiscal/fiscalWorker.ts`

## Relationships

- [Fiscal Types](Fiscal_Types.md) (9 shared connections)
- [Fiscal Certificatecustody](Fiscal_Certificatecustody.md) (8 shared connections)
- [Fiscal Mapper](Fiscal_Mapper.md) (5 shared connections)
- [Test Fiscal-offline-reconnect](Test_Fiscal-offline-reconnect.md) (3 shared connections)
- [Fiscal Postgresfiscalworkerrepository](Fiscal_Postgresfiscalworkerrepository.md) (3 shared connections)
- [Fiscal Fiscalworkerruntime](Fiscal_Fiscalworkerruntime.md) (2 shared connections)
- [Fiscal Dgiiadapters](Fiscal_Dgiiadapters.md) (1 shared connections)

## Source Files

- `worker/fiscal/fiscalWorker.ts`
- `worker/fiscal/types.ts`

## Audit Trail

- EXTRACTED: 77 (99%)
- INFERRED: 1 (1%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*