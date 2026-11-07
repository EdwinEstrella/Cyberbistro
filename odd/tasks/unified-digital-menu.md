# Feature: unified-digital-menu

## Objective
One sidebar screen "Menú digital" manages both the single public menu (slug) and the company links, and the public menu gets the same per-day calendar (recurring Mon–Sun or a specific week) that company links have.

## Why
The user asked to manage the public menu together with the company links from one sidebar screen (2026-10-31). C-T2 of corporativo-plan misread "sacarlo fuera" and left the public menu in Soporte → "Menú público" without a calendar.

## Decisions (user, 2026-11-01)
- Single sidebar screen "Menú digital": public-menu card on top, company links below.
- Calendar for the public menu: Profesional and above (feature `digital_menu`). Company links stay Empresarial+ (limits 2/6).
- Remove the "Menú público" tab from Soporte.
- Backward compatible: a public menu without an assigned calendar menu keeps showing the legacy `digital_menu_items` list.

## Tasks
- [x] U1 DB: `digital_menu_settings.menu_id` (nullable, same tenant), public menu RPCs serve today's calendar items when set (same rules as links, weekly menu past its week → empty), order creation validates against the same set; SQL tests. (delegated agy)
- [x] U2 UI: unified "Menú digital" screen (public card: slug/QR/enable/assign or create calendar menu → MenuEditorPage; links list with plan gating/upsell), sidebar entry visible from Profesional, Soporte tab removed; vitest + e2e. (delegated agy)
- [ ] U3 CI green, PROD migration (user OK), merge + release.

## Checks
typecheck, vitest, `npm run test:sql`, build, `test/menu-links-public.e2e.spec.ts`. Known local-only failure: test/local-sync-protocol.test.ts.

## Route
Delegated direct (agy) in worktree `../cyberbistro-menu` (another agy runs auto-launch in the main worktree).

## Progress
- 2026-11-01: document created.
- 2026-11-01 U1 (92a60a9): migration 20261106140000_public_menu_calendar (renamed from 20261101160000 after master merge; menu_id + tenant trigger, internal get_menu_today_plato_ids, public RPCs rebuilt from PROD defs; in-store table count now uses the sucursal count like the menu does). Review fix: no EXECUTE to PUBLIC. test:sql 4 suites PASS.
- 2026-11-01 U2: unified screen (PublicMenuAdminCard + links section, Soporte tab removed). Review fix: calendar assign/remove online-only (direct update, TENANT_MISMATCH surfaced), settings save never sends menu_id; removed ad-hoc screenshot spec. Merged master (NewLinkDialog DatePicker conflict resolved). Evidence: typecheck OK, vitest 1857 pass / 1 known local fail, build OK, e2e menu 6/6. PR #92.
- 2026-11-07 Review round 1:
  - 1. BUG sucursal settings precedence in public menu admin (`cbf0f79`): pure function `pickPublicMenuSettings` prioritizing branch row over NULL row, unified cloud/local fallbacks, vitest coverage.
  - 2. Public menu URL helper (`c343464`): `buildPublicMenuUrl(slug)` in `menuLinkUrl.ts` using `DEFAULT_PRODUCTION_WEB_ORIGIN`, replaced hardcoded strings across admin card, calendar save, and orders, with vitest.
  - 3. Container/presentational refactor of PublicMenuAdminCard (`9c7e2a1`): extracted state/handlers to `usePublicMenuAdmin.ts`, separated presentational components in `public-menu/` without DB/sync imports, card down to 140 lines, component test added.
  - 4. SQL migration comments restore (`09f21aa`): restored table code isolation, missing code rejection, pending order double-order prevention, and branch table count validation comments in `create_public_digital_order`.
