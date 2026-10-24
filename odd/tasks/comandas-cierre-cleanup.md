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
- [ ] T1 Pull delete FK fix for comandas (+ test). Route: delegated writer.
- [ ] T2 Cierre close purges comandas locally + cloud (bulk RPC migration, desktop + web). Route: delegated writer.
- [ ] T3 3-day purge: datetime-normalized comparison (+ test). Route: same writer.
- [ ] T4 Apply cloud migration (user OK), CI green, merge.

## Progress
- 2026-10-24: diagnosis done (mapper + local/cloud data).

## Next step
Writer for T1–T3.
