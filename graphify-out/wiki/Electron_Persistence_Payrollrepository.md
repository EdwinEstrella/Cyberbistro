# Electron Persistence Payrollrepository

> 15 nodes

## Key Concepts

- **PayrollRepository** (18 connections) — `electron/persistence/payrollRepository.ts`
- **.getPaymentContext()** (8 connections) — `electron/persistence/payrollRepository.ts`
- **.createPayment()** (7 connections) — `electron/persistence/payrollRepository.ts`
- **.ensureTenantAndBranch()** (5 connections) — `electron/persistence/payrollRepository.ts`
- **.disableEmployee()** (4 connections) — `electron/persistence/payrollRepository.ts`
- **.insertOutboxRow()** (4 connections) — `electron/persistence/payrollRepository.ts`
- **.upsertEmployee()** (4 connections) — `electron/persistence/payrollRepository.ts`
- **mapEmployeeRow()** (3 connections) — `electron/persistence/payrollRepository.ts`
- **.deletePayment()** (3 connections) — `electron/persistence/payrollRepository.ts`
- **.getEmployeeOrThrow()** (3 connections) — `electron/persistence/payrollRepository.ts`
- **.getEmployees()** (3 connections) — `electron/persistence/payrollRepository.ts`
- **.getPaymentHistory()** (3 connections) — `electron/persistence/payrollRepository.ts`
- **.getPayments()** (2 connections) — `electron/persistence/payrollRepository.ts`
- **.insertOutboxDelete()** (2 connections) — `electron/persistence/payrollRepository.ts`
- **.constructor()** (1 connections) — `electron/persistence/payrollRepository.ts`

## Relationships

- [Shared Lib Payrollcontracts](Shared_Lib_Payrollcontracts.md) (12 shared connections)
- [Electron Persistence Syncworker](Electron_Persistence_Syncworker.md) (3 shared connections)
- [Electron Persistence Ipc](Electron_Persistence_Ipc.md) (1 shared connections)

## Source Files

- `electron/persistence/payrollRepository.ts`

## Audit Trail

- EXTRACTED: 42 (98%)
- INFERRED: 1 (2%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*