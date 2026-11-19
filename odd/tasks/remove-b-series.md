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
- [x] T1 Checkout: only e-CF sale types with a DGII-authorized range and not disabled; no B types/defaults at checkout; turning "Sin comprobante" off turns ITBIS on. Route: delegated (agy).
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
- T2:
  1. `src/shared/lib/fiscalEngine.ts`: In `resolveActiveFiscalMode`, stored `fiscalMode === "ncf_legacy"` resolves to `"internal_receipt"`; fallback mode always yields `"internal_receipt"` even if stored as `"ncf_legacy"`. Online/offline e-CF resolution remains intact. In `runFiscalEngine`, removed the `activeMode === "ncf_legacy"` issuing branch; calls with `activeMode === "ncf_legacy"` return `null` immediately just like `internal_receipt`.
  2. `src/shared/lib/invoiceNcf.ts`: `resolveNcfForNewInvoice` only permits e-CF reservation (`preferredType` starting with 'E' via `cloudix_reserve_ecf`); requesting non-E/B types immediately returns `null` without invoking `cloudix_reserve_ncf` or falling back to `loadTenantNcfRow`/`ncfPayloadForInsert`. Retained `incrementTenantNcfSequence` for remaining importers (`MesaCloseAccountModal`, `Dashboard`, `localFirst`).
  3. `src/shared/lib/ecfActivationReadiness.ts`: Narrowed `FiscalFallbackMode` to `"internal_receipt"`; updated `buildDeactivationPayload` to always deactivate to `{ fiscal_mode: "internal_receipt", ncf_fiscal_activo: false }`.
  4. `src/shared/lib/localNcfReservation.ts`: `resolveNcfForNewInvoiceDesktop` no longer reserves B numbers locally from SQLite (returns `null` for non-E types without invoking the desktop bridge or `cloudReserve`). E-CF remains cloud-only.
  5. Tests: Created `src/shared/lib/invoiceNcf.test.ts` (7 tests verifying B01/B02 return null without calling RPCs, and E31/E32 call `cloudix_reserve_ecf`). Adapted assertions in `fiscalEngine.test.ts`, `ecfActivationReadiness.test.ts`, and `localNcfReservation.test.ts` to reflect retirement of B issuance and fallback normalization. Historical readers (`invoiceHeaderEdit`, `formato607`, `formato606`, `invoiceSearch`, `receiptTemplates`) remained untouched and 100% green.

- T2 review round 1:
  1. `src/shared/lib/localNcfReservation.ts`: Deleted unused functions (`callBridge`, `isCloudOutage`, `reserveLocal`, `recordQuietly`, `peekLocal`, `catchUpCloudNcfSequence`, `isMissingRpc`) instead of keeping them alive as exports. Simplified `DesktopNcfDeps` to only `{ cloudReserve }`, updated `defaultDesktopNcfDeps`, and removed all now-unused imports (`supabase`, `cloudAvailability`, `ncf`, `electron/persistence`).
  2. `src/shared/lib/localFirst.ts`: Inspected `reserveLocalNcfForNewInvoice` (~L702) and L754; verified they depend on IndexedDB (`buildLocalTenantNcfReservation`, owned by T4), with zero dependency on the removed pieces from `localNcfReservation.ts`.
  3. `src/shared/lib/ecfActivationReadiness.ts`: Removed unused `normalizeFiscalFallback` and `FiscalFallbackMode`. Simplified `buildDeactivationPayload(now: Date = new Date())` eliminating the ignored fallback parameter.
  4. `src/features/fiscal/components/ActivationPanel.tsx`: Dropped `loaded?.fiscalModeFallback` and unused `const loaded = await refreshReadiness()` from `deactivateElectronicBilling()`, calling `buildDeactivationPayload()`.
  5. Tests: In `src/shared/lib/localNcfReservation.test.ts`, simplified fake deps to `{ cloudReserve }`, removed bridge mocks and deleted `describe("catchUpCloudNcfSequence")` (assertions for retired B counter catch-up). In `src/shared/lib/ecfActivationReadiness.test.ts`, updated `buildDeactivationPayload` assertions to single-argument invocation and deleted the `normalizeFiscalFallback` test.

## Verification Evidence
- `git diff --stat -- '*.test.ts' '*.test.tsx'`:
  `src/shared/lib/ecfActivationReadiness.test.ts |  17 +--`
  `src/shared/lib/fiscalEngine.test.ts           |  75 ++++-------`
  `src/shared/lib/localNcfReservation.test.ts    | 183 ++++++++------------------`
  (3 files changed, 86 insertions(+), 189 deletions(-) existing assertions modified/removed).
  Plus new file `src/shared/lib/invoiceNcf.test.ts` (7 tests).
- `npm run typecheck`: clean (exit code 0).
- `npx vitest run src/shared/lib src/features/fiscal src/features/billing`: 92 test files, 827 tests passed (exit code 0).
- `npm test`: 364 test files passed, 1 skipped (365 total); 3024 tests passed, 2 skipped (exit code 0).
- `graphify update .`: completed successfully (11332 nodes, 23659 edges, 803 communities).

## Next Step
T2 review round 1 completed; awaiting review/approval before T3.
