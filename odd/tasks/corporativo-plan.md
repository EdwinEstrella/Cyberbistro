# Feature: corporativo-plan

## Objective
Add a 4th plan "Corporativo" (US$299/mo) above Empresarial (US$175), with exclusive features for restaurants that sell to companies: consolidated monthly e-CF invoice per company, authorized employee roster per company link (name/cédula), and credit limit per company with auto-block. Also unify the digital-menu admin inside Soporte → Menú Digital and update the website pricing tables.

## Decisions (user, 2026-10-31)
- `menu_links` stays in Empresarial (already promised to a client). Corporativo = everything in Empresarial + exclusive features.
- Estado de cuenta PDF (non-fiscal) stays in Empresarial. Consolidated e-CF invoice is Corporativo-only.
- e-CF per sale stays from Profesional up (unchanged).
- UI: no separate "Links de menú" sidebar entry; everything lives in Soporte → Menú Digital (public menu settings + links + appearance). Plans without `menu_links` see the links section locked as an upsell.
- Website pricing tables (website/claudix) and sales prompt (systemt.md) show 4 plans: 50 / 90 / 175 / 299.

## Current state (2026-10-31)
- Plan names hardcoded in: `src/shared/lib/planFeatures.ts`, `src/app/context/SucursalContext.tsx:57`, `src/features/window/components/TitleBar.tsx:227,254,270`, `src/features/inventario/components/Inventario.tsx:105`, `src/features/super-admin/components/SuperAdmin.tsx`, `src/features/soporte/components/Soporte.tsx:1424`.
- DB: `tenants_plan_allowed` CHECK (basico|profesional|empresarial); plan triggers/limits in `supabase/migrations/20260524200000_enforce-sucursal-plan-limits.sql` (lines 11,27,38,58,190); menu-link RPCs check `plan = 'empresarial'` exactly.
- Company orders create `cuentas_cobrar` with `factura_id` null → no fiscal invoice today.

## Tasks
- [ ] T1 Plan foundation: `corporativo` in DB (constraint, sucursal-limit triggers = unlimited, menu-link RPC plan checks accept empresarial|corporativo), planFeatures (new plan + exclusive features `consolidated_invoice`, `employee_roster`, `credit_limit`), central plan-rank helper replacing hardcoded plan comparisons, SuperAdmin can assign it. (delegated agy)
- [ ] T2 UI unification: Soporte → Menú Digital contains public menu + links list + appearance; remove sidebar "Links de menú"; locked upsell for lower plans. (delegated agy)
- [ ] T3 Website pricing tables + systemt.md with 4 plans. (delegated agy)
- [ ] T4 Employee roster per company link (name/cédula), enforced server-side in create_order_by_link. (delegated agy)
- [ ] T5 Credit limit per company customer with auto-block of company links. (delegated agy)
- [ ] T6 Consolidated e-CF invoice per company and date range (E31, links CxC rows to the factura, no double debt). Needs fiscal-pipeline exploration first. (delegated)
- [ ] T7 e2e/unit/SQL coverage, CI green, PROD migrations (user OK), merge to master + pull.

## Checks
typecheck + vitest + `npm run test:sql` + build; CI must pass before merge (user rule). Known local-only failure: `test/local-sync-protocol.test.ts`.

## Progress
- 2026-10-31: decisions recorded, document created.
