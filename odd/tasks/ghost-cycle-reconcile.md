# Feature: ghost-cycle-reconcile

## Objective
Reconcile and auto-close local "ghost" operating cycles (`cierres_operativos`, `state = 'open'`) in desktop SQLite that the cloud never accepted and that have been superseded by subsequent cloud cycles. Prevent unbounded sales summation in the Cierre screen and eliminate infinite outbox retry storms.

## Problem
A desktop machine can keep a LOCAL operating cycle (`cierres_operativos`, `state = 'open'`) that the cloud never accepted. It stays open forever and, because an open cycle has no end boundary, the Cierre screen sums every sale since it was opened. Real cases observed:
- Master Burgers: local cycle #109 (`167ff8f7-5435-4500-9b06-de0d385eeff7`), opened 2026-09-19T17:40:47Z, state `open`, never present in Supabase and with NO `sync_outbox` row at all. Cloud has its own #109 opened later and closed, and later cycles up to #160.
- Comedor Nuevo Milenio: same pattern on 2026-11-16 (fixed manually).

The sync pull mechanism (`applyCloudOperationalCycleRows`) only upserts cloud rows into SQLite and never inspects local-only rows absent in cloud payloads.

## Scope
- **T1**: Auto-close ghost cycles during sync (main process) + comprehensive SQLite integration tests.
- **T2**: Renumber a cycle-open push rejected by cloud unique index `(tenant_id, cycle_number)` instead of leaving it stuck; treat "Ya existe un ciclo operativo abierto" as a permanent conflict.
- **T3**: Cierre screen: run reconcile before "Cerrar & Imprimir", block close/print of a cycle whose open push is in conflict, and show a toast when a ghost cycle was auto-closed.

## Constraints
1. **Never DELETE anything**: No row in `cierres_operativos`, `sync_outbox`, `facturas`, or any other table is deleted.
2. **Strict table modification boundary**: Only mutate the ghost cycle row (`state = 'closed'`, `closed_at` only), its own `sync_outbox` rows (`error_json` only), and insert an audit row in `sync_errors`. Never touch invoices, payments, or any other tables.
3. **Safety contract**: Act only when ALL of the following hold for a local cycle C:
   - `C.state = 'open'` in local SQLite.
   - C is not legitimately pending: NO `sync_outbox` row for C (`table_name = 'cierres_operativos'`, `row_id = C.id`) has `error_json IS NULL` or a transient error. Candidates are open cycles with 0 outbox rows or whose outbox rows are confirmed conflicts.
   - Cloud query succeeded and confirms `C.id` does NOT exist in `public.cierres_operativos`.
   - Cloud query succeeded and returns at least one cycle for the same tenant and sucursal (`sucursal_id IS NOT DISTINCT FROM C.sucursal_id`, mapping sentinel `'main-process-default'` to `null`) whose `opened_at` is strictly later than `C.opened_at`.
   - If any cloud query errors, times out, or the client is not authenticated/online: abort with zero writes.
4. **No outbox generation**: The reconcile never creates a `sync_outbox` row (the cloud never knew this cycle; nothing must be pushed).
5. **Atomic transaction**: All reconcile writes (closing ghost cycles, updating their outbox rows, inserting `sync_errors` audit rows) run within a single SQLite transaction per run.

## Acceptance Criteria
- Local ghost cycles meeting all safety criteria are closed with `closed_at` set to the `opened_at` of the earliest later cloud cycle for that branch.
- Any existing `sync_outbox` rows for the ghost cycle have their `error_json` merged with `{ "retryable": false, "reason": "ghost_cycle_auto_closed", "ghostCycle": true }` so `payrollSyncStore.claim()` ignores them.
- A descriptive audit row is inserted into `sync_errors` for each closed ghost cycle.
- Normal offline cycles with clean pending or transient error outbox rows are left untouched.
- Reconcile is triggered by `syncWorker` after a successful pull cycle, throttled to at most once every 10 minutes per tenant plus once at worker startup.
- When ghosts are closed, the sync worker emits the local data updated notification so the UI refreshes.

## Checks
- TDD mode: off (no project TDD config; tests mandatory for every behavior).
- Runner: `npx vitest run`.
- Typecheck: `npm run typecheck`.

