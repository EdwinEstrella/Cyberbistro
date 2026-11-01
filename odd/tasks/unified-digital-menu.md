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
- [ ] U2 UI: unified "Menú digital" screen (public card: slug/QR/enable/assign or create calendar menu → MenuEditorPage; links list with plan gating/upsell), sidebar entry visible from Profesional, Soporte tab removed; vitest + e2e. (delegated agy)
- [ ] U3 CI green, PROD migration (user OK), merge + release.

## Checks
typecheck, vitest, `npm run test:sql`, build, `test/menu-links-public.e2e.spec.ts`. Known local-only failure: test/local-sync-protocol.test.ts.

## Route
Delegated direct (agy) in worktree `../cyberbistro-menu` (another agy runs auto-launch in the main worktree).

## Progress
- 2026-11-01: document created.
