# Feature: remove-b-series

## Objective
DGII (Dirección General de Impuestos Internos, Dominican Republic) no longer permits the legacy pre-printed B-series NCFs (`B01`, `B02`, `B14`, `B15`, `B16`, `B17`) for new documents. Remove B-series from every path that creates new documents while keeping historical B invoices readable, printable, editable, and reportable; plus checkout fixes.

## Scope
- **T1**: Checkout: only e-CF sale types with a DGII-authorized range and not disabled; no B types/defaults at checkout; turning "Sin comprobante" off turns ITBIS on. Route: delegated (agy).
- **T2**: Fiscal engine & fallback: remove the `ncf_legacy` issuing branch and B reservation paths; fallback mode can only be `internal_receipt`. Route: delegated (agy).
- **T3**: Ajustes: remove `ncf_legacy` mode/fallback options and B sequence configuration UI/payload. Route: delegated (agy).
- **T4**: Retire B sequence builders and desktop local B allocation, keeping historical helpers. Route: delegated (agy).
- **T5**: Prod data: move `ncf_legacy` tenants/fallbacks to `internal_receipt` (needs explicit user OK; Claude runs it). Route: inline.

## Constraints
1. **Never drop DB columns or RPCs**: Columns (`ncf_b01_secuencia_siguiente`..`ncf_b17_secuencia_siguiente`, `ncf_secuencia_siguiente`, etc.) on `tenants` and RPCs (`cloudix_reserve_ncf`, `cloudix_advance_ncf_sequence`) must remain in place to avoid breaking distributed clients or backups.
2. **Historical readers must keep working**: All historical readers identified in map section 3 must remain intact:
   - Invoice search and table display (`Billing.tsx`, `invoiceSearch.ts`, `invoicesSearch.ts`).
   - Historical invoice header correction (`EditInvoiceHeaderModal.tsx`, `invoiceHeaderEdit.ts`).
   - Duplicate NCF prevention (`tenantStore.ts`).
   - Receipt and thermal printing without e-CF QR for historical B invoices (`receiptTemplates.ts`, `thermalPrint.ts`).
   - DGII 606 and 607 tax reports (`formato606.ts`, `formato607.ts`).
   - Local SQLite synchronization and schema constraint checks (`cloudApply.ts`, `schema.ts`).
3. **Prod data update requires explicit user OK**: Task T5 SQL must not be run without user confirmation.
4. **Test preservation**: Never rewrite an existing test file. Delete or adapt existing assertions ONLY when they assert behavior deliberately removed by the task (e.g., B types offered/selected at checkout), and document every changed assertion in the report.

## Checks
- TDD mode: off (tests mandatory for every behavior).
- Runner: `npx vitest run`.
- Typecheck: `npm run typecheck`.

## Delivery
- Branch: `fix/checkout-ncf-options`.
- One commit per task.
- Merge to master at the end.
- Untracked files `docs/comercial/`, `docs/sync-incremental-map.md`, and `scripts/propuesta/` remain untouched.

## Tasks
- [ ] T1 Checkout: only e-CF sale types with a DGII-authorized range and not disabled; no B types/defaults at checkout; turning "Sin comprobante" off turns ITBIS on. Route: delegated (agy).
- [ ] T2 Fiscal engine & fallback: remove the ncf_legacy issuing branch and B reservation paths; fallback mode can only be internal_receipt. Route: delegated (agy).
- [ ] T3 Ajustes: remove ncf_legacy mode/fallback options and B sequence configuration UI/payload. Route: delegated (agy).
- [ ] T4 Retire B sequence builders and desktop local B allocation, keeping historical helpers. Route: delegated (agy).
- [ ] T5 Prod data: move ncf_legacy tenants/fallbacks to internal_receipt (needs explicit user OK; Claude runs it). Route: inline.

