# Feature: corporate-menu-links

## Objective
Top plan (`empresarial`) feature: a corporate client (empresa) gets its own digital-menu link. Its employees order through it, every accepted order becomes debt (CxC) on that company customer, and the restaurant can export a date-range statement PDF (who ordered, how much — no item detail).

## Problem / Why
A new client wants one link per company. Some companies allow extras, others don't. Orders must be realtime and reliable (online-only, desktop + web). Today: one slug per tenant, no extras model, no per-item cancel, no auto-debt, no A4 statement PDF.

## Current state (exploration 2026-10-31)
- Public menu: `src/features/digital-menu/PublicDigitalMenu.tsx`, route `/menu/:slug`; RPCs `get_public_digital_menu`, `create_public_digital_order` (`supabase/migrations/20260707100000_*.sql`). Duplicate Next copy in `website/claudix` (status unknown).
- Pedidos: `src/features/pedidos/Pedidos.tsx`, Supabase Realtime via `tenantRealtimeSubscriptionManager`; accept → comanda (+consumos in-store); no item edit/cancel.
- `digital_orders`/`digital_order_items` are in local-first mirror lists (`src/shared/lib/localFirst.ts:38-39,105-106`) — conflicts with online-only.
- Plans: `src/shared/lib/planFeatures.ts` — `profesional` == `empresarial` today.
- CxC: `cuentas_cobrar` (customer_id NOT NULL, factura_id nullable) written client-side only (fiado in `MesaCloseAccountModal.tsx`).
- PDF: only `jspdf` 80mm e-CF (`src/features/fiscal/lib/ecfPrintedPdf.ts`); no A4 report.

## Scope (proposed, pending decisions)
- In: company links table, link-scoped public RPCs, extras toggle per link, per-item cancel in Pedidos, auto CxC on accept for company orders, online-only realtime hardening, A4 statement PDF by date range, `empresarial` gating.
- Out (phase 2): employee roster / identity verification per link, credit limit per company.

## Open decisions
- D1: what "extras" means (add-on modifiers on platos vs extra items beyond a base meal).
- D2: when debt is created (on accept vs on delivered) — recommended: on accept, adjusted by item cancels.
- D3: which public menu hosts links (Vite `/menu/:slug` recommended).

## Design (proposed 2026-10-31)
- D1 RESOLVED (user): extras = priced add-ons attached to a dish (option A). User idea: an "Extras" category the restaurant writes.
  - Model: `platos.is_extra boolean` (explicit flag, not a magic category name; UI shows them under an "Extras" category). Extras keep their own price.
  - Public menu: extras are hidden from the main list. If the link has `allow_extras`, each dish line gets an "Agregar extras" picker.
  - Storage: `digital_order_items.parent_item_id` (extra row points to its dish row). Extra price adds to the employee's order total.
  - Server is the source of truth: the create RPC rejects extras when the link disallows them, re-prices every item from `platos` (never trusts client prices), and rejects extras that are not `is_extra`.
- D2 (recommended): debt is created when the order is accepted, in the same server transaction. One `cuentas_cobrar` row per order (factura_id null, links to digital_order). Cancelling an item (or its extras) lowers that row's `monto_total`; rejecting/cancelling the whole order voids it. Paid orders cannot be edited.
- D3 (recommended): links live on the Vite public menu `/menu/c/:token`; token is random (unguessable), not the tenant slug.
- NEW (user 2026-10-31): custom menus per day, per restaurant. Public menu customizable per day; copy a menu to another link; remove items per link. Example: potatoes today, none tomorrow → not shown tomorrow.
  - Proposed model: `menus` (named set of dishes) + `menu_items`; every link (public slug and company tokens) points to a menu schedule; "Duplicate menu" action; plus a daily "sold out today" toggle per dish that hides it from all menus for that date.
  - D4 RESOLVED (user): Monday–Sunday, with two schedule modes per menu:
    - `recurring`: each dish is assigned to "every day" or specific weekdays (Mon..Sun); repeats every week indefinitely.
    - `weekly`: menu belongs to one specific week (week_start date, Mon..Sun day assignments). When that week ends the link shows NOTHING ("menu not available") so nobody orders from a past week. Duplicate to next week to reuse.
    - Server enforces the schedule in both read and create-order RPCs (restaurant timezone), not only the UI.
