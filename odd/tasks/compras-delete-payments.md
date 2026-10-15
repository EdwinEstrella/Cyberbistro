# Feature: compras-delete-payments

## Objective
Deleting an old credit purchase must work and must warn the user when the purchase's payable already has payments. The app-update button must be reachable from every screen.

## Problem / Why
- `purchase.delete` failed with `FOREIGN KEY constraint failed` when the payable had `cxp_pagos` (reported by a client's accountant).
- The delete confirmation does not tell the user that recorded payments will be deleted too.
- The update bell lives in the POS header, which renders only on `/dashboard` (`AppLayout.tsx` `isVentaRoute`), so other screens cannot check for or install updates.

## Scope
- T1: SQLite `purchase.delete` clears `cxp_pagos` before `cuentas_pagar` (local only; cloud cascades).
- T2: Delete-purchase confirmation lists the payments made to that purchase's payable and warns that they will be deleted.
- T3: App-update button moved to the TitleBar (visible on every screen, desktop only); POS bell keeps only pending orders.

## Constraints
- UI copy in Spanish (existing project language), neutral register.
- Do not push a `cxp_pagos` delete to the outbox (cloud FK is ON DELETE CASCADE).
- TDD mode: off (no project/session config). Norm: run `npx tsc --noEmit -p .` and `npx vitest run` after every change; cover logic with tests, extracting pure functions from components.

## Checklist
- [x] T1 — FK fix in `electron/persistence/tenantStore.ts` + test in `test/local-sqlite-compras-sync.test.ts`. Route: inline (1 file + test, understood). Evidence: RED reproduced FK error, GREEN 807/807 vitest, tsc OK. Commit `2492b6d`.
- [x] T2 — Payments warning on purchase delete. Route: delegated writer (writer trigger: Compras.tsx + new lib + test). Evidence: tsc OK, vitest 813 passed. Commit `d3e7f2c`.
- [x] T3 — Update button in TitleBar. Route: delegated writer (same worker; TitleBar.tsx + AppLayout.tsx). Evidence: tsc OK, vitest 818 passed (parent spot check re-ran both). Commit `6188bd9`.

- [x] T4 — When the update is downloaded, the title bar button reads "Reiniciar sistema" and installs on click (user request: visible outside POS, one click). Route: inline (mechanical, 3 small files). Evidence: tsc OK, vitest 819 passed. Commit `455dc7c`.

## Acceptance criteria
- Deleting a purchase with payments shows a warning naming the payment count, total, and dates; confirming deletes it without error.
- Deleting a purchase without payments shows the existing message.
- An update button is visible in the TitleBar on every route in desktop; it reflects available/downloading/ready/error state and triggers the existing `showUpdateBellToast` flow.

## Progress / Next step
All tasks done. RDD off (default) → no native review. Pending: manual visual check in the desktop app (title bar button + delete modal); push/PR is the user's decision.
Known edge: the modal opens before payments load; a user confirming within that instant sees the old message (local read, normally instant).
