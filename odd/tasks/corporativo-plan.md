# Feature: corporativo-plan

## Objective
Add a 4th plan "Corporativo" (US$299/mo) above Empresarial (US$175), with exclusive features for restaurants that sell to companies: consolidated monthly e-CF invoice per company, authorized employee roster per company link (name/cédula), and credit limit per company with auto-block. Also unify the digital-menu admin inside Soporte → Menú Digital and update the website pricing tables.

## Decisions (user, 2026-10-31)
- `menu_links` stays in Empresarial (already promised to a client). Corporativo = everything in Empresarial + exclusive features.
- Estado de cuenta PDF (non-fiscal) stays in Empresarial. Consolidated e-CF invoice is Corporativo-only.
- e-CF per sale stays from Profesional up (unchanged).
- UI (REVISED by user 2026-10-31): keep "Links de menú" as its own sidebar screen. The public menu is ONE (the existing slug menu in Soporte → Menú Digital); "Links de menú" is only for company links (no "public" link type in the create dialog).
- Naming (user 2026-10-31): sidebar entry "Links de menú" is renamed to "Menú digital" (screen title too). To avoid two items with the same name, the Soporte tab "Menú Digital" (single public menu) is renamed "Menú público".
- Link limits per plan (company links, counted as enabled links per tenant): Empresarial max 2, Corporativo max 6. Enforced server-side (trigger: `LINK_LIMIT_REACHED` on insert/enable over the limit) and in the UI (counter "2 de 2", create disabled + upsell to Corporativo).
- Website pricing tables (website/claudix) and sales prompt (systemt.md) show 4 plans: 50 / 90 / 175 / 299.

## Current state (2026-10-31)
- Plan names hardcoded in: `src/shared/lib/planFeatures.ts`, `src/app/context/SucursalContext.tsx:57`, `src/features/window/components/TitleBar.tsx:227,254,270`, `src/features/inventario/components/Inventario.tsx:105`, `src/features/super-admin/components/SuperAdmin.tsx`, `src/features/soporte/components/Soporte.tsx:1424`.
- DB: `tenants_plan_allowed` CHECK (basico|profesional|empresarial); plan triggers/limits in `supabase/migrations/20260524200000_enforce-sucursal-plan-limits.sql` (lines 11,27,38,58,190); menu-link RPCs check `plan = 'empresarial'` exactly.
- Company orders create `cuentas_cobrar` with `factura_id` null → no fiscal invoice today.

## T6 design (from fiscal-pipeline mapping 2026-10-31)
- Template: `cloudix_issue_credit_note` (`supabase/migrations/20261024130000_ecf_credit_notes.sql`): SECURITY DEFINER txn → `cloudix_reserve_ecf(tenant,'E31')` → insert `facturas` (items jsonb: plato_id, nombre, cantidad, precio_unitario, subtotal; `metodo_pago='fiado'`, `estado='pendiente'`, `fiscal_mode='dgii_ecf'`, customer_id, cliente_rnc, cliente_nombre) → `ecf_documents` (ecf_type '31', queued) → `fiscal_outbox` (idempotency `tenant:factura:submit`). UI pattern: `src/features/notas-credito` (online-only, rpc + triggerSync).
- New RPC `cloudix_issue_consolidated_invoice(p_customer_id, p_from, p_to, p_sucursal_id)`: lock CxC rows (digital_order_id not null, factura_id null, estado not anulada, monto_pagado = 0, date range in Santo Domingo tz); fail if none; require buyer RNC (9 or 11 digits) + name; totals via tenant `itbis_incluido_en_precio` so header subtotal+itbis = total (worker `assertTotalsBalance`); propina 0; then `UPDATE cuentas_cobrar SET factura_id` (never create new CxC rows, never touch amounts).
- Guards: block `cancel_digital_order_item` / `revert_company_digital_order_accept` when the CxC row has `factura_id` (corrections go via credit note; credit-note RPC currently rejects CxC-backed originals → follow-up).
- Revenue: first time company revenue lands in `facturas` — correct, as long as each order is invoiced once. Verify `cuentas_cobrar` pull/apply carries `factura_id` updates (`cloudApply.ts:797`, `syncPullRegistry.ts`).

