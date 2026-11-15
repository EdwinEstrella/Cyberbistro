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
- [x] **T3b**: App-style redesign of public menu inspired by LicenHub (near-black #09090b canvas, #0b0b0d device frame, surfaces #111113/#18181b, emerald #34d399 accent, white primary buttons).
  - [x] Single device column (max 480px) on every screen size with sticky top bar, category chips, dish list, bottom tab bar, and cart drawer.
  - [x] Reusable design tokens in `publicMenuTheme.ts`.
  - [x] Sticky `AppTopBar` with restaurant identity, context chip (table/takeout with quick navigation), and cart badge button.
  - [x] Sticky `CategoryChips` with horizontal snap scroll and search field.
  - [x] Compact horizontal `DishRow` with thumbnail, 2-line clamp description, emerald price, and round add button becoming inline stepper (− n +) when in cart.
  - [x] Fixed `BottomTabBar` (safe-area aware, 3 tabs: Menú, Servicios/Info, Pedido drawer trigger with badge).
  - [x] `CartDrawer` sliding from column's right edge over backdrop blur: items, steppers, "Vaciar", 4-digit table code, customer fields, white "Pedir →" button (absence of "Pagar"), success state.
  - [x] `ServicesTab` rendering utility actions with LicenHub emerald icon chips.
  - [x] Component unit tests for `CategoryChips`, `DishRow`, `BottomTabBar`, and `CartDrawer` + absence of "Pagar".
  - [x] Full test suite (32 files, 237 tests) passing; `npm run typecheck` passing cleanly.
- [x] **T4**: Call waiter and bill client flows with Realtime Presence waiter availability check.
  - [x] Pure libs: `serviceRequests.ts` (RPC args builder, 4-digit code validator, result parser, Spanish error mapper) and `waiterPresence.ts` (channel name generator `waiters:<tenant_id>`, staff role checker `mesero`/`cajera`/`admin`, presence counter ignoring malformed entries).
  - [x] Hooks: `useWaiterAvailability` (anonymous read-only presence subscriber, fail-open when unknown, never calls `track()`), `useWaiterPresencePublisher` (staff presence broadcast in `AppLayout`, random per-tab key, role and timestamp only with no PII), and `useServiceRequest` (state machine `idle|sending|sent|already_pending|error`, double submit prevention, RPC caller with code validation).
  - [x] Components: `ServiceRequestButtons` (LicenHub card style, disabled waiter CTA with hint when 0 waiters online, bill button never blocked), `ServiceRequestSheet` (`BottomSheet` with numeric 4-digit code input, inline errors, sent and already_pending confirmation states), and `ServiceRequestPanel` (container composing hooks, buttons and sheet).
  - [x] Integration: table mode only in `PublicMenuHome` (above `UtilityButtonGrid`) and `ServicesTab` (threaded through `PublicMenuOrderScreen` and `PublicDigitalMenu`). Never rendered in takeout mode.
  - [x] Unit tests: `serviceRequests.test.ts`, `waiterPresence.test.ts`, `ServiceRequestButtons.test.tsx`, `ServiceRequestSheet.test.tsx`, and `PublicMenuHome.test.tsx` (30 test files, 217 tests passing); `npm run typecheck` passing cleanly.
  - **T4 notes**:
    - Presence channel: `waiters:<tenant_id>`.
    - Fail-open policy: when presence availability is unknown (connecting or channel error/timeout), the waiter call button remains enabled so network glitches never block customers.
    - Anon read-only: diner hook `useWaiterAvailability` never calls `track()`.
    - Privacy: staff presence payload strictly contains `{ role, at }` with no PII (no names, emails, or user IDs).
    - Manual verification pending: staff presence publishing and real-time WebSocket presence synchronization require manual end-to-end verification in T8.
- [x] **T5**: Staff alerts on Mesas screen (bell indicator + sound + attend action clearing for all).
  - [x] Pure libs: `serviceAlerts.ts` (`parseServiceAlertRow`, `sortServiceAlerts`, `applyServiceRequestEvent`, `shouldPlayAlertSound`, `describeServiceAlert`, `formatWaitTime`) and `alertSound.ts` (`playServiceAlertSound`).
  - [x] Hook: `useServiceRequestAlerts` (reconnection + `visibilitychange` reconciliation, guards `isDesktopCloudUnavailable` + `navigator.onLine`, non-optimistic `attend` clearing locally on success or race update).
  - [x] Components: presentational `ServiceAlertsBell` (accessible button, pulse animation, popover list, wait times, attending state, inline error) and `ServiceAlertsBellContainer` (role-guarded via `isWaiterPresenceRole`, 30s tick).
  - [x] Tables integration: mounted container in `Tables.tsx` header + table card alert indicator (`hasPendingAlert` on `TableMesaCard`).
  - [x] Tests: unit tests for pure lib (`serviceAlerts.test.ts`), `ServiceAlertsBell.test.tsx`, `TableMesaCard.test.tsx`, and `ServiceAlertsBellContainer.test.tsx` (35 test files, 278 tests passing across `src/features/tables`, `src/features/digital-menu`, `src/app`).
  - **T5 notes**:
    - Channel: `service_requests:<tenant_id>`.
    - First attend clears for everyone: atomic UPDATE with `status = 'pending'` clears locally on success or 0 updated rows; Realtime `UPDATE_service_request` broadcast echo clears for all other connected staff.
    - Sound only on new INSERT: `shouldPlayAlertSound` plays chime only for INSERT events of pending requests not already in the alerts array (replays and updates do not trigger sound).
    - Scope: staff alerts live in the Mesas screen only; other screens do not alert.
    - Reconciliation: missed events reconcile automatically when tab returns to focus (`visibilitychange`) or reconnects (`SUBSCRIBED`).
    - Manual verification pending: real end-to-end realtime delivery + sound still needs a manual check in T8.
- [x] **T6**: Four casual games (Memory, Tic-tac-toe, Snake, 2048) implemented as lazy-loaded components.
  - [x] Pure deterministic logic with injectable RNG: `memory.ts`, `ticTacToe.ts`, `snake.ts`, `game2048.ts` under `src/features/digital-menu/lib/games/`.
  - [x] Focused unit test suite for all 4 games (shuffle pairs, flip, match, win; winning lines, draw, CPU minimax-light; step, growth, food off-snake, wall/self collision, 180° guard; slide+merge 4 directions, merge-once-per-move, spawn, game over, score).
  - [x] Container-presentational architecture: lazy-loaded components with `React.lazy` and `Suspense` (`GameSkeleton`) under `src/features/digital-menu/components/public-app/games/`.
  - [x] Mobile-first phone controls: swipe gestures + on-screen D-Pad buttons for Snake and 2048, snake interval paused on `visibilitychange` hidden and unmount.
  - [x] Minimal wiring: "Juegos" action added for table mode only in `contactLinks.ts`, `UtilityButtonGrid.tsx`, `ServicesTab.tsx`, and `PublicMenuHome.tsx` (excluded in takeout mode).
  - [x] All 41 test files (332 tests) and `npm run typecheck` passing cleanly.
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
