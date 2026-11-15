# Feature: menu-entrega-domicilio

## Objective
Public menu customers (public link, NOT company links) can order for home delivery by sharing their location
("Usar mi ubicación actual") or picking it themselves on a map, plus a free-text reference point. The order arrives
at the Pedidos screen with that location, and company orders are visibly distinct and listed first (priority).

## Decisions (Single Source of Truth)
- Delivery applies only to the public takeout flow (`order_type` = `takeout`). Table mode (`in_store`) and company
  links (`company`) never ask for a location (the company address is already known) — user decision 2026-11-14.
- A takeout order is either **pickup** (today's behavior) or **delivery** (new). Stored as `digital_orders.delivery_mode`
  (`pickup` | `delivery`), so existing `order_type` values and constraints keep working.
- Location data on the order: `delivery_lat`, `delivery_lng` (nullable numeric), `delivery_reference` (free text, max 300).
  Delivery requires at least a reference text OR coordinates (validated in the RPC, not only the UI).
- Map: Leaflet + OpenStreetMap tiles (no API key, no cost). Geolocation via `navigator.geolocation` with graceful
  fallback to manual pin when denied/unavailable.
- Priority: in Pedidos, pending company orders sort before pending public orders; within each group, oldest first for
  pending (they wait longest), newest first for the rest. "Empresa" badge already exists.
- Staff side shows delivery address (reference + "Abrir en Google Maps" link built from lat/lng) and prints it on the
  comanda notes.
- TDD: not configured for this repo (ordinary functional checks: `npx tsc --noEmit`, `npx vitest run`). Source: project.
- Prod DB: migration is written as a file; applying it to prod requires the user's explicit OK.

## Tasks
- [ ] **T1**: Priority ordering in Pedidos (pure `sortOrdersForQueue` helper + tests; company pending first).
- [ ] **T2**: Cloud schema + RPC: `delivery_mode`, `delivery_lat`, `delivery_lng`, `delivery_reference` on `digital_orders`;
      `create_public_digital_order` accepts the new params and validates them; SQL test (migration file only, not applied).
- [ ] **T3**: Payload builder (`buildCreateOrderRpcArgs`) + pure validation helper for the delivery form + tests.
- [ ] **T4**: Public menu UI: pickup/delivery selector in takeout checkout, "Usar mi ubicación" button, Leaflet map picker,
      reference field, geolocation error states.
- [ ] **T5**: Pedidos UI: delivery badge, address block, Google Maps link; comanda notes include the address.
- [ ] **T6**: Verification end to end (typecheck, full suite, manual run of the public menu) + hand off migration for prod.

## Progress / Evidence
(none yet)

## Next step
T1.
