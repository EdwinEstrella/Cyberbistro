# Feature: menu-publico-movil

## Objective
Provide a public mobile-first digital menu interface for restaurant customers with dedicated table and takeout modes. Table mode enables customers to browse the menu, select party size, verify table security codes, place orders directly, call a waiter, request the bill, access utilities (Wi-Fi, WhatsApp, social networks, Google reviews, directions, suggestions), and play casual games while waiting. Takeout mode serves orders and contact options without in-store table interactions. Staff receives real-time audible and visual alerts for waiter/bill requests on the Mesas screen.

## Decisions (Single Source of Truth)
- **Table Mode URL & Security**:
  - Each physical table has its own QR code pointing to `/menu/<slug>?mesa=N`.
  - The 4-digit table security code (`mesas_estado.codigo_seguridad`) is retained and must be entered by the customer when sending an order or submitting a service request ("Call waiter", "Ask for the bill").
- **Customer Home Screen (Table Mode)**:
  - Layout: Logo at the top, table number at the bottom.
  - Party size selector: 1..6 plus a "+" option for larger groups (stored in `digital_orders.party_size` and displayed on table cards).
  - Main call-to-action button: "Ver menu y ordenar".
  - 8 utility buttons:
    1. Call waiter (enabled only when at least one waiter is online via Realtime Presence).
    2. Ask for the bill.
    3. Games (Memory, Tic-tac-toe, Snake, 2048 - lazy-loaded).
    4. Wi-Fi (SSID + password copy).
    5. Save our WhatsApp.
    6. Social networks (Instagram, Facebook, TikTok).
    7. Rate us on Google.
    8. How to get there (Maps URL).
    - Plus: Suggestions box.
- **Takeout Mode URL**:
  - General link without `?mesa`: serves menu and business contacts only (WhatsApp, socials, Google review, Google Maps).
  - Excludes waiter call, bill request, party size, and games.
- **Service Requests ("Call waiter" & "Ask for the bill")**:
  - Stored in `public.service_requests` with kind `'waiter'` or `'bill'`.
  - Enforces at most one active `pending` request per table and kind via a partial unique index.
  - Generates staff alerts (bell icon + sound) in the Mesas screen. The first staff member (waiter/cashier/admin) to attend clears the alert for everyone.
- **Suggestions Workflow**:
  - Customer suggestions are stored in `public.menu_suggestions`.
  - Rate-limited to at most 10 suggestions per tenant per rolling hour.
  - Asynchronously forwarded by email (via Edge Function + Resend) to the address configured in public menu settings (`digital_menu_settings.public_contact->>'suggestion_email'`, defaulting to the owner account email).
  - Email sender: `sugerencias@mail.azokia.com`. Resend API key is stored by the user as a secret in Dokploy.
- **Migration & Deployment Safety**:
  - Production migrations require explicit user approval and must be applied before deploying frontend UI that depends on them.
  - No secrets (such as table security codes or `suggestion_email`) are exposed to anonymous callers.

## Tasks
- [x] **T1**: Cloud schema + RPCs (`supabase/migrations/20261110180000_public_menu_service.sql` + SQL test suite — not applied to prod).
  - [x] Migration written
  - [x] SQL tests pass via `bash scripts/test-sql.sh`
  - [x] Typecheck passes (`npm run typecheck`)
- [x] **T2**: Menu settings fields (`public_contact`: wifi, whatsapp, instagram/facebook/tiktok, google review url, maps url, suggestion email) + per-table QR generator page in Ajustes.
  - [x] Types + persistence: `PublicContact` interface, `digital_menu_settings.public_contact` handling in `savePublicMenuSettings`.
  - [x] Helper `normalizePublicContact` with validation, trimming, empty dropping and Spanish errors.
  - [x] Hook `usePublicMenuSettings` with validation blocking and toast notification.
  - [x] Presentational `PublicMenuSettingsForm` with "Información para tus clientes" 9 inputs and inline errors.
  - [x] URL helper `buildTableMenuUrl` with validation.
  - [x] Presentational `PublicMenuTableQrSection` + `usePublicMenuTableQrs` hook (lazy generation, per-table download, print all sheet, empty-count message).
  - [x] Integrated into `PublicMenuAdminCard` with table count resolution.
  - [x] Tests passing in `src/features/digital-menu` and `src/features/menu-links` (152/152).
  - [x] `npm run typecheck` passed cleanly.
- [x] **T3**: Public mobile home screen (table + takeout modes, party selector 1..6+, mobile-first layout).
  - [x] Pure mode resolver `resolvePublicMenuMode` with strict integer validation (`publicMenuMode.ts` + tests).
  - [x] Contact links, vCard generator, and utility actions resolver (`contactLinks.ts` + tests).
  - [x] Presentational `PublicMenuHome` (table & takeout modes, brand logo/initials, utility grid, bottom sheets).
  - [x] Accessible `PartySizePicker` (1..6 buttons + stepper 7..99, disabled CTA until chosen).
  - [x] Standalone accessible `BottomSheet` with `WifiSheet`, `WhatsAppSheet`, and `SocialSheet`.
  - [x] Extracted `PublicMenuOrderScreen` and `PublicMenuCartPanel` preserving menu/cart/active-order logic and adding return to home navigation and context badges.
  - [x] `create_public_digital_order` accepts `p_party_size`, table number, and order type based on mode.
  - [x] Full test suite (26 files, 202 tests) passing; `npm run typecheck` passing.
- [ ] **T4**: Call waiter and bill client flows with Realtime Presence waiter availability check.
- [ ] **T5**: Staff alerts on Mesas screen (bell indicator + sound + attend action clearing for all).
- [ ] **T6**: Four casual games (Memory, Tic-tac-toe, Snake, 2048) implemented as lazy-loaded components.
- [ ] **T7**: Suggestions UI + Edge Function email forwarding via Resend (`sugerencias@mail.azokia.com`).
- [ ] **T8**: Phone viewport verification with screenshots and release.

## Acceptance Criteria (T1 Cloud Schema & RPCs)
- [x] `digital_menu_settings` includes `public_contact jsonb NOT NULL DEFAULT '{}'::jsonb`.
- [x] `digital_orders` includes `party_size integer NULL CHECK (party_size BETWEEN 1 AND 99)`.
- [x] `public.service_requests` table exists with status check, kind check, foreign keys, and partial unique index on `(tenant_id, COALESCE(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid), mesa_numero, kind) WHERE status = 'pending'`.
- [x] `public.menu_suggestions` table exists with message length 1..1000, contact <= 120, email_status check.
- [x] RLS blocks `anon` direct SELECT/INSERT/UPDATE/DELETE on `service_requests` and `menu_suggestions`. Authenticated staff can SELECT and UPDATE `service_requests` and SELECT `menu_suggestions`.
- [x] RPC `create_public_service_request` validates table code against `mesas_estado.codigo_seguridad`, checks open cycle via `restaurant_cycle_open`, and idempotently returns `{"id": ..., "already_pending": true}` if a request is already pending.
- [x] RPC `create_public_suggestion` trims input, validates message length, enforces 10/hour rate limit per tenant, and inserts pending record.
- [x] RPC `get_public_digital_menu` returns sanitized `contact` stripping `suggestion_email`.
- [x] RPC `create_public_digital_order` accepts optional 10th parameter `p_party_size`, validates 1..99, and maintains backwards compatibility for 9-parameter callers.
- [x] SQL test suite covers all edge cases and assertions.

## Checks
- `npm run typecheck`
- `npm run test:sql`
