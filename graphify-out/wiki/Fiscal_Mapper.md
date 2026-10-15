# Fiscal Mapper

> 24 nodes

## Key Concepts

- **mapper.ts** (23 connections) — `worker/fiscal/mapper.ts`
- **fiscal-worker-processing.test.ts** (18 connections) — `test/fiscal-worker-processing.test.ts`
- **createUnsignedEcfXml()** (16 connections) — `worker/fiscal/mapper.ts`
- **fiscal-mapper-itbis-included.test.ts** (10 connections) — `test/fiscal-mapper-itbis-included.test.ts`
- **assertMinimumEcfXml()** (4 connections) — `worker/fiscal/mapper.ts`
- **assertTotalsBalance()** (4 connections) — `worker/fiscal/mapper.ts`
- **formatDgiiDate()** (4 connections) — `worker/fiscal/mapper.ts`
- **roundCurrency()** (4 connections) — `worker/fiscal/mapper.ts`
- **splitInclusiveLines()** (4 connections) — `worker/fiscal/mapper.ts`
- **assertValidMoney()** (3 connections) — `worker/fiscal/mapper.ts`
- **formatDgiiDateTime()** (3 connections) — `worker/fiscal/mapper.ts`
- **getSantoDomingoDateParts()** (3 connections) — `worker/fiscal/mapper.ts`
- **isItbisIncludedInvoice()** (3 connections) — `worker/fiscal/mapper.ts`
- **hasXmlTagWithValue()** (2 connections) — `worker/fiscal/mapper.ts`
- **mapPaymentMethod()** (2 connections) — `worker/fiscal/mapper.ts`
- **parseDateOrFallback()** (2 connections) — `worker/fiscal/mapper.ts`
- **cents()** (1 connections) — `test/fiscal-mapper-itbis-included.test.ts`
- **numbersIn()** (1 connections) — `test/fiscal-mapper-itbis-included.test.ts`
- **snapshotWith()** (1 connections) — `test/fiscal-mapper-itbis-included.test.ts`
- **baseSnapshot()** (1 connections) — `test/fiscal-worker-processing.test.ts`
- **createRepository()** (1 connections) — `test/fiscal-worker-processing.test.ts`
- **custody** (1 connections) — `test/fiscal-worker-processing.test.ts`
- **now** (1 connections) — `test/fiscal-worker-processing.test.ts`
- **transformer** (1 connections) — `worker/fiscal/mapper.ts`

## Relationships

- [Fiscal Types](Fiscal_Types.md) (8 shared connections)
- [Fiscal Certificatecustody](Fiscal_Certificatecustody.md) (7 shared connections)
- [Fiscal Fiscalworker](Fiscal_Fiscalworker.md) (5 shared connections)
- [Fiscal Dgiiadapters](Fiscal_Dgiiadapters.md) (3 shared connections)
- [Test Compras-crud](Test_Compras-crud.md) (2 shared connections)
- [Test Fiscal-offline-reconnect](Test_Fiscal-offline-reconnect.md) (2 shared connections)
- [Electron Persistence Syncworker](Electron_Persistence_Syncworker.md) (1 shared connections)
- [Fiscal Postgresfiscalworkerrepository](Fiscal_Postgresfiscalworkerrepository.md) (1 shared connections)

## Source Files

- `test/fiscal-mapper-itbis-included.test.ts`
- `test/fiscal-worker-processing.test.ts`
- `worker/fiscal/mapper.ts`

## Audit Trail

- EXTRACTED: 71 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*