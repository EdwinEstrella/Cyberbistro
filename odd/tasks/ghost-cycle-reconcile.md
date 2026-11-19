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
- [x] T1 Auto-close ghost cycles during sync (main process) + tests. Evidence: commit be6084d; full suite 357 files / 2934 tests green; typecheck clean. Route: delegated (agy), trigger: 2+ non-trivial files.
- [x] T2 Renumber a cycle-open push rejected by the cloud's unique (tenant_id, cycle_number) index instead of leaving it stuck; treat "Ya existe un ciclo operativo abierto" as a permanent conflict. Evidence: test/cycle-open-renumber.test.ts 15 tests green; full suite 358 files / 2949 tests green; typecheck clean. Route: delegated (agy).
- [x] T3 Cierre screen: run the reconcile before "Cerrar & Imprimir", block close/print of a cycle whose open push is in conflict, and show a toast when a ghost cycle was auto-closed. Evidence: 11 test files / 69 tests passed; full suite 361 test files / 2980 tests passed; typecheck clean. Route: delegated (agy), trigger: 2+ non-trivial files.

## Progress
- Step 0: Created feature document `odd/tasks/ghost-cycle-reconcile.md` establishing safety contract, constraints, acceptance criteria, and checklist.
- T1: Implemented `electron/persistence/ghostCycleReconcile.ts` (`reconcileGhostCycles`, `findGhostCycleCandidates`, `isConflictOutboxError`, `createSupabaseGhostCycleCloudPort`). Wired into `DurableSyncWorker.pull` in `electron/persistence/syncWorker.ts` with 10-minute per-tenant throttle and worker start execution. Exposed `SQLitePayrollSyncStore.getDatabase()` and `PayrollSyncClient.getGhostCycleCloudPort(tenantId)`. Added comprehensive 19-test suite in `test/local-sqlite-ghost-cycle-reconcile.test.ts`.
- T1 review round 1: Fixed timestamp comparison to be numeric (`Date.parse(...)`), skipping candidates with invalid timestamps; replaced `findLaterCycles` with `findEarliestLaterCycle` returning `{ id, cycle_number, opened_at } | null` with `.order("opened_at", { ascending: true }).limit(1)`; encapsulated reconcile in `DurableSyncStore.reconcileGhostCycles(port)` removing raw SQLite handle leakage from `syncWorker`; restricted port retrieval to `server.getGhostCycleCloudPort(tenantId)`; reverted `getTableClient` visibility to private; documented throttle stamping before network calls; centralized branch sentinel logic in `electron/persistence/branchSentinel.ts` (`LOCAL_BRANCH_SENTINEL`, `toRemoteBranchId`) with unit tests; tightened conflict classifier `isConflictOutboxError` to match real stored shape from `settle(..., "conflicted", classified.conflict)` and reject generic strings. Added full test coverage for all round 1 corrections.
- T1 review round 2: Restored `test/sync-branch-sentinel.test.ts` to exact committed state, moved `LOCAL_BRANCH_SENTINEL` and `toRemoteBranchId` unit tests into dedicated file `test/branch-sentinel.test.ts`; declared and exported named `GhostCycleCandidate` interface used for return type, local candidates array, and `confirmed[].candidate`; removed redundant `state !== 'open'` check in `findGhostCycleCandidates`; removed duplicated candidate `Date.parse` validity check in `reconcileGhostCycles`, keeping only the single-computation `cloudEpoch <= candEpoch` guard.
- T2: Implemented cycle-open renumbering and P0001 permanent conflict handling:
  1. `electron/persistence/payrollSyncClient.ts`: Added `isCycleNumberConflict(error)` distinguishing `23505` unique index `cierres_operativos_unique_cycle` / `cycle_number` from primary key / id conflicts (`cierres_operativos_pkey`, `key (id)=`, `primary key`, `id_pkey`).
  2. `pushOperationalCycle`: On 23505 cycle conflict during `orders.cycle.open` push, reads tenant cloud max `cycle_number` (`select cycle_number order desc limit 1`) and retries up to 3 total attempts with `cycle_number = cloudMax + 1`. On success returns `{ synced: true, id, remoteTable: 'cierres_operativos', renumberedCycleNumber }`. On exhausted attempts or read failure, falls back to `classifyRemoteError` conflict.
  3. `classifyRemoteError`: For `cierres_operativos`, classifies `P0001` and messages containing `"ya existe un ciclo operativo abierto"` as `{ conflict }` instead of throwing transient retry.
  4. `electron/persistence/payrollSyncStore.ts`: In `settle("synced")`, when `renumberedCycleNumber` is present for `cierres_operativos`, updates local `cierres_operativos.cycle_number` for that row only, and updates `cycleNumber` in `payload_json` of any still-pending outbox rows for that cycle id within the same transaction. Logs `[sync↑] cierres_operativos <id> → ciclo renumerado #<old> → #<new>`.
  5. Added comprehensive test suite in `test/cycle-open-renumber.test.ts` (15 tests) verifying classifier, renumber attempts, exhaustion, max read failure, id conflicts, P0001 conflicts, store settle atomicity, and end-to-end sync worker push.
