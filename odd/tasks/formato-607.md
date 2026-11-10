# Feature: DGII Formato 607 (Ventas) Exporter

## Objective
Enable accountants (role `contabilidad`) and authorized staff to export the monthly Formato 607 (Envío de Ventas de Bienes y Servicios) from Analíticas (Billing) in both official DGII pipe-delimited TXT format and Excel-compatible CSV format, mirroring the design, error handling, and conventions of the existing 606 export.

## Context & Official Spec (DGII 2025-12)
- Official standard: Norma General 07-2018 / DGII "Llenado y Remisión del Formato 607" (Instructivo 2025-12).
- Header line (TXT): `607|<RNC emisor>|<AAAAMM>|<detail record count>` (CRLF line endings, header count excludes header itself).
- 23 Detail columns in exact order:
  1. RNC/Cédula/Pasaporte del comprador (digits only for RNC/cédula; passport/tax id if foreign). Empty not allowed in detail rows.
  2. Tipo Identificación (1: RNC [9 digits], 2: Cédula [11 digits], 3: Pasaporte/Tributaria [non-numeric]).
  3. NCF (11 alphanumeric characters, e.g. B0100000001, E310000000001).
  4. NCF modificado (11 positions; for credit notes ref_ncf; otherwise empty).
  5. Tipo de Ingreso (1: Ingresos por operaciones no financieros; constant 1 for restaurant sales).
  6. Fecha comprobante (AAAAMMDD).
  7. Fecha de retención (AAAAMMDD or empty; always empty in Cloudix).
  8. Monto facturado (subtotal without ITBIS, selectivo, propina or other taxes).
  9. ITBIS facturado.
  10. ITBIS retenido por terceros (0.00).
  11. ITBIS percibido (0.00).
  12. Retención renta por terceros (0.00).
  13. ISR percibido (0.00).
  14. Impuesto selectivo al consumo (0.00).
  15. Otros impuestos/tasas (0.00).
  16. Monto propina legal (10%, from invoice `propina`).
  17. Efectivo.
  18. Cheque/Transferencia/Depósito.
  19. Tarjeta débito/crédito.
  20. Venta a crédito.
  21. Bonos o certificados de regalo.
  22. Permuta.
  23. Otras formas de ventas.
- Payment columns (17-23) split the invoice total (subtotal + itbis + propina). Credit sales (col 20) have empty retention date and 0.00 retention amounts.
- Inclusions:
  - Sales with NCF of types B01, B14, B15, E31, E34 (credit notes).
  - B02 / E32 consumo invoices with total >= RD$ 250,000 (`CONSUMO_DETAIL_THRESHOLD = 250000`).
- Exclusions:
  - Invoices without NCF (`fiscal_mode` internal_receipt or missing/empty NCF).
  - Cancelada invoices (`estado = "cancelada"`).
  - Pendiente invoices (`estado = "pendiente"`).
  - Invoices outside the selected month by fiscal date (`pagada_at` if present else `created_at`).
  - Consumo invoices below RD$ 250,000 are excluded from detail; they are aggregated into the monthly general summary (`consumoSummary`).
- Credit notes:
  - Included in detail with col 4 = `ref_ncf`. Amounts stored as positive magnitudes. Buyer ID inherited from original invoice if empty, otherwise validation error naming the NCF.
- Max records: 65,000 (`MAX_RECORDS = 65000`). Throw Spanish error when exceeded.
- TDD Mode: Resolved ON (vitest, command `npm test`).

