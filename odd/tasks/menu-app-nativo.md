# Feature: menu-app-nativo

## Objective
Transform the public digital menu (`/menu/:slug`) and subsequently the company menu (`/menu/c/:token`) into an experience that looks and feels like a native ordering app (Uber Eats-like) using the CyberBistro app theme. Driven by client COMEDOR NUEVO MILENIO.

## Decisions (Single Source of Truth)
- **Design & Theme**:
  - Adopt the official CyberBistro app theme tokens (dark canvas `#0e0e0e`, deep `#0a0a0a`, surface `#131313`, elevated `#1a1a1a`, border `#262626`, coral accent `#ff906d` with `#5b1600` text, open green `#59ee50`, Space Grotesk headings, Inter body), replacing legacy LicenHub/emerald colors in the public customer-facing app.
  - Desktop view preserves a centered mobile device column (max 480px) on `#0a0a0a` deep background.
- **Dish Photos & Visuals**:
  - Real restaurant photos uploaded from the admin, never stock photography.
  - Dishes without photo display a category icon fallback on `#1a1a1a` surface (Bebidas → CupSoda, Postres → IceCreamCone, Almuerzos/Platos → UtensilsCrossed, Acompañantes → Salad, default → UtensilsCrossed).
- **Dish Composition Scope**:
  - Build-your-lunch / dish composition ("Arma tu almuerzo") is strictly OUT of scope for this feature (queued in Engram topic `digital-menu/dish-composition-queue`).
- **Photo Storage Target**:
  - Cloudflare R2 (user decision 2026-11-17) via presigned upload URLs issued server-side. R2 credentials are never shipped to the client browser.
- **TDD & Checks**:
  - TDD: off (no project TDD config). Ordinary verification checks: `npm run typecheck` and `npx vitest run --config vitest.config.ts src/features/digital-menu`.
- **Delivery Strategy**:
  - Ask-on-risk.

## Tasks
- [x] **T1**: CyberBistro theme tokens + app-like home (header with open status, search, floating "Ver pedido" bar, tab bar).
  - [x] CyberBistro design tokens in `publicMenuTheme.ts` (accent coral `#ff906d`, dark backgrounds, open green `#59ee50`, Space Grotesk/Inter fonts).
  - [x] Google Fonts loader for Space Grotesk and Inter scoped to the public menu route (`usePublicMenuFonts.ts`).
  - [x] Search filter input with pure accent/case-insensitive search function (`searchDishes.ts` + unit tests).
  - [x] Category icon mapping helper (`categoryIcons.ts` + unit tests).
  - [x] AppTopBar updated with restaurant name (Space Grotesk 22px/800), open/closed status indicator, and delivery/takeout mode toggle.
  - [x] DishRow redesigned with 84px rounded-[16px] thumbnail on the right, category icon fallback for missing photos, and add button over thumbnail corner.
  - [x] Floating cart bar component (`FloatingCartBar.tsx` + unit tests) ("Ver pedido · N", total "RD$X") docked above tab bar opening existing CartDrawer.
  - [x] Update public app components and test suite; ensure zero regression on existing flows.
- [x] **T2**: Dish detail bottom sheet (photo hero, price, description, kitchen note, qty stepper, "Agregar RD$X").
- [ ] **T3**: Optimized dish photo upload in admin (accept PNG/JPG/WebP/HEIC-if-decodable, camera capture on mobile, client-side square center crop, resize to max 800px, encode WebP ~0.82, keep alpha for transparent PNG). Storage target: Cloudflare R2 via presigned upload URL issued server-side; never ship R2 keys to the browser.
- [ ] **T4**: Post-order screen "¡Pedido enviado!" + 3-step tracker + "¿Lo acompañas con algo?" upsell (adds to same order).
- [ ] **T5**: "Lo pediste recientemente" (needs customer identity: phone or company link token).
- [ ] **T6**: PWA manifest (installable).
- [ ] **T7**: Unify LinkDigitalMenu (company menu) onto the shared public-app components.

