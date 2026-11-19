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
- [x] T2 Fiscal engine & fallback: remove the ncf_legacy issuing branch and B reservation paths; fallback mode can only be internal_receipt. Route: delegated (agy).
- [x] T3 Ajustes: remove ncf_legacy mode/fallback options and B sequence configuration UI/payload. Route: delegated (agy).
- [x] T4 Retire B sequence builders and desktop local B allocation, keeping historical helpers. Route: delegated (agy).
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

- T3:
  1. `src/features/ajustes/components/AjustesFacturacionTab.tsx`: Removed `ncf_legacy` ("NCF Tradicional") option from "Modo Fiscal" select; removed the "Modo de Respaldo" selector entirely; removed `showBSequences`, the "Secuencias Configuradas por Tipo B" section, and the B "Tipo Predeterminado" controls. Retained e-CF section with read-only sequence inputs and added active-type toggles for E types only.
  2. `src/features/ajustes/types.ts`: Narrowed `fiscal_mode` to `"internal_receipt" | "dgii_ecf"`; removed `fiscal_mode_fallback` and B-only `ncf_secuencia_siguiente` from `AjustesConfig`.
  3. `src/features/ajustes/components/Ajustes.tsx`: Mapped loaded tenant with `fiscal_mode: "ncf_legacy"` to `"internal_receipt"`; stopped computing `buildBSequenceMapFromRow`/B defaults; derived `ncf_fiscal_activo` strictly as `fiscalMode === "dgii_ecf"`; cleaned `TENANT_FIELDS_NCF` projection (removed `NCF_B_SEQUENCE_FIELDS_SELECT`, `fiscal_mode_fallback`, `ncf_secuencia_siguiente`).
  4. `src/features/ajustes/lib/ajustesPayload.ts`: The saved payload never writes `ncf_bXX_secuencia_siguiente`, `ncf_secuencia_siguiente`, B `ncf_tipo_default`, or `ncf_legacy` fiscal mode. Preserves existing B keys in `ncf_secuencias_por_tipo` and `ncf_tipos_activos` untouched while ignoring config-provided B values and applying config's non-B toggles. Converts `ncf_legacy` to `internal_receipt` and writes `fiscal_mode_fallback: "internal_receipt"`. Extracted pure `mapTenantRowToAjustesConfig`.
  5. `src/features/fiscal/components/ActivationPanel.tsx`: Updated deactivation success message to `Facturación electrónica desactivada. El POS vuelve a emitir recibos internos.`.
  6. Removed dead `fiscal_mode_fallback` and `fiscalModeFallback` from `src/shared/lib/tenantBillingSettings.ts` (row interface, normalized settings, select column projection) and `src/features/fiscal/lib/loadEcfReadiness.ts` (select query and return interface).
  7. Tests: Updated `src/features/ajustes/lib/ajustesPayload.test.ts` to assert that no B columns/keys/sequences are in payload, and added unit tests for `mapTenantRowToAjustesConfig`.

- T4:
  1. `src/shared/lib/ncf.ts`: Deleted B sequence builders and helpers (`buildDefaultBSequenceMap`, `buildBSequenceMap`, `buildBSequenceMapFromRow`, `buildNcfSequenceMapForSave`, `buildNcfSequenceColumnsForSave`, `buildTenantNcfUpdatePayload`, `NCF_B_SEQUENCE_COLUMN_BY_CODE`, `NCF_B_SEQUENCE_FIELDS_SELECT`, `getNcfSequenceColumnName`, `getExplicitBSequenceForType`, `DEFAULT_NCF_B_CODE`, `ECF_TO_LEGACY_MAP`). Removed B branches in `getNcfSequenceForType` and `prepareNcfForFacturaInsert` (which now strictly prepares E types and returns null for B codes). Removed `ncf_legacy` branch in `normalizeNcfTypeForFiscalMode`. Retained `NCF_B_TIPO_OPCIONES`, `isNcfBCode`, `esCodigoNcfValido`, `ncfSequenceDigits`, `ncfTypeRequiresClientRnc`, `etiquetaTipoNcf`, `LEGACY_TO_ECF_MAP`, `isNcfTypeCode`, `NcfTypeCode`, and `ncfPayloadFromReservedSequence`.
  2. `src/shared/lib/tenantBillingSettings.ts`: Replaced `DEFAULT_NCF_B_CODE` fallback with `DEFAULT_CHECKOUT_ECF_TYPE`.
  3. `src/shared/lib/invoiceNcf.ts`: Deleted `loadTenantNcfRow`, `ncfPayloadForInsert`, and `incrementTenantNcfSequence`.
  4. `src/features/dashboard/components/Dashboard.tsx` & `src/features/billing/components/MesaCloseAccountModal.tsx`: Removed `incrementTenantNcfSequence` imports and calls, verifying that for e-CF `sequenceReservedAtomically` is always true and thus the non-atomic increment branches were unreachable. Removed `deferredNcfIncrements`.
  5. `src/shared/lib/localFirst.ts`: Cleaned B branch from `buildLocalTenantNcfReservation` (strictly enforces e-CF ranges from `ecf_secuencias_rangos` and advances `ncf_secuencias_por_tipo` without B builders). Removed `incrementTenantNcfSequence` calls in `adjustFacturaPayloadForServer`.
  6. Desktop: Retired offline B sequence allocation. Removed `ncfLocalSequence` from `electron/preload.ts`, `src/shared/types/electron.d.ts`, `electron/main.ts`, `electron/persistence/tenantStore.ts`, and `electron/persistence/ipc.ts` (removed `NCF_LOCAL_SEQUENCE_CHANNEL`). In `electron/persistence/schema.ts`, moved `NCF_LOCAL_SEQUENCES_CREATE_SQL` directly into schema initialization with a comment that the table is retired. Deleted `electron/persistence/ncfLocalSequence.ts`.
  7. Tests: Deleted `test/local-sqlite-ncf-sequence.test.ts` (covered only deleted SQLite B sequence logic). Trimmed deleted B builder and `ncf_legacy` mapping tests in `src/shared/lib/ncf.test.ts`, and adapted `prepareNcfForFacturaInsert` assertions to e-CF. Updated `src/shared/lib/localFirst.test.ts` to assert e-CF offline reservation and B code rejection.

## Verification Evidence
- `git diff HEAD --stat -- '*.test.ts' '*.test.tsx'`:
  `src/shared/lib/localFirst.test.ts      |  32 +++++--`
  `src/shared/lib/ncf.test.ts             | 104 ++++++--------------`
  `test/local-sqlite-ncf-sequence.test.ts | 168 ---------------------------------`
  (3 files changed, 50 insertions(+), 254 deletions(-)).
- `npm run typecheck`: clean (exit code 0).
- `npx vitest run src/shared/lib src/features test/desktop-ipc-guard.test.ts`: 219 test files passed, 1876 tests passed (exit code 0).
- `npm test`: 363 test files passed, 1 skipped (364 total); 3012 tests passed, 2 skipped (exit code 0).
- `npm run build`: built in 5.50s (renderer) + 559ms (electron main); electron main output verified (exit code 0).
- `graphify update .`: completed successfully (11288 nodes, 23501 edges, 811 communities).

## Next Step
T4 completed; ready for T5 (Prod data: move ncf_legacy tenants/fallbacks to internal_receipt).