## Tasks Checklist
- [x] **T1 (pure module)**: `src/features/contabilidad/lib/formato607.ts`: types, constants (`CONSUMO_DETAIL_THRESHOLD = 250000`, `MAX_RECORDS = 65000`), `buildFormato607Rows(invoices, period)`, `consumoSummary(invoices, period)`, `generateFormato607(rncEmisor, period, rows, format)`. Extract shared helpers (amount, field, date formatting) without duplicating or changing 606 behavior.
- [x] **T2 (tests)**: `src/features/contabilidad/lib/formato607.test.ts`: test-first verification of header, 23 columns order, identification types, B01, E31, B02 below/above threshold, E32, credit notes, exclusions, payment method splits, 2 decimals, CSV with BOM, validations (emitter RNC, missing buyer ID naming NCF, >65,000 error), and consumo summary.
- [x] **T3 (data + UI)**: In Billing (Analíticas), add "Exportar Formato 607" section/control with month selector (default previous month), TXT and CSV download triggers, loading state, success notification, consumo summary display, and deadline notice ("a más tardar el día 15 del mes siguiente"). Data-assembly logic in `src/features/contabilidad/lib/formato607Data.ts` using `readLocalInvoices` and tenant RNC.
- [x] **T4 (tests for T3 logic)**: Unit tests in `src/features/contabilidad/lib/formato607Data.test.ts` for data assembly covering web/desktop row formats (`items` as array or JSON string) and credit-note parent resolution.
- [x] **T5 (docs)**: Add `docs/formato-607.md` (Spanish, max 25 lines) explaining the export, rules, credit-note sign note, and DGII pre-validator usage.
- [x] **T6 (Dominican local time)**: `America/Santo_Domingo` (UTC-4, no DST) conversion via `toDominicanLocalDate` in `src/shared/lib/businessDate.ts` (re-exporting `BUSINESS_TIMEZONE` in `menuBusinessDate.ts`). Applied for both month membership and column 6 (`fecha_comprobante`). Adjusted single `sep` test fixture in `formato607.test.ts` to `2026-09-02T12:00:00Z` and added night-sale tests.
- [x] **T7 (Credit sales / fiado)**: Include credit sales (`fiado`, `credito`, `crédito`) in column 20 (`Venta a crédito`), even with `estado: "pendiente"`. Only `cancelada` and non-credit `pendiente` invoices are excluded. Applied identical rule to `consumoSummary`.
- [x] **T8 (Range-bound paginated loading & credit-note parent resolution)**: `loadFormato607Data` loads within UTC bounds with a 7-day lower pad on `created_at`. Extended `ReadInvoicesOptions` in `invoicesLocal.ts` with `dateFrom`/`dateTo` (delegating to desktop SQLite or `fetchCloudInvoicesInRange`). Cloud errors surface Spanish connectivity message. Missing parent invoices for credit notes fetched and merged for buyer ID only (never emitted as detail rows).
- [x] **T9 (Role gating & buyer ID classification)**: In `Billing.tsx`, gated `<ExportFormato607 />` behind `showSummaries` (`canViewBillingSummaries(rol)`: visible for `admin` and `contabilidad`, hidden from `cajera`). In `resolveBuyerId`, mapped letters to Tipo 3 (passport), 9 digits to Tipo 1, 11 digits to Tipo 2, and other digit counts throw error naming the NCF.
- [x] **T10 (UI polish, simplification & test harness)**: Replaced hardcoded color buttons with shared `Button` and theme tokens (`bg-primary`, `border-border`, `text-primary`, `text-destructive`). Extracted `downloadTextFile` to `src/shared/lib/downloadTextFile.ts`. Removed aliases in `formato606.ts`. Added `ExportFormato607.test.tsx` and role gating tests in `roleNav.test.ts`. Updated `docs/formato-607.md`.
- [x] **T11 (Container/presentational split)**: Separated `ExportFormato607.tsx` (container with only `{ tenantId }`) from `ExportFormato607View.tsx` (pure presentational component). Moved `executeFormato607Export` to `src/features/contabilidad/lib/formato607Export.ts` and tested its orchestration in `formato607Export.test.ts`. Rewrote `ExportFormato607.test.tsx` to test View states with explicit props. Removed all test seam props.
- [x] **T12 (Range branch cleanup in invoicesLocal)**: Extracted straight-line handling of date range in `invoicesLocal.ts` before non-range web query. Exported constant `INVOICE_RANGE_LOAD_ERROR` and reused in `formato607Data.ts`. Added unit tests in `invoicesLocal.test.ts` for desktop and web range paths.
- [x] **T13 (Error isolation in loadFormato607Data)**: Isolated invoice reading failure from emitter RNC lookup failure so RNC errors surface their own message ("No se pudo leer el RNC de tu negocio. Verificá tu conexión e intentá de nuevo.").
- [x] **T14 (Shared credit-note detection)**: Replaced custom credit note string checks in `collectMissingParentInvoiceIds` with shared `isCreditNoteInvoice` from `src/shared/lib/invoiceKind.ts`.
- [x] **T15 (Remove speculative multi-payment branch)**: Removed unpopulated `Formato607InvoicePayment` and payment array fields; single payment method split per invoice; removed exactly the multi-payment test from `formato607.test.ts`.
- [x] **T16 (Refactoring, Dominican calendar UI defaults & docs cleanup)**: Extracted `getReportableInvoiceMeta`, `splitPayment`, `toDetailRow`, and unified `isCreditPaymentMethod` in `formato607.ts`. Computed UI month defaults (`previousMonthValue` and `buildMonthOptions`) using pure Dominican calendar in `formato607Export.ts`. Tidied `menuBusinessDate.ts`. Cleaned documentation claims in `docs/formato-607.md`.
- [x] **T17 (invoicesLocal range branch straight-line error handling)**: In `src/features/billing/lib/invoicesLocal.ts`, removed error message string comparison (`error.message === INVOICE_RANGE_LOAD_ERROR`) in the range query branch using straight-line error handling where promise rejection or returned error both throw `INVOICE_RANGE_LOAD_ERROR`.
- [x] **T18 (docs deduplication)**: In `docs/formato-607.md` section "Pregunta Abierta", deduplicated the mention of "confirmar con el pre-validador" into a single authoritative sentence.
- [x] **T19 (Dominican year-month helper extraction)**: In `src/features/contabilidad/lib/formato607Export.ts`, extracted private helper `currentDominicanYearMonth(now): { year: number; month: number }` to deduplicate date parsing in `previousMonthValue` and `buildMonthOptions`.

## Checks
- `npm run typecheck`: exit 0
- `npx vitest run --config vitest.config.ts src/features/contabilidad src/features/billing src/shared/lib src/features/menu-links`: all test files passing
- `npm test`: all test suites passing
