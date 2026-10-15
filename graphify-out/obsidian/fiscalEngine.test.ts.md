---
source_file: "src/shared/lib/fiscalEngine.test.ts"
type: "code"
community: "Dashboard"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Dashboard
---

# fiscalEngine.test.ts

## Connections
- [[dot-clear()]] - `calls` [EXTRACTED]
- [[dot-getItem()]] - `calls` [EXTRACTED]
- [[dot-setItem()]] - `calls` [EXTRACTED]
- [[LocalStorageMock]] - `contains` [EXTRACTED]
- [[enqueueEcfDocuments()]] - `imports` [EXTRACTED]
- [[enqueueLocalWrite()]] - `indirect_call` [INFERRED]
- [[fiscalEngine.ts]] - `imports_from` [EXTRACTED]
- [[loadTenantBillingSettings()]] - `indirect_call` [INFERRED]
- [[localFirst.ts]] - `imports_from` [EXTRACTED]
- [[resolveActiveFiscalMode()]] - `imports` [EXTRACTED]
- [[resolveNcfForNewInvoiceLocalFirst()]] - `indirect_call` [INFERRED]
- [[runFiscalEngine()]] - `imports` [EXTRACTED]
- [[sharedlibsupabase.ts]] - `imports_from` [EXTRACTED]
- [[supabase_2]] - `imports` [EXTRACTED]
- [[tenantBillingSettings.ts]] - `imports_from` [EXTRACTED]
- [[vitest_1]] - `imports_from` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/Dashboard