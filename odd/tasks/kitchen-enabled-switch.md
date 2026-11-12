# Task: Per-business "has kitchen" switch + register dispatch slip

## Objective
Support businesses that sell already-prepared food and do not operate a kitchen (such as "COMEDOR NUEVO MILENIO").
Provide a per-business setting `kitchen_enabled` (default `true` for all existing and new businesses):
- When `kitchen_enabled = true`: existing behavior remains 100% identical.
- When `kitchen_enabled = false`: no comanda is created or sent to the kitchen screen, kitchen-closed checks do not block orders, and a dispatch slip ("PEDIDO") prints at the register for whoever hands the food out.

## Key Decisions & Architecture
1. **Cloud Schema**:
   - Migration file `supabase/migrations/20261112130000_tenant_kitchen_enabled.sql` adds column `kitchen_enabled boolean NOT NULL DEFAULT true` to `public.tenants`.
   - Migration file written ONLY; NOT applied to any remote or production database.
2. **Local-First Synchronization**:
   - Added `kitchen_enabled` to `LOCAL_TENANT_SETTINGS_COLUMNS` in `electron/persistence/cloudApply.ts`.
   - Added `kitchen_enabled` to `SAFE_TENANT_KEYS` in `src/shared/lib/localFirst.ts` and verified conflict resolution in `localFirst.test.ts`.
3. **Settings (Ajustes)**:
   - Added `kitchen_enabled: boolean` to `AjustesConfig` (`src/features/ajustes/types.ts`).
   - Mapped and normalized in `buildAjustesSavePayload` (`src/features/ajustes/lib/ajustesPayload.ts`).
   - Added toggle to `src/features/ajustes/components/AjustesGeneralTab.tsx` under "Información Básica" titled "Mi negocio tiene cocina" with helper text: *"Si lo desactivás, los pedidos no crean comandas para cocina. Se imprimirá un papelito de pedido por caja para quien despacha."*
   - Defaulted to `true` on initial state and load in `src/features/ajustes/components/Ajustes.tsx`.
4. **Thermal Printer Title Bar Toggle**:
   - Updated visible label in `src/features/window/components/TitleBar.tsx` from "Imprimir Comandas Activo" to `"Imprimir comanda / papelito de pedido"`.
   - Stored key `printComandas` kept intact, governing both kitchen comanda and dispatch slip printing.
5. **Pure Core**:
   - Extended `splitCartByDestination` in `src/features/pos/lib/orderWrites.ts` to accept `kitchenEnabled: boolean = true`. When `false`, returns `kitchenItems: []` and all lines in `directItems`.
   - Parameterized `buildOrderSlipBaseHtml` and added `buildDispatchSlipHtml` in `src/shared/lib/receiptTemplates.ts` with "PEDIDO" title (no "COMANDA" or "COCINA" wording), table number or order type label, items with quantities, notes, date/time, and no prices.
6. **Printer Helper & Tenant Reader**:
   - Created `src/shared/lib/tenantKitchenSettings.ts` with `normalizeKitchenEnabled`, `loadTenantKitchenSettings` (cloud online, local mirror offline, fallback default true), and `useKitchenEnabled` hook.
   - Created `src/shared/lib/dispatchSlip.ts` with `printDispatchSlip` routing to `printThermalHtml(html, { printType: "sales" })` and respecting `printComandas`.
7. **Order Send Paths**:
   - **Camarera (`submitOrder`)**: When `kitchen_enabled` is false, bypasses `cocina_estado` check, skips comanda creation, inserts all consumos as direct/entregado, and prints dispatch slip at the register.
   - **Dashboard POS (`sendToKitchen` and `createInvoice`)**:
     - In `sendToKitchen`: bypasses kitchen-closed check, skips comanda creation, and prints dispatch slip.
     - In `createInvoice` (takeout checkout): bypasses comanda creation in checkout writes and adds dispatch slip to print jobs.
   - **Pedidos (`acceptOrder`)**:
     - Company orders: calls `accept_company_digital_order` RPC, keeps CxC debt intact; when `kitchen_enabled` is false, skips comanda creation and rollback, prints dispatch slip.
     - In-store / takeout digital orders: claims order, skips comanda creation; for in-store orders records consumos as direct/entregado; prints dispatch slip.

## Completed Checklist
- [x] `supabase/migrations/20261112130000_tenant_kitchen_enabled.sql` created.
- [x] Whitelists updated in `cloudApply.ts` and `localFirst.ts`.
- [x] Ajustes types, payload builder, UI toggle, and tests updated.
- [x] TitleBar label updated to "Imprimir comanda / papelito de pedido".
- [x] Pure functions `splitCartByDestination` and `buildDispatchSlipHtml` unit tested.
- [x] `tenantKitchenSettings.ts` and `dispatchSlip.ts` implemented and unit tested.
- [x] 3 send paths wired (Camarera, Dashboard POS, Pedidos accept).
- [x] Untracked directories/files preserved (`docs/comercial`, `docs/sync-incremental-map.md`, `scripts/propuesta`).
- [x] `npx tsc --noEmit` verified clean (code 0).
- [x] Vitest suites verified clean (186 files, 1540 tests passing).

## Pending / Manual List
1. **Apply migration to prod**:
   - File: `supabase/migrations/20261112130000_tenant_kitchen_enabled.sql`.
   - REQUIRES the owner's explicit OK (do NOT apply automatically).
2. **Configure COMEDOR NUEVO MILENIO**:
   - Tenant ID: `f31ec4ec-a0bf-4e96-826a-4be68afdc22f`.
   - Update `kitchen_enabled = false` in production after migration is applied.
3. **Follow-up UI enhancement (optional)**:
   - Conditionally hide or adjust "Cocina" and "Entregas" navigation items in the sidebar when `kitchen_enabled = false`.
4. **Physical thermal printer test**:
   - Verify print output of the dispatch slip on a physical thermal receipt printer (58mm and 80mm).
