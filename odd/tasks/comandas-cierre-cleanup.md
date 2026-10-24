# comandas-cierre-cleanup

## Objective
Closing the cash register (cierre de caja) deletes every queued comanda of that business/branch,
locally and in the cloud, and the mirror pull stops failing with "FOREIGN KEY constraint failed".

## Problem / why
- User decision 2026-10-24: "al cerrar la caja se borren todas las comandas que están en cola" (yes).
  Earlier: comandas must not outlive 3 days, they fill the database.
- Evidence 2026-10-24: cloud has 1276 Salpimentao comandas, all `pendiente`, since 2026-09-29, never
  cleaned. Local SQLite (this PC): 314 `pendiente` 19–24 Oct + 251 FK stub comandas (estado NULL).
- Pull error: `applyCloudDeletes` (electron/persistence/cloudApply.ts ~L1179) runs a bare
  `DELETE FROM comandas` while `consumos.comanda_id` / `produccion_cocina.comanda_id` still reference it.
- `listComandas` 3-day purge compares created_at as strings and ignores estado.

## Scope
- Pull delete path: unlink consumos, delete produccion_cocina, then delete the comanda.
- Cierre close: delete all comandas (and their produccion_cocina, unlink consumos) for the tenant and
  branch locally; delete them in the cloud (bulk, not one outbox row per comanda).
- Normalize the 3-day purge date comparison.

## Constraints
- Never delete consumos or facturas; only unlink `comanda_id`.
- Cloud delete must be tenant-scoped and member-checked. Prod migration needs user OK before apply.

## TDD
On (session norm). Runner: `npx vitest run`, `npm run typecheck`.

## Delivery
Branch `fix/comandas-cierre-cleanup` from master e650a11. ask-on-risk.

## Tasks
- [x] T1 Pull delete FK fix for comandas (+ test). Route: delegated writer. Evidence: 86c8ed6, test/local-sqlite-comandas-delete.test.ts (RED: FOREIGN KEY constraint failed, then GREEN).
- [x] T2 Cierre close purges comandas locally + cloud (bulk RPC migration, desktop + web). Route: delegated writer. Evidence: local purge in orders.cycle.close, cloudix_purge_comandas migration 20261024120000 (NOT applied), cierresWrites calls the RPC; tests comandas-cleanup, local-sqlite-cierres-write, purge-comandas-migration, cierresWrites.test.
- [x] T3 3-day purge: datetime-normalized comparison (+ test). Route: same writer. Evidence: b27c0aa, test/comandas-cleanup.test.ts.
- [x] T4 Apply cloud migration (user OK), CI green, merge. Evidence 2026-10-24: user "Si"; applied
      20261024120000 to prod, pg_proc shows prosecdef=true, EXECUTE authenticated/service_role only (no
      anon/PUBLIC); PR #81 CI E2E/Verify/React all pass.

## Progress
- 2026-10-24: diagnosis done (mapper + local/cloud data).

## Next step
T4: user OK to apply migration 20261024120000_purge_comandas_on_cierre.sql, CI, merge.