## Tasks
- [x] T1 Plan foundation: `corporativo` in DB (constraint, sucursal-limit triggers = unlimited, menu-link RPC plan checks accept empresarial|corporativo), planFeatures (new plan + exclusive features `consolidated_invoice`, `employee_roster`, `credit_limit`), central plan-rank helper replacing hardcoded plan comparisons, SuperAdmin can assign it. (delegated agy)
- [x] T2 Links de menú = company links only + plan link limits (Empresarial 2, Corporativo 6) in DB trigger + UI counter/upsell; Soporte → Menú Digital back to the single public menu panel (remove the embedded links list added in corporate-menu-links T2). (delegated agy)
- [ ] T3 Website pricing tables + systemt.md with 4 plans. (delegated agy)
- [x] T4 Employee roster per company link (name/cédula), enforced server-side in create_order_by_link. (delegated agy)
- [x] T5 Credit limit per company customer with auto-block of company links. (delegated agy)
- [ ] T6 Consolidated e-CF invoice per company and date range (E31, links CxC rows to the factura, no double debt). Needs fiscal-pipeline exploration first. (delegated)
- [ ] T7 e2e/unit/SQL coverage, CI green, PROD migrations (user OK), merge to master + pull.

## Checks
typecheck + vitest + `npm run test:sql` + build; CI must pass before merge (user rule). Known local-only failure: `test/local-sync-protocol.test.ts`.

## Progress
- 2026-10-31: decisions recorded, document created.
- 2026-10-31 C-T1 done (agy): corporativo plan in planFeatures (PLAN_ORDER, planRank, isPlanAtLeast, PLAN_LABELS), hardcoded plan checks replaced (SucursalContext, TitleBar, Inventario, Soporte, SuperAdmin, AppLayout), migration 20261101090000 (plan CHECK, plan-limit fns, register_tenant, menu-link RPCs accept empresarial|corporativo). Claude review vs PROD defs: register_tenant search_path regressed to 'public' → fixed to pg_catalog, public, pg_temp. Evidence: typecheck OK, vitest 1721 pass, test:sql PASS, build OK.
- 2026-10-31 C-T3 done (de4ce12): website 4 pricing cards + plan details + systemt.md. Pending: link-limit copy (2/6) + 'Menú digital' naming → C-T2.
- 2026-10-31 C-T2 done (agy): migration 20261101100000_menu_link_limits (trigger LINK_LIMIT_REACHED / PUBLIC_LINK_NOT_ALLOWED, tenant row lock), company-only NewLinkDialog, counter + upsell, 'Menú digital' sidebar, Soporte tab 'Menú público' single panel, website/systemt limits 2/6. Evidence: typecheck OK, test:sql PASS, vitest 1726 pass / 1 known local-only fail, build OK.
- 2026-10-31 C-T4 & C-T5 done (agy): migration 20261101110000_roster_and_credit_limit (menu_links.require_roster, customers.credit_limit, menu_link_employees, RLS + triggers, normalization helpers, company_credit_used, get_menu_by_link reason CREDIT_LIMIT_REACHED, create_order_by_link matching & canonical name & limit rollback). UI: AuthorizedEmployeesDialog, bulk parser, link badge & credit progress bar in Menú digital & CxC, warning chip in Pedidos, credit limit field in Clientes. Evidence: typecheck OK, vitest 1745 pass / 1 known local-only fail, test:sql PASS, build OK.
- 2026-10-31 C-T4+T5 done (agy): migration 20261101110000 (menu_link_employees, require_roster, cédula/name matching → canonical name, EMPLOYEE_NOT_AUTHORIZED; customers.credit_limit, CREDIT_LIMIT_EXCEEDED, auto-block CREDIT_LIMIT_REACHED). Review fixes: company_credit_used had no tenant check (cross-tenant leak) → internal fn revoked + authorized wrapper; credit_limit dropped by desktop SQLite customer path → moved to online-only creditLimitRepo, field disabled if fetch fails. Evidence: typecheck OK, test:sql PASS, vitest 1753 pass / 1 known local fail, build OK.
