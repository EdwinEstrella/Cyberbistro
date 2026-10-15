---
type: community
members: 10
---

# Nomina (Nomina)

**Members:** 10 nodes

## Members
- [[PayrollCommand]] - code - src/shared/lib/payrollContracts.ts
- [[PayrollRepositoryResult]] - code - src/shared/lib/payrollContracts.ts
- [[executePayrollCommandLocally()]] - code - src/shared/lib/payrollUiAdapter.ts
- [[getLocalPaymentContext()]] - code - src/features/nomina/Nomina.tsx
- [[handleConfirmAnnullPayment()]] - code - src/features/nomina/Nomina.tsx
- [[handleConfirmDisable()]] - code - src/features/nomina/Nomina.tsx
- [[handleSaveEmployee()]] - code - src/features/nomina/Nomina.tsx
- [[isPayrollLocalStorageAvailable()]] - code - src/shared/lib/payrollUiAdapter.ts
- [[payrollUiAdapter.test.ts]] - code - src/shared/lib/payrollUiAdapter.test.ts
- [[payrollUiAdapter.ts]] - code - src/shared/lib/payrollUiAdapter.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Nomina_Nomina
SORT file.name ASC
```

## Connections to other communities
- 13 edges to [[_COMMUNITY_Nomina]]
- 3 edges to [[_COMMUNITY_Shared Lib Payrollcontracts]]
- 2 edges to [[_COMMUNITY_Electron Persistence Ipc]]
- 2 edges to [[_COMMUNITY_Shared Lib Payrollcloudsync]]
- 1 edge to [[_COMMUNITY_Test Compras-crud]]

## Top bridge nodes
- [[payrollUiAdapter.ts]] - degree 7, connects to 2 communities
- [[handleConfirmAnnullPayment()]] - degree 4, connects to 2 communities
- [[handleConfirmDisable()]] - degree 4, connects to 2 communities
- [[PayrollCommand]] - degree 4, connects to 2 communities
- [[executePayrollCommandLocally()]] - degree 10, connects to 1 community