- T2 review round 1:
  1. `electron/persistence/payrollSyncClient.ts`: Restored strict typing on `ClientOverride` (`from(table: string): RemoteMutationBuilder`), added typed optional select read chain to `RemoteMutationBuilder` matching Supabase builder shape, eliminated all `(queryClient as any)` casts, and updated test fakes to conform.
  2. Extracted renumber flow out of `push`: `fetchCloudMaxCycleNumber(tenantId)` (returns `null` on errors, missing select support, empty data, or non-finite values) and `upsertCycleOpenWithRenumber(operation, row)` using named constant `MAX_CYCLE_OPEN_ATTEMPTS = 3`, simplifying the `orders.cycle.open` push branch to a single call.
  3. Tightened `isCycleNumberConflict`: requires `code === "23505"` or message containing `"duplicate key"` (dropped `"already exists"`), retaining id/pkey exclusions and cycle constraint checks.
  4. Tightened P0001 rule in `classifyRemoteError`: for `cierres_operativos`, classifies as conflict only when message contains `"ya existe un ciclo operativo abierto"` (case-insensitive) regardless of code; bare P0001 with unrelated messages keeps existing transient retry classification across all tables.
  5. `electron/persistence/payrollSyncStore.ts`: Extracted renumbering block in `settle` to private method `applyCycleRenumber(cycleId, settledOutboxId, newCycleNumber)` preparing statements once per call within the same transaction, and removed dead `cycle_number` payload branch (only camelCase `cycleNumber` exists in codebase writers).
  6. Adapted `test/cycle-open-renumber.test.ts` (16 tests) with conforming builder fakes, missing select handling, tightened conflict rules, and updated test descriptions.
- T3: Cierre screen guard, IPC requests, and ghost-cycle toast notification:
  1. Main & Sync Orchestration: Added `reconcileGhostCyclesNow()` to `DurableSyncWorker` and `PayrollSyncOrchestrator` to bypass the 10-minute throttle while recording the throttle stamp; added `onGhostCyclesClosed` callback emitting `ghost-cycles-closed` IPC event with payload `[{ cycleNumber, closedAt, supersededByCycleNumber }]` whenever reconcile closes >=1 cycle.
  2. IPC: Exposed `cierres.reconcileGhostCycles` and `cierres.cycleSyncStatus` in `electron/persistence/ipc.ts` (handled via `registerOrdersRepositoryIpc`) with sender trust verification and safe error wrapping (returns `{ ok: false, reason: "unavailable" | "offline" | "error" }`, never throwing to renderer).
  3. SQLite Store: Added `getCycleSyncStatus(cycleId)` on `TenantStore` and `TenantStoreController` to inspect `sync_outbox` for conflicts via `isConflictOutboxError` or `ghostCycle: true`.
  4. Preload & Types: Exposed `reconcileGhostCycles`, `cycleSyncStatus`, and `onGhostCyclesClosed` on `window.electronAPI` in `electron/preload.ts`, `electron/preload.cjs`, and `src/shared/types/electron.d.ts`.
  5. Renderer Guard: Created pure function `decideCloseGuard` in `src/features/cierre/lib/cierreCloseGuard.ts` and adapter `runCierreCloseGuard` in `src/features/cierre/lib/cierreGuardAdapter.ts`, wired in `Cierre.tsx` `handleCerrarCiclo` before computing totals/printing.
  6. Global Toast Notification: Created `src/features/cierre/lib/useGhostCyclesToast.ts` mounted app-wide in `src/app/App.tsx`, triggering `sonner` warning toast with exact Spanish wording per auto-closed ghost cycle.
  7. Tests: Added `src/features/cierre/lib/cierreCloseGuard.test.ts` (7 tests), `src/features/cierre/lib/useGhostCyclesToast.test.ts` (6 tests), and `test/cierres-ghost-cycle-ipc.test.ts` (17 tests).