## Delivery
- Branch: `feat/ghost-cycle-reconcile`.
- Strategy: ask-on-risk.
- Untracked files `docs/comercial/`, `docs/sync-incremental-map.md`, and `scripts/propuesta/` remain untouched.

## Tasks
- [ ] T1 Auto-close ghost cycles during sync (main process) + tests. Route: delegated (agy), trigger: 2+ non-trivial files.
- [ ] T2 Renumber a cycle-open push rejected by the cloud's unique (tenant_id, cycle_number) index instead of leaving it stuck; treat "Ya existe un ciclo operativo abierto" as a permanent conflict. Route: delegated (agy).
- [ ] T3 Cierre screen: run the reconcile before "Cerrar & Imprimir", block close/print of a cycle whose open push is in conflict, and show a toast when a ghost cycle was auto-closed. Route: delegated (agy).

## Progress
- Step 0: Created feature document `odd/tasks/ghost-cycle-reconcile.md` establishing safety contract, constraints, acceptance criteria, and checklist.
- T1: Implemented `electron/persistence/ghostCycleReconcile.ts` (`reconcileGhostCycles`, `findGhostCycleCandidates`, `isConflictOutboxError`, `createSupabaseGhostCycleCloudPort`). Wired into `DurableSyncWorker.pull` in `electron/persistence/syncWorker.ts` with 10-minute per-tenant throttle and worker start execution. Exposed `SQLitePayrollSyncStore.getDatabase()` and `PayrollSyncClient.getGhostCycleCloudPort(tenantId)`. Added comprehensive 19-test suite in `test/local-sqlite-ghost-cycle-reconcile.test.ts`.
- T1 review round 1: Fixed timestamp comparison to be numeric (`Date.parse(...)`), skipping candidates with invalid timestamps; replaced `findLaterCycles` with `findEarliestLaterCycle` returning `{ id, cycle_number, opened_at } | null` with `.order("opened_at", { ascending: true }).limit(1)`; encapsulated reconcile in `DurableSyncStore.reconcileGhostCycles(port)` removing raw SQLite handle leakage from `syncWorker`; restricted port retrieval to `server.getGhostCycleCloudPort(tenantId)`; reverted `getTableClient` visibility to private; documented throttle stamping before network calls; centralized branch sentinel logic in `electron/persistence/branchSentinel.ts` (`LOCAL_BRANCH_SENTINEL`, `toRemoteBranchId`) with unit tests; tightened conflict classifier `isConflictOutboxError` to match real stored shape from `settle(..., "conflicted", classified.conflict)` and reject generic strings. Added full test coverage for all round 1 corrections.
- T1 review round 2: Restored `test/sync-branch-sentinel.test.ts` to exact committed state, moved `LOCAL_BRANCH_SENTINEL` and `toRemoteBranchId` unit tests into dedicated file `test/branch-sentinel.test.ts`; declared and exported named `GhostCycleCandidate` interface used for return type, local candidates array, and `confirmed[].candidate`; removed redundant `state !== 'open'` check in `findGhostCycleCandidates`; removed duplicated candidate `Date.parse` validity check in `reconcileGhostCycles`, keeping only the single-computation `cloudEpoch <= candEpoch` guard.

## Verification evidence
- `git diff --stat -- test/`: clean / empty (0 modified lines in existing test files; new test files untracked).
- `npm run typecheck`: clean (exit code 0).
- `npx vitest run test/local-sqlite-ghost-cycle-reconcile.test.ts test/branch-sentinel.test.ts test/sync-branch-sentinel.test.ts test/durable-sync-worker.test.ts test/payrollSyncClient.test.ts`: 5 test files, 65 tests passed (exit code 0).
- `npm test`: 357 test files passed, 1 skipped (358 total); 2934 tests passed, 2 skipped (exit code 0).
- `graphify update .`: completed, code graph refreshed to 11279 nodes, 23480 edges, 821 communities (exit code 0).

## Next step
Execute T2: Renumber a cycle-open push rejected by the cloud's unique (tenant_id, cycle_number) index instead of leaving it stuck; treat "Ya existe un ciclo operativo abierto" as a permanent conflict.
