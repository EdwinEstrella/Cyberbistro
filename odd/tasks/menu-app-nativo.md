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
- [ ] **T2**: Dish detail bottom sheet (photo hero, price, description, kitchen note, qty stepper, "Agregar RD$X").
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

## Evidence
- `npm run typecheck`: clean exit code 0.
- `npx vitest run --config vitest.config.ts src/features/digital-menu`: 42 test files passed, 327 tests passed cleanly (0 failed).

## Next Step
- T2: Dish detail bottom sheet (photo hero, price, description, kitchen note, qty stepper, "Agregar RD$X").