- T3 review round 1:
  1. Blocker logic bug fix (Rule B): Extended `GhostCycleCloudPort` with `findOpenCycle(sucursalId, excludeId)`. When cloud lacks candidate ID and has no strictly later cycle, but has an OPEN cycle for the same sucursal, closes the duplicate candidate G with `closed_at = G.opened_at` (zero-length window superseded by the open cloud cycle). Added `supersededBy: "later_cycle" | "open_cycle"` to closed items and audit rows. Added 5 targeted `it` blocks in `test/local-sqlite-ghost-cycle-reconcile.test.ts`.
  2. One type per concept: Exported `GhostCycleClosedItem` and `ReconcileGhostCyclesNowResult` from `ghostCycleReconcile.ts` across main/sync orchestration; deleted `GhostCycleClosedNotification` and `GhostCycleNotificationPayload`. On renderer side, unified single closed-item shape `GhostCycleClosedItem`, `ReconcileGhostCyclesResponse`, and `CycleSyncStatusResponse` in `src/shared/types/electron.d.ts` and deleted local duplicated shapes in `cierreCloseGuard.ts`.
  3. Dropped "offline" reason and `isOfflineError`: Unified failure reasons to `"unavailable" | "error"` across the stack.
  4. Deduplicated worker reconcile flow: Extracted private `executeGhostCycleReconcile(): Promise<ReconcileGhostCyclesNowResult>` stamping throttle, getting port, running store reconcile, logging, and notifying `onGhostCyclesClosed`. `runGhostCycleReconcile(pullResult)` checks throttle and delegates; `reconcileGhostCyclesNow()` delegates directly. Removed `force` parameter; made `onGhostCyclesClosed` private readonly from options.
  5. Standardized IPC channels: Renamed constants to domain:kebab convention `cierres:reconcile-ghost-cycles` and `cierres:cycle-sync-status`, removed dotted aliases and redundant handler registrations, and updated both preloads.
  6. Centralized blocking sync outbox decision: Extracted `isBlockingCycleOutboxError` to `ghostCycleReconcile.ts` with dedicated unit tests; simplified `TenantStore.getCycleSyncStatus` to call it and removed unused `tenantId` activation branch from `TenantStoreController.getCycleSyncStatus`.
  7. Cashier close guard timeout bounds: Bounded `reconcileGhostCycles` and `cycleSyncStatus` IPC calls with named constant `CLOSE_GUARD_TIMEOUT_MS = 5000` via `withTimeout` in `cierreGuardAdapter.ts` (reconcile timeout resolves as `{ ok: false, reason: "error" }`, status timeout as `null`). Added 7 fake-timer tests in new test file `src/features/cierre/lib/cierreGuardAdapter.test.ts`.
  8. Neutral Spanish UI text: Updated `MSG_OPEN_PUSH_CONFLICT` to neutral Spanish using "tú" (`"No se puede cerrar este ciclo: la nube no lo aceptó. Conéctate a internet y espera unos minutos; el sistema lo corrige solo."`) and aligned test expectations.

## Verification evidence
- `git diff --stat -- '*.test.ts' '*.test.tsx'`: `test/local-sqlite-ghost-cycle-reconcile.test.ts` (279 insertions; adapted fakes and new it blocks only).
- `npm run typecheck`: clean (exit code 0).
- `npx vitest run test/local-sqlite-ghost-cycle-reconcile.test.ts test/cierres-ghost-cycle-ipc.test.ts test/desktop-ipc-guard.test.ts test/cycle-open-renumber.test.ts src/features/cierre`: 14 test files, 132 tests passed (exit code 0).
- `npm test`: 362 test files passed, 1 skipped (363 total); 3001 tests passed, 2 skipped (exit code 0).
- `graphify update .`: completed (exit code 0).

## Next step
Feature complete. Ready for review.