- UI (user 2026-10-31): menu admin becomes a LIST of links/menus; "Edit" opens a dedicated full screen to build/customize the menu (not a modal).
- PDF: A4 confirmed by user (not thermal).
- D2 RESOLVED (user): debt on accept (option 1).
- Charging: company orders never go through the cart/checkout; they go straight to CxC. Statement PDF reads those CxC rows.

## Tasks
Route per task recorded as (route / trigger evidence). All code written by agy CLI; Claude reviews diffs and runs checks (user rule).
- [x] T1 Plan gate `menu_links` (empresarial only) + DB migration (menus, menu_items, menu_links, plato_sold_out, platos.is_extra, order/item/CxC columns) + server RPCs (read/create by token with schedule + extras + re-pricing; accept company order → CxC; cancel item → recompute + CxC; statement data). (delegated agy / 2+ non-trivial files)
- [x] T2 Admin UI: list of links/menus + dedicated editor screen (dishes, weekdays, mode recurring/weekly, extras, duplicate menu, sold-out today). (delegated agy)
- [x] T3 Public menu by token `/menu/c/:token`: schedule-aware, extras picker when allowed, employee name, "menu not available". (delegated agy)
- [x] T4 Pedidos: company + employee badge, accept via RPC (CxC), per-item cancel with extras, totals recompute. (delegated agy)
- [x] T5 Online-only: drop digital orders from local-first mirrors, connection banner, realtime reconnect + backfill (desktop + web). (delegated agy)
- [x] T6 Statement PDF A4 (jsPDF): company, date range, rows (date, order #, employee, amount), totals. (delegated agy)
- [ ] T7 E2E coverage of the flow + typecheck/vitest green.
- [ ] T8 Apply migration to Supabase PROD (needs explicit user OK).

## TDD / checks
Mode: off (no project TDD config); runner vitest + `npm run test:sql` (Docker Postgres 16) for SQL. Checks per task: typecheck + vitest (user norm), e2e where flows change.
Known pre-existing failure: `test/local-sync-protocol.test.ts` fails on master too (verified with stash 2026-10-31).

## Delivery
Strategy: ask-on-risk. Forecast > 400 lines → chained PRs.
User rule (2026-10-31): everything must pass CI (`.github/workflows/ci.yml`: typecheck, unit, build, Windows e2e) before merge; then master on remote + local pulled. Add a CI job for `npm run test:sql` (ubuntu has Docker). Master CI was green on 2026-10-24, so `test/local-sync-protocol.test.ts` failing locally is environment-specific (Windows), not a CI blocker — confirm on the PR run.

## Progress
- 2026-10-31: exploration done, document created. D1–D4 resolved.
- 2026-10-31 T1 done (agy wrote, Claude reviewed vs PROD schema read-only; 7 review fixes re-prompted: tenant-mismatch triggers, LATERAL dmi dedupe, cancel guards, pending-order cap, fixed tz, anon grants, redundant index). Evidence: `npm run test:sql` 17 scenarios PASS (run by Claude), planFeatures 7/7, typecheck OK, vitest 1613 pass / 1 pre-existing fail. Migration NOT applied to PROD (T8). Commit: see git log `feat(menu-links): ...`.
- 2026-10-31 T2 done (agy; Claude review found Rules-of-Hooks violation in DigitalMenuPanel and desktop listCatalog dropping is_extra → re-prompted, fixed + test). Evidence: typecheck OK, vitest 1643 pass / 1 pre-existing fail.
- RELEASE GATE: desktop/web now send `platos.is_extra` to the cloud → migration (T8) MUST be applied to PROD before any release containing T2, or plato sync/web saves fail.
- 2026-10-31 T3 done (b49c624) and T6 done (e391bcc), parallel agy agents with disjoint files; reviewed payload (no prices sent) and A4 test (210×297, no item names). Evidence: typecheck OK, vitest 1677 pass / 1 pre-existing local fail.
- 2026-10-31 T4+T5 done: Pedidos company/employee badges, accept via RPC (CxC) + comanda with extras, per-item cancel, digital_orders.comanda_id, mandatory link sucursal, online-only (removed from local-first + SQLite schema), connection bar, reconnect/focus/30s refetch, CI sql-tests job. Review fixes: mandatory sucursal, accept error mapper, comanda_id link. Evidence: typecheck OK, test:sql PASS, vitest 1714 pass / 1 pre-existing local fail, build OK.
- Next: T7 e2e (mock RPCs via Playwright routing so CI does not depend on PROD migration), then PR + CI, T8 needs user OK.
