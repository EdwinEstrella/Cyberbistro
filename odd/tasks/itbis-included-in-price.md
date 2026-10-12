# Feature: ITBIS included in price

## Objective
Tenant setting "ITBIS incluido en el precio". When ON, a product priced 100 bills as
base 84.75 + ITBIS 15.25 = total 100 (base = round2(price / (1 + rate)), itbis = price - base).
When OFF, behavior is unchanged.

## Why
Customers complain when the menu price grows at checkout; the business wants the menu price to be the final price.

## Constraints
- Only ITBIS changes. Propina (10%) stays exactly as today: computed on the menu (gross) price.
- Consumos keep menu prices; the split is applied only at billing.
- facturas.items keep menu prices (receipt shows the menu price). The e-CF mapper detects
  inclusive invoices (sum of line subtotals == header subtotal + itbis) and splits lines inclusively,
  absorbing rounding residual so lines sum exactly to the header.
- No retroactive change to existing invoices.
- Cloud migration file is created; applying it to production Supabase requires user confirmation.

## Route
Delegated direct (writer trigger: 2+ non-trivial files; mapping already done by an explorer).

## TDD
Mode: off (no project TDD config found). Runner: `npm test` (vitest), `npm run typecheck`.

## Tasks
- [x] T1 Core math: `calculateInvoiceTotals` gains `itbisIncluded`; unit tests (100 → 84.75/15.25/100; + propina → 10/110; rate 0).
- [x] T2 Setting plumbing: Supabase migration + sql/ file + test schemas, tenantBillingSettings, localFirst SAFE_TENANT_KEYS, Ajustes toggle.
- [x] T3 Callers: MesaCloseAccountModal (all calls + labels), Dashboard (takeout/panel/pre-cuenta), Cierre estimate, Billing label.
- [x] T4 e-CF mapper: inclusive line split in worker/fiscal/mapper.ts + tests.
- [ ] T5 E2E coverage: `test/itbis-included-price.e2e.spec.ts` written (OFF classic, ON 84.75/15.25/100 price-agnostic, ON+propina, persisted factura, Ajustes toggle persistence, setting restored in finally). NOT executed: no CYBERBISTRO_E2E_EMAIL/PASSWORD locally, so Playwright reports 1 skipped (selectors unverified against a live tenant). CI needs the tenants.itbis_incluido_en_precio column on the E2E Supabase project.

## Acceptance
- Setting OFF: all existing tests pass, totals identical.
- Setting ON: 100 → subtotal 84.75, itbis 15.25, total 100 (+ propina 10 when enabled → 110).
- e-CF lines sum exactly to MontoGravadoTotal / TotalITBIS for inclusive invoices.

## Progress / evidence
- T1 8b58da5: typecheck OK; npm test 796 passed.
- T2 877db3e: typecheck OK; npm test 797 passed. Migration file only, NOT applied remotely. tenantBillingSettings retries without the new column if cloud lacks it; Ajustes does the same.
- T3 2950a5d: typecheck OK; npm test 797 passed. Billing.tsx label left unchanged (historical invoices lack the flag). Cierre estimate uses the helper (rate fixed 0.18 as before; inclusive only when flag ON).
- T4 47cc360: typecheck OK; npm test 801 passed (142 files, 1 skipped). Inclusive lines: MontoItem = base (sums to MontoGravadoTotal); exclusive path unchanged (MontoItem = base+itbis, as before).
- Route: delegated direct (single writer).
- 2026-10-11: migration applied to production (cloudix-db.azokia.com) with user approval; verified column boolean NOT NULL DEFAULT false, 6 tenants, 0 enabled.

## Next step
- Open question: e-CF exclusive path sets MontoItem = base+itbis while inclusive sets base; IndicadorMontoGravado hardcoded 0 (worker/fiscal/mapper.ts:101). Confirm against DGII spec.
- Push / PR / release are the user's decisions.