## Progress
- Feature specification created in `odd/tasks/menu-app-nativo.md`.
- CyberBistro theme tokens rewritten in `publicMenuTheme.ts` with backward-compatible aliases for legacy callers.
- Scoped Google Fonts injection implemented via `usePublicMenuFonts.ts`.
- Pure search filter (`searchDishes.ts`) and category icon resolution (`categoryIcons.ts`) implemented with comprehensive test coverage.
- `AppTopBar` redesigned with Space Grotesk 22px/800 title, pulse open status indicator, and Para llevar / Delivery mode toggle.
- `DishRow` redesigned with 84px rounded-[16px] thumbnail on the right, category icon fallback on `#1a1a1a`, coral price, and add button positioned over the thumbnail corner.
- `FloatingCartBar` implemented and integrated into `PublicMenuOrderScreen` above `BottomTabBar`.
- Replaced hardcoded LicenHub/emerald colors across public customer screens with CyberBistro palette.
- Dish detail bottom sheet (`DishDetailSheet.tsx` + `DishDetailSheet.test.tsx`) implemented with CyberBistro tokens: 200px hero with DishImage / category fallback, 40px round close button, Space Grotesk 24px/800 title, coral 18px/700 price, optional description, kitchen notes textarea (max 300 chars), stepper pill (min 1, max 99, ≥44px touch targets), and full-width primary button (`bg #fafafa text #0e0e0e rounded-full`) showing "Agregar" and line total.
- Pure cart operations implemented in `cartOperations.ts` (`addToCartWithNote`) with unit tests: maintains one line per `plato_id`, adds quantity with cap at 99, trims and sets/replaces/clears kitchen notes.
- Wired through `onAddItemWithDetails` in `PublicDigitalMenu` and `PublicMenuOrderScreen`.
- `DishRow` updated to open `DishDetailSheet` on row body tap while quick-add "+" and stepper stop propagation.
- `CartDrawer` updated to render per-line kitchen notes (`#adaaaa`, small, truncated) under dish name.
- T2 Round 1 corrections applied:
  - DishRow accessibility restructured: removed `role="button"` and tabIndex from `<article>`, wrapped info + thumbnail in a real `<button aria-haspopup="dialog">`, made quick-add "+" and stepper group sibling overlays at `right-2.5 bottom-2.5`, removed stopPropagation and keydown handlers.
  - Shared `useSheetDialog` hook implemented (`src/features/digital-menu/hooks/useSheetDialog.ts`) with stable `onClose` ref and `[isOpen]` dependency to prevent re-render focus stealing, integrated into both `DishDetailSheet` and `BottomSheet` (which gained body scroll lock).
  - Removed state-resetting `useEffect` in `DishDetailSheet`, initialized with `useState`, and keyed the sheet by `selectedDishForDetail?.plato_id ?? "none"` in `PublicMenuOrderScreen` so background cart updates never wipe typed notes or quantities.
  - Made `onAddItemWithDetails` a required prop in `PublicMenuOrderScreen` and deleted silent fallback loop that dropped notes.
  - Updated "Nota para cocina" label to `text-sm font-bold text-[#fafafa]` (normal case).
  - Consolidated fake DOM test infrastructure into `src/features/digital-menu/test-utils/fakeDom.ts` and refactored all test suites (`CartDrawer.test.tsx`, `DishRow.test.tsx`, `PublicMenuOrderScreen.test.tsx`, `DishDetailSheet.test.tsx`, `useSheetDialog.test.tsx`).

## Evidence
npm run typecheck clean; vitest digital-menu 45 files / 359 tests passed; reviewed by Claude in 2 correction rounds (row is a real button with sibling quick-add, shared useSheetDialog hook fixes focus-jump and adds scroll lock, sheet state keyed by plato_id, required onAddItemWithDetails, shared fakeDom test util).

## Next Step
T3