## Progress
- Step 0: Created feature document `odd/tasks/remove-b-series.md` following `odd/tasks/ghost-cycle-reconcile.md` structure, cataloguing objective, scope, constraints, acceptance criteria, and task checklist.
- T1:
  1. `src/shared/lib/ncf.ts`: Added `CHECKOUT_ECF_SALE_TYPES = ["E31", "E32", "E44", "E45", "E46"] as const`, `DEFAULT_CHECKOUT_ECF_TYPE = "E32"`, `getCheckoutNcfTypeOptions(...)`, and `pickDefaultCheckoutNcfType(...)`.
  2. `src/shared/lib/tenantBillingSettings.ts`: Added `ecf_secuencias_rangos` to SELECT projection and mapped `ecfAuthorizedTypes: string[] | null` via `parseStoredBounds`. Desktop SQLite mirror reads `ecf_secuencias_rangos` through existing `LOCAL_TENANT_SETTINGS_COLUMNS` in `settings_json`; absent or malformed values resolve safely to `null` or `[]`.
  3. `src/shared/lib/checkoutFiscalSkip.ts`: Added pure helper `resolveTogglesAfterSkipChange(nextSkipFiscal: boolean)` ensuring that toggling "Sin comprobante" OFF turns ITBIS back ON, and toggling ON disables ITBIS and clears `solicitaComprobante`.
  4. `src/features/dashboard/components/Dashboard.tsx` & `src/features/billing/components/MesaCloseAccountModal.tsx`: Replaced B defaults and inline filters with `getCheckoutNcfTypeOptions` and `pickDefaultCheckoutNcfType`. Select options render catalog-ordered, active, authorized E sale types only. `onValueChange` strictly accepts existing options without B fallbacks.
  5. Tests: Created `src/shared/lib/checkoutNcfOptions.test.ts` (11 tests covering Milenio case, active exclusion, null ranges, non-sale filtering, legacy/internal mode rejection, catalog ordering, and default picker); extended `tenantBillingSettings.test.ts` and `checkoutFiscalSkip.test.ts`.
- T1 review round 1:
  1. `src/shared/lib/tenantBillingSettings.ts`: `parseAuthorizedEcfTypes` now returns `null` for malformed input (strings failing `JSON.parse` or non-object values) so cashier checkout is never locked out without options, while valid empty records `{}` return `[]`.
  2. `src/shared/lib/ncf.ts`: Narrowed `pickDefaultCheckoutNcfType(options: readonly NcfETypeOption[]): NcfTypeCode | null` and removed string/record union handling; added `CHECKOUT_FISCAL_CREDIT_TYPE = "E31"` and pure helper `pickCheckoutNcfType(options: readonly NcfETypeOption[], requestsFiscalCredit: boolean): NcfTypeCode | null` (returns E31 when credit requested and available, else default).
  3. `src/features/dashboard/components/Dashboard.tsx` & `src/features/billing/components/MesaCloseAccountModal.tsx`: Replaced inlined "E31" logic and unnecessary `isNcfTypeCode(...)` guards with `pickCheckoutNcfType`; load effects call it with `false`. Reverted `MesaCloseAccountModal` initial state back to `DEFAULT_CHECKOUT_ECF_TYPE`. Added a minimal `useEffect` in both components to keep selection valid when `checkoutNcfOptions` changes and does not include the selected type.
  4. Tests: Updated `tenantBillingSettings.test.ts` (malformed returns `null`, empty returns `[]`) and `checkoutNcfOptions.test.ts` (17 tests covering narrowed `pickDefaultCheckoutNcfType`, credit requested vs default in `pickCheckoutNcfType`).

## Verification Evidence
- `git diff --stat -- '*.test.ts' '*.test.tsx'`:
  `src/shared/lib/checkoutFiscalSkip.test.ts | 24 ++++++++++++++++++++-`
  `src/shared/lib/tenantBillingSettings.test.ts | 35 +++++++++++++++++++++++++++++++++++`
  (2 files changed, 58 insertions(+), 1 deletion(-); 0 existing assertions modified or removed; only appended blocks).
- `npm run typecheck`: clean (exit code 0).
- `npx vitest run src/shared/lib src/features/billing src/features/dashboard`: 78 test files, 694 tests passed (exit code 0).
- `npm test`: 363 test files passed, 1 skipped (364 total); 3021 tests passed, 2 skipped (exit code 0).

## Next Step
Ready for T2: Fiscal engine & fallback cleanup (removing `ncf_legacy` branch and B reservation paths; constraining fallback mode exclusively to `internal_receipt`).
