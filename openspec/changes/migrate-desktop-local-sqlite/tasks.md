# Tasks: Full Desktop Operations to Local SQLite

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 4,000–6,000 total; C3 slices capped at 120–200 each |
| 400-line budget risk | High overall; native runtime cap is 200 changed lines per C3 slice |
| Chained PRs recommended | Yes |
| Suggested split | Completed C1 → completed C2 → C3.1 → C3.2 → C3.3 → C3.4 → C4–C8 |
| Delivery strategy | ask-on-risk; inherited `stacked-to-main` |
| Chain strategy | stacked-to-main; one native attempt per C3 slice |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

**Completed work is preserved:** foundation, C1 catalogs, C2 orders/cycles, and all C3a–C3d local fiscal contracts remain checked. C3d is complete. The next implementation cohort is C4 purchases/inventory/expenses; C4 onward remains pending. No DGII dispatch, production activation, sync binding, cutover, or IndexedDB deletion has started.

### Suggested Work Units

| Unit (≤200 lines) | Goal | Focused test | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| C1 (done) | Catalog schema, IPC, repository, UI | Existing focused C1 suite | Existing isolated Electron E2E | Disable C1; retain IndexedDB |
| C2 (done) | Orders/cycles/kitchen transactions and adapters | Existing focused C2 suite | Existing isolated Electron E2E | Disable C2; restore legacy reads |
| C3.1 | Fiscal STRICT schema and constraints | `npm run test -- test/local-sqlite-sales-fiscal-schema.test.ts` | N/A: schema-only; no activation | Revert fiscal schema/tests; quarantine only C3 DB |
| C3.2 | Tenant/branch/type sequence allocation and crash recovery | `npm run test -- test/local-sqlite-fiscal-sequence.test.ts` | N/A: synthetic store recovery only | Disable allocator; preserve schema and IndexedDB |
| C3.3 | Atomic invoice + pending fiscal intent/outbox contract | `npm run test -- test/local-sqlite-sales-fiscal.test.ts` | N/A: local transaction only; no DGII/production | Revert fiscal repository/IPC; route legacy |
| C3.4 | Isolated adapters, E2E, and manual checklist | `npm run test -- src/shared/lib/salesFiscalUiAdapter.test.ts test/local-sqlite-sales-fiscal.test.ts` | `npm run build; npx playwright test test/local-sqlite-sales-fiscal.e2e.spec.ts` with synthetic profile | Disable adapters; quarantine C3; keep IndexedDB |

Every unit follows `import → validate(count/hash/FK) → shadow → canary → pilot → telemetry/restore hold → approval`; no big-bang activation.

## Phase 1: Retained Foundation and Safety RED

- [x] 1.1 Preserve completed identity, tenant SQLite, import/recovery, worker-contract, dormant migration, and login E2E tasks.
- [x] 1.2 **RED:** `test/local-sqlite-ipc.test.ts` proves forged sender/tenant/table/SQL yields zero writes; production IPC remains disabled until GREEN.
- [x] 1.3 Add shared `DesktopRepository.execute()` transaction/outbox contract in `src/shared/lib/desktopRepository.ts`; do not bind `syncWorker.ts` or delete legacy storage.

## Phase 2: Dependency-Ordered Cohort RED/GREEN

- [x] 2.1 **RED/GREEN C1:** test then implement catalogs.
- [x] 2.2 **RED/GREEN C2:** tables/orders/kitchen/cycles.
- [x] 2.3a **RED:** `test/local-sqlite-sales-fiscal-schema.test.ts` rejects missing PK/FK/CHECK/index rules; **GREEN:** add STRICT `facturas`, `ecf_documents`, `fiscal_outbox`, `ecf_sequence_allocations` in `electron/persistence/schema.ts` (≤200 lines).
- [x] 2.3b **RED:** `test/local-sqlite-fiscal-sequence.test.ts` proves tenant/branch/type monotonicity and stale `allocating` recovery; **GREEN:** add `electron/persistence/fiscalSequenceRepository.ts` with local-only allocation (≤200 lines).
- [x] 2.3c **RED:** `test/local-sqlite-sales-fiscal.test.ts` proves forged IPC zero writes and invoice+fiscal-intent atomic rollback; **GREEN:** add `electron/persistence/salesFiscalRepository.ts` and typed IPC wiring (≤200 lines).
- [x] 2.3d **RED:** adapter/E2E tests prove `internal_receipt`, `ncf_legacy`, and `dgii_ecf` pending states after graceful SQLite close/reopen; **GREEN:** add `src/shared/lib/salesFiscalUiAdapter.ts`, Billing wiring, `test/local-sqlite-sales-fiscal.e2e.spec.ts`, and `docs/local-sqlite-c3-manual-validation.md` (≤200 lines). This does not prove abrupt power-loss recovery.
- [x] 2.4a **RED/GREEN C4a:** tenant-pinned STRICT SQLite schema contract for cash purchases, purchase details, inventory movements, expenses, and transactional local outbox rollback.
- [x] 2.4b **RED/GREEN C4b:** typed cash-purchase repository/IPC and isolated runtime evidence; credit/AP workflows remain excluded.
- [ ] 2.5 **RED/GREEN C5:** AR; 2.6 **RED/GREEN C6:** AP; 2.7 **RED/GREEN C7:** closings; 2.8 **RED/GREEN C8:** analytics.

## Phase 3: Verification and Approval

- [ ] 3.1 Verify the completed C3a–C3d slices independently with RED/GREEN evidence, rollback drill, synthetic Electron profile, and manual receipt/NCF/e-CF pending checklist.
- [ ] 3.2 Require parity counts/hashes/FKs, debt and cycle equations, zero unexplained conflicts, restore drill, pilot telemetry, and explicit approval before each flag.
- [ ] 3.3 Keep DGII dispatch, production activation, `migrations/20260809180000_local-sync-foundation.sql`, `migrations/20260809144500_local-sync-protocol.sql`, LAN delivery, purge, and legacy/IndexedDB deletion dormant and out of scope.
