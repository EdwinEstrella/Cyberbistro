# Apply Progress: migrate-desktop-local-sqlite

## Delivery
- Strategy: sequential chained deliveries, `stacked-to-main`.
- Current bounded work unit: C4a tenant-pinned cash-purchase SQLite schema; C4b repository/IPC/runtime evidence remains pending.
- Native attempt: generation 22, ordinal 22, bounded to 2 attempts and 200 changed lines; acquired with owner request ID `corregir-c4`.
- Native result: `passed`; runtime receipt revision `sha256:e0aaa6f4e8ad64064c344475f21305dc7360db597055930dec8981788135e57e`; evidence revision `sha256:dfa1aefda3a69dca4a7fd2110b4d356b5a050bedaae0187daacded902d302e03`; native accounting reports 0 changed lines because this repository's cohort files are already untracked in the native candidate identity.
- Scope boundary: schema and contract test only for local cash purchases, details, inventory movements, expenses, and generic local outbox transaction rollback. No UI, IPC, cloud/sync, migration/import, legacy removal, credit/AP workflow, production action, commit, push, or PR.

## Completed Tasks
- [x] 1.2 Forged IPC safety RED tests and allowlisted IPC GREEN.
- [x] 1.3 Main-process `DesktopRepository.execute()` atomic local domain/outbox contract.
- [x] 1.1–1.3 Identity, safe IPC, and tenant SQLite foundation.
- [x] 2.1–2.2 IndexedDB import and recovery.
- [x] 3.1–3.2 Durable worker contract with unbound transport.
- [x] 3.3 Migration-contract RED tests for additive dormant protocol safety.
- [x] 3.4 Deployed dormant server synchronization foundation.
- [x] 3.4a Isolated Playwright login coverage and Spanish manual validation guidance.
- [x] 2.1 C1 tenant-pinned SQLite catalogs: tenants, branches, customers, suppliers, products, categories, inventory products, recipes, typed IPC, and minimal UI adapter.
- [x] 2.2 C2 STRICT tables/orders/kitchen/cycles: typed repository/IPC/preload API, minimal Tables/Camarera/Cocina adapters, atomic order-to-kitchen and cycle transactions, recovery, E2E, and manual checklist.
- [x] 2.3a C3a STRICT fiscal schema: `facturas`, `ecf_documents`, `fiscal_outbox`, and `ecf_sequence_allocations` with local-only pending fiscal states.
- [x] 2.3b C3b tenant/branch/type local sequence allocation: stale five-minute `allocating` leases become locally `reserved` before the next monotonic reservation; no dispatch or acceptance state exists.
- [x] 2.3c C3c atomic local fiscal sale: trusted typed IPC commits `dgii_ecf` invoice, pending fiscal intent, and pending fiscal outbox in one local transaction; forged IPC and fiscal-outbox failure yield zero partial writes.
- [x] 2.3d C3d fiscal UI adapter: named local fiscal bridge and Billing pending presentation, synthetic Electron E2E, and manual checklist prove every fiscal mode remains local/pending after a graceful SQLite close/reopen. They do not prove abrupt power-loss recovery.
- [x] 2.4a C4a cash-purchase STRICT schema: tenant-pinned `compras`, `detalles_compra`, `movimientos_inventario`, and `gastos` constrain cash-only purchase graphs and support transactionally rolled-back local outbox writes.

## C3d Reconciliation Inventory

### Original C3d Implementation Paths (eight)
1. `src/shared/lib/salesFiscalUiAdapter.ts`
2. `src/shared/lib/salesFiscalUiAdapter.test.ts`
3. `electron/preload.ts`
4. `electron/preload.cjs`
5. `src/shared/types/electron.d.ts`
6. `src/features/billing/components/Billing.tsx`
7. `test/local-sqlite-sales-fiscal.e2e.spec.ts`
8. `docs/local-sqlite-c3-manual-validation.md`

### Corrective Claim/Progress Paths (four)
1. `test/local-sqlite-sales-fiscal.e2e.spec.ts` — narrows the scenario claim to graceful close/reopen.
2. `docs/local-sqlite-c3-manual-validation.md` — narrows the manual-validation claim to graceful close/reopen.
3. `openspec/changes/migrate-desktop-local-sqlite/tasks.md` — records C3d complete and C4 onward pending.
4. `openspec/changes/migrate-desktop-local-sqlite/apply-progress.md` — records this reconciliation.

The E2E and manual-checklist paths appear in both lists because they are original C3d deliverables whose evidence wording was corrected; they are not new implementation scope.

### Native Zero-Line Limitation
- The native attempt starts at zero changed lines because the eight original C3d paths and the four corrective claim/progress paths already exist as untracked paths in the candidate worktree.
- Native zero-line accounting therefore cannot prove that those already-untracked paths were newly authored in this reconciliation; it only bounds this attempt to artifact reconciliation. No source behavior changed.

## TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 3.3 | `test/local-sync-foundation.test.ts` | Integration | N/A (new test/migration) | `npm run test -- test/local-sync-foundation.test.ts` failed: 3/3 because migration was absent | Same command passed: 1 file, 3/3 tests | Three independent safety contracts: additive objects, disabled/RLS tables, RPC grants/disabled gate | Filename changed to the InsForge-required `<version>_<hyphenated-name>.sql` form; tests remain green |
| 3.4 | `migrations/20260809180000_local-sync-foundation.sql` | Integration | N/A (new migration) | Same 3/3 failing contract tests | Same command passed: 1 file, 3/3 tests; InsForge applied only this migration | All four RPCs returned `sync_disabled` for a non-existent UUID | No behavior refactor required |
| 3.4a | `test/login-local-first.e2e.spec.ts` | E2E | `npm run test -- src/shared/lib/rememberLoginStorage.test.ts` — 1 file, 3/3 passed | `npx playwright test test/login-local-first.e2e.spec.ts` failed because accessible `Modo local` status did not exist | Same command passed: 2 tests discovered; 1/1 non-secret UI test passed and 1 secret-dependent test skipped | Non-secret flow covers controls, keyboard remember-me toggle, semantic register navigation; secret flow has no fallback and skips unless both dedicated environment variables exist | Added only a named status and a semantic button while preserving visual classes |
| 3.5 | Not created — runtime protocol validation requires an isolated backend branch/prod-like PostgreSQL fixture | `npm run test -- test/local-sync-foundation.test.ts` — 1 file, 3/3 passed | N/A — task is blocked before a valid RED test can be exercised: the linked InsForge project has no branch resource, `DATABASE_URL` is absent, and production is prohibited | FAILED — no safe runtime target exists for identity/tenant/device/table/payload rejection, idempotency, zero-DML, cursor, acknowledgement, and tombstone behavior | Blocked — the deployed dormant RPCs intentionally return `sync_disabled`; enabling or seeding a tenant would violate the activation boundary | N/A — no executable protocol behavior may be generalized without an isolated fixture | None — no production code changed |
| 1.2 | `test/local-sqlite-ipc.test.ts` | Integration | `npm run test -- test/desktop-sqlite-foundation.test.ts` — exit 0; 1 file, 2/2 passed | `npm run test -- test/local-sqlite-ipc.test.ts` — exit 1 because `DesktopRepository` did not exist | Same command — exit 0; 1 file, 3/3 passed | Forged sender plus forged tenant/table/SQL/command payloads prove zero executed writes | Extracted exact-key command parser; focused suite remains green |
| 1.3 | `test/local-sqlite-ipc.test.ts` | Integration | Same 2/2 SQLite foundation baseline | Same missing-module RED above | Same command — exit 0; tenant/branch pinned domain + outbox commit and outbox-failure rollback passed | Commit test plus duplicate-outbox failure exercises successful and rollback paths | Typed command/store port kept generic SQL and table access out of renderer reach |
| 2.1 C1 | `test/local-sqlite-catalogs.test.ts`, `src/shared/lib/catalogUiAdapter.test.ts`, `test/local-sqlite-catalogs.e2e.spec.ts` | Integration + E2E | `npm run test -- test/local-sqlite-ipc.test.ts test/desktop-sqlite-foundation.test.ts` — exit 0; 5/5 | Catalog repository import failed before it existed; typed IPC test failed because `registerCatalogRepositoryIpc` was absent; adapter test failed because `catalogUiAdapter` was absent; Electron E2E first failed because the packaged CJS preload did not expose the named command | Focused Vitest — exit 0; 4 files, 12/12. Playwright — exit 0; 1/1 after adding the narrow CJS preload method. | Tenant A/B isolation; missing parent FKs; PK upsert behavior; duplicate outbox rollback; spoofed tenant field and untrusted sender zero-write rejection; adapter-unavailable path; isolated Electron profile with synthetic data and no raw IPC. | Extracted catalog command definitions and one table-definition switch; all focused tests remain green. |
| 2.2 C2 | `test/local-sqlite-orders.test.ts`, `src/shared/lib/ordersUiAdapter.test.ts`, `test/local-sqlite-orders.e2e.spec.ts` | Integration + E2E | Baseline `npm run test -- test/local-sqlite-catalogs.test.ts test/local-sqlite-ipc.test.ts test/desktop-sqlite-foundation.test.ts` — exit 0; 10/10 | Missing `ordersRepository` and then missing `ordersUiAdapter` both failed at import before production code existed. | Focused Vitest — exit 0; 5 files, 16/16. Playwright — exit 0; 1/1 after rebuild. | Tenant A/B isolation; branch/table/product FK rejection; atomic order/consumption/kitchen/outbox graph; invalid kitchen and duplicate-cycle transitions; stale syncing recovery; typed IPC rejection; no raw IPC or kitchen endpoint exposure. | Typed command union and `BEGIN IMMEDIATE` transaction keep renderer input and all network behavior out of C2. |
| 2.3a C3a | `test/local-sqlite-sales-fiscal-schema.test.ts` | Integration | 4 files, 14/14 baseline | 1 file, 3/3 failed: fiscal tables were absent | 1 file, 3/3 passed | Tenant/branch FK rejection; invalid total/status rejection; duplicate sequence rejection; pending indexes | None needed; declarative schema stayed minimal |
| 2.3b C3b | `test/local-sqlite-fiscal-sequence.test.ts` | Integration | `test/local-sqlite-sales-fiscal-schema.test.ts` — 1 file, 3/3 passed | 1 suite failed because `fiscalSequenceRepository` did not exist | 1 file, 2/2 passed | Same-scope monotonic allocations; branch/type reset; stale same-scope lease recovered while fresh lease remains allocating | Minimal transaction with named lease window; focused tests stayed green |
| 2.3c C3c | `test/local-sqlite-sales-fiscal.test.ts` | Integration | `test/local-sqlite-ipc.test.ts test/local-sqlite-fiscal-sequence.test.ts` — 2 files, 5/5 passed | 1 suite failed because `salesFiscalRepository` did not exist | 1 file, 3/3 passed | Forged sender/tenant rejection, pending local `dgii_ecf` graph, and duplicate fiscal-outbox rollback | Repository and parser remain narrow; no refactor needed |
| 2.3d C3d | `src/shared/lib/salesFiscalUiAdapter.test.ts`, `test/local-sqlite-sales-fiscal.e2e.spec.ts` | Unit + E2E | C3 fiscal contracts — 3 files, 8/8 passed | Adapter module absent; Electron E2E then failed before the named bridge existed | Focused Vitest 2 files, 5/5; build plus Playwright 1/1 passed | Named bridge success/unavailable paths; all three fiscal modes retain pending invoice/outbox states after graceful SQLite close/reopen. This is not abrupt-loss evidence. | None needed; adapter remains a narrow renderer-to-preload boundary |

## Work Unit Evidence
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- test/local-sync-foundation.test.ts` — exit 0; 1 file, 3/3 passed. |
| Runtime harness command/scenario and exact result | `npm run dist:win` — exit 0; built `release/Cloudix-Install.exe` and its blockmap. |
| Production verification | Remote migration `20260809180000/local-sync-foundation` exists; all five protocol tables have RLS enabled, zero policies, and no anon/authenticated SELECT privilege; all four RPCs are `SECURITY DEFINER`, search-path pinned, anon-denied, authenticated-executable; `sync_tenants` has 0 total and enabled rows; all four RPC calls returned `sync_disabled`. |
| Rollback boundary | Revert `test/local-sync-foundation.test.ts` and `migrations/20260809180000_local-sync-foundation.sql`; production rollback must first remain disabled, then drop only these five isolated `sync_*` tables/functions after dependency checks. No business object or data is involved. |

## Work Unit Evidence: Shared Safety Foundation (Tasks 1.2–1.3)
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- test/local-sqlite-ipc.test.ts test/desktop-ipc-guard.test.ts test/desktop-sqlite-foundation.test.ts` — exit 0; 3 files, 8/8 passed. |
| Runtime harness command/scenario and exact result | `npm run dist:win` — exit 0; Electron Builder completed and generated `release/Cloudix-Install.exe` and blockmap. This has no UI/module migration boundary; package execution proves main-process bundle inclusion. |
| Relevant typecheck and exact result | `npm run typecheck` — exit 2 only from four pre-existing unrelated errors in `EditarCompraFiscalModal.tsx`, `purchaseService.ts`, and `Soporte.tsx`; no errors reference this work unit. |
| Rollback boundary | Revert `test/local-sqlite-ipc.test.ts`, `src/shared/lib/desktopRepository.ts`, the `sync_outbox` local table and methods in `electron/persistence/{schema,tenantStore,ipc}.ts`, and the main-process IPC registration. This does not activate sync, alter a production database, or migrate UI. |

## Work Unit Evidence: C1 Catalogs (Task 2.1)
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- test/local-sqlite-catalogs.test.ts src/shared/lib/catalogUiAdapter.test.ts test/local-sqlite-ipc.test.ts test/desktop-sqlite-foundation.test.ts` — exit 0; 4 files, 12/12 passed. |
| Runtime harness command/scenario and exact result | `npx playwright test test/local-sqlite-catalogs.e2e.spec.ts` — exit 0; 1/1 passed. It launches Electron with a unique temporary user-data directory, seeds only synthetic local C1 data, confirms the named preload API, no raw IPC exposure, and fail-closed untrusted sender behavior. `npm run dist:win` — exit 0; generated `release/Cloudix-Install.exe` and blockmap. |
| Relevant typecheck and exact result | `npm run typecheck` — exit 2 only due to four pre-existing unrelated errors in `EditarCompraFiscalModal.tsx`, `purchaseService.ts`, and `Soporte.tsx`; no C1 file is referenced. |
| Rollback boundary | Revert C1 additions in `electron/persistence/{schema,tenantStore,ipc,catalogRepository}.ts`, `electron/{main.ts,preload.ts,preload.cjs}`, `src/shared/lib/{catalogContracts,catalogUiAdapter}.ts`, their tests, and `docs/local-sqlite-c1-manual-validation.md`. This removes only dormant local C1 capability; IndexedDB remains untouched/read-only and no production or sync behavior must be rolled back. |

## Work Unit Evidence: C2 Orders/Cycles (Task 2.2)
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- src/shared/lib/ordersUiAdapter.test.ts test/local-sqlite-orders.test.ts test/local-sqlite-catalogs.test.ts test/local-sqlite-ipc.test.ts test/desktop-sqlite-foundation.test.ts` — exit 0; 5 files, 16/16 passed. |
| Runtime harness command/scenario and exact result | `npm run build; npx playwright test test/local-sqlite-orders.e2e.spec.ts` — exit 0; 1/1 passed with synthetic C2 data in a unique profile; verifies named preload API, no raw IPC/no kitchen endpoint API, and untrusted sender rejection. `npm run dist:win` — exit 0; generated `release/Cloudix-Install.exe` and blockmap. |
| Relevant typecheck and exact result | `npm run typecheck` — exit 2 only due to four pre-existing unrelated errors in `EditarCompraFiscalModal.tsx`, `purchaseService.ts`, and `Soporte.tsx`; no C2 file is referenced. |
| Rollback boundary | Revert C2 additions in `electron/persistence/{schema,tenantStore,ipc,ordersRepository}.ts`, `electron/{main.ts,preload.ts,preload.cjs}`, `src/shared/lib/{ordersContracts,ordersUiAdapter}.ts`, C2 tests, and `docs/local-sqlite-c2-manual-validation.md`. Legacy paths remain read-only rollback/export and IndexedDB remains untouched. |

## Work Unit Evidence: C3a Fiscal Schema (Task 2.3a)
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- test/local-sqlite-sales-fiscal-schema.test.ts test/local-sqlite-orders.test.ts test/local-sqlite-catalogs.test.ts test/local-sqlite-ipc.test.ts test/desktop-sqlite-foundation.test.ts` — exit 0; 5 files, 17/17 passed. |
| Runtime harness command/scenario and exact result | N/A: schema-only objective has no runtime boundary or activation. `npm run dist:win` — exit 0; produced `release/Cloudix-Install.exe` and blockmap without routing any fiscal operation. |
| Relevant typecheck and exact result | `npm run typecheck` — exit 2 only for four pre-existing unrelated errors in `EditarCompraFiscalModal.tsx`, `purchaseService.ts`, and `Soporte.tsx`; no C3a file is referenced. |
| Rollback boundary | Revert only fiscal table/index declarations in `electron/persistence/schema.ts` and `test/local-sqlite-sales-fiscal-schema.test.ts`; no local record is accepted by DGII, and no production, adapter, sequence, or IndexedDB behavior exists to unwind. |

## Work Unit Evidence: C3b Fiscal Sequence Allocation (Task 2.3b)
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- test/local-sqlite-fiscal-sequence.test.ts test/local-sqlite-sales-fiscal-schema.test.ts test/local-sqlite-orders.test.ts test/local-sqlite-catalogs.test.ts test/local-sqlite-ipc.test.ts test/desktop-sqlite-foundation.test.ts` — exit 0; 6 files, 19/19 passed. |
| Runtime harness command/scenario and exact result | `npm run dist:win` — exit 0; built `release/Cloudix-Install.exe` and blockmap. The allocator remains unbound to IPC/UI/invoice flows, so no fiscal dispatch or acceptance scenario exists. |
| Relevant typecheck and exact result | `npm run typecheck` — exit 2 only for four pre-existing unrelated errors in `EditarCompraFiscalModal.tsx`, `purchaseService.ts`, and `Soporte.tsx`; no C3b file is referenced. |
| Rollback boundary | Revert `electron/persistence/fiscalSequenceRepository.ts`, the `allocated_at` field in `electron/persistence/schema.ts`, and `test/local-sqlite-fiscal-sequence.test.ts`; this removes only dormant local reservation/recovery without changing invoices, external fiscal state, sync, IndexedDB, or production data. |

## Work Unit Evidence: C3c Atomic Local Fiscal Sale (Task 2.3c)
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- test/local-sqlite-sales-fiscal.test.ts` — RED exit 1 because `salesFiscalRepository` was absent; GREEN exit 0, 1 file, 3/3 passed. Related safety suite `npm run test -- test/local-sqlite-sales-fiscal.test.ts test/local-sqlite-fiscal-sequence.test.ts test/local-sqlite-sales-fiscal-schema.test.ts test/local-sqlite-orders.test.ts test/local-sqlite-catalogs.test.ts test/local-sqlite-ipc.test.ts test/desktop-sqlite-foundation.test.ts` — exit 0; 7 files, 22/22 passed. |
| Runtime harness command/scenario and exact result | N/A: this is a local `BEGIN IMMEDIATE` transaction/typed IPC boundary with no UI adapter, sync, DGII, or production runtime path in scope. `npm run build` — exit 0; renderer and Electron main bundles built. |
| Relevant typecheck and exact result | `npm run typecheck` — exit 2 only for four pre-existing unrelated errors in `EditarCompraFiscalModal.tsx`, `purchaseService.ts`, and `Soporte.tsx`; no C3c path is referenced. |
| Rollback boundary | Revert `test/local-sqlite-sales-fiscal.test.ts`, `electron/persistence/salesFiscalRepository.ts`, C3c additions in `electron/persistence/{ipc,tenantStore}.ts`, and the main-process registration in `electron/main.ts`; no accepted fiscal state, dispatch, sync, IndexedDB, cloud, or production data exists to unwind. |

## Work Unit Evidence: C3d Isolated Fiscal UI Adapter (Task 2.3d)
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- src/shared/lib/salesFiscalUiAdapter.test.ts test/local-sqlite-sales-fiscal.test.ts` — exit 0; 2 files, 5/5 passed. |
| Runtime harness command/scenario and exact result | `npm run build; npx playwright test test/local-sqlite-sales-fiscal.e2e.spec.ts` — exit 0; 1/1 passed. A unique synthetic Electron profile creates `internal_receipt`, `ncf_legacy`, and `dgii_ecf`, gracefully closes/reopens SQLite, then proves all invoices/outbox rows remain pending and only the named bridge is exposed. It does not simulate abrupt power loss. |
| Rollback boundary | Revert `src/shared/lib/salesFiscalUiAdapter.{ts,test.ts}`, C3d additions to `electron/preload.{ts,cjs}`, `src/shared/types/electron.d.ts`, `src/features/billing/components/Billing.tsx`, `test/local-sqlite-sales-fiscal.e2e.spec.ts`, and `docs/local-sqlite-c3-manual-validation.md`. No sync, DGII, cloud, migration, or IndexedDB behavior is removed. |

## C3d Correction Attempt: Graceful SQLite Close/Reopen Claim (Generation 21)
- Native lifecycle: reset receipt `sha256:b961ba037dd59547138f0b10db371b315596ed72b016d0311f800d8dc7edd2b0`; `begin` accepted for ordinal 21 with runtime revision `sha256:8e6b7c6c837d68340ba59c1cf8406ea7f4030db8f387f9cdead466b9e833f368`.
- Claim correction: C3d proves only that a synthetic local profile retains pending fiscal rows after `TenantStore.close()` and a subsequent `TenantStore.open()` of the same SQLite profile. It does not kill a process, interrupt a write, simulate an abrupt power loss, or prove abrupt-loss recovery.
- C3d authored paths reconciled in this correction: `test/local-sqlite-sales-fiscal.e2e.spec.ts`, `docs/local-sqlite-c3-manual-validation.md`, `openspec/changes/migrate-desktop-local-sqlite/tasks.md`, and this apply-progress artifact. No production, sync, DGII, cloud, migration, or IndexedDB path changed.

### TDD Cycle Evidence: C3d Claim Correction
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| C3d graceful-close/reopen claim correction | `test/local-sqlite-sales-fiscal.e2e.spec.ts` | E2E evidence wording | Existing focused Vitest 5/5 and prior Playwright 1/1 passed | N/A — no production behavior was added; the correction narrows inaccurate test/documentation/progress wording | Focused Vitest 5/5, `npm run build` exit 0, and renamed Playwright scenario 1/1 passed | Existing scenario creates all three fiscal modes, gracefully closes/reopens the same SQLite profile, and verifies invoices, intents, and outbox statuses | Renamed the scenario and aligned every C3d claim; no behavior refactor needed |

### Work Unit Evidence: C3d Claim Correction
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- src/shared/lib/salesFiscalUiAdapter.test.ts test/local-sqlite-sales-fiscal.test.ts` — exit 0; 2 files, 5/5 passed. |
| Runtime harness command/scenario and exact result | `npm run build; npx playwright test test/local-sqlite-sales-fiscal.e2e.spec.ts` — exit 0; build completed and 1/1 passed. The named scenario gracefully closes and reopens SQLite; it is not an abrupt-loss harness. |
| Rollback boundary | Revert only the four C3d claim-correction paths listed above. This restores prior wording but changes no local fiscal behavior and removes no unrelated work. |

## Work Unit Evidence: Dormant Local-First Login Validation
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npx playwright test test/login-local-first.e2e.spec.ts` — exit 0; 2 tests discovered, 1 passed and 1 skipped because `CYBERBISTRO_UNLINKED_E2E_EMAIL` and `CYBERBISTRO_UNLINKED_E2E_PASSWORD` were absent. `npm run test -- src/shared/lib/rememberLoginStorage.test.ts` — exit 0; 1 file, 3/3 passed. |
| Runtime harness command/scenario and exact result | `npm run dist:win` — exit 0; built `release/Cloudix-Install.exe` and `release/Cloudix-Install.exe.blockmap`. Electron Playwright launched the built desktop app with an isolated temporary user-data directory and exercised the logged-out UI. |
| Rollback boundary | Revert `playwright.config.ts`, `test/login-local-first.e2e.spec.ts`, `docs/local-first-manual-validation.md`, the `3.4a` task/progress entries, and the two semantic-only changes in `src/features/auth/components/LoginForm.tsx`; no backend, sync-worker, tenant, or business-data behavior is removed. |

## Work Unit Evidence: Slice 3 Task 3.5 (Blocked)
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- test/local-sync-foundation.test.ts` — exit 0; 1 file, 3/3 passed. This proves the existing migration remains additive and dormant, not the deferred active protocol semantics. |
| Full required test command and exact result | `npm run test` — exit 1; 67 files, 328 passed, 5 failed, 1 skipped. Failures are outside this task: `test/tenant-management-migration.test.ts` (1), `src/features/compras/lib/purchaseService.test.ts` (1), and `src/shared/lib/resolveTenantUserFromAuth.test.ts` (3). |
| Runtime harness command/scenario and exact result | `npm run dist:win` — exit 0; built `release/Cloudix-Install.exe` and `release/Cloudix-Install.exe.blockmap`. This package check does not exercise server concurrency or RLS. |
| Safe environment discovery | `npx @insforge/cli branch list --json` returned `Resource not found`; no backend branch is available. `DATABASE_URL` is absent, so the repository's database-backed RLS test is skipped. The only linked backend is production and may not be seeded, enabled, or mutated for this task. |
| Untestable boundaries | Forged authenticated identity/tenant/device/table/payload rejection after activation; concurrent same-hash reuse; mismatch zero-DML; cursor/pagination; failed local apply/no ack; tombstone replay; query plans/timeouts; and unchanged business-write latency. The dormant RPC implementation returns `sync_disabled` before these paths, by design. |
| Rollback boundary | No source, migration, database, or configuration change was made. The only runtime artifact is the regenerated Windows installer, which can be discarded independently. |

## Issues
- `npm run typecheck` exits 2 on four pre-existing unrelated errors in `EditarCompraFiscalModal.tsx`, `purchaseService.ts`, and `Soporte.tsx`; none references this migration or test.
- The InsForge `db rpc --data` CLI argument parser rejected JSON on this Windows host. Equivalent read-only SQL invocations of the deployed RPC functions verified all disabled results.
- Dedicated unlinked E2E credentials were not present, so the account-specific alert scenario was intentionally skipped without a fallback account.
- Task 3.5 cannot be completed safely until an isolated InsForge backend branch or prod-like PostgreSQL fixture with non-production identities and tenant data is supplied. Enabling or inserting into `sync_tenants` on production would violate the task boundary.

## Remaining
- [ ] 2.4b C4 typed cash-purchase repository/IPC and isolated runtime evidence.
- [ ] 2.5–2.8 C5 AR, C6 AP, C7 closings, and C8 analytics.
- [ ] Phase 3 verification and approval gates for completed C3 slices and every later cohort.
- [ ] Secure kitchen LAN delivery, cutover, fiscal behavior, and observability remain later, separate work.

## TDD Cycle Evidence: C4a Cash Purchase Schema
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.4a C4a | `test/local-sqlite-cash-purchases-schema.test.ts` | SQLite integration | `npm run test -- test/local-sqlite-sales-fiscal-schema.test.ts` — exit 0; 1 file, 3/3 passed | New contract test first: exit 1; 1 file, 3/3 failed because the four C4 tables were absent | `npm run test -- test/local-sqlite-cash-purchases-schema.test.ts` — exit 0; 1 file, 3/3 passed | Tenant/branch/FK and cash-only rejection; invalid detail/movement/expense constraints; duplicate-outbox transaction rollback leaves every graph table empty | None needed; declarative schema remains minimal |

## Work Unit Evidence: C4a Cash Purchase Schema
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- test/local-sqlite-cash-purchases-schema.test.ts` — exit 0; 1 file, 3/3 passed. Related schema safety: `npm run test -- test/local-sqlite-sales-fiscal-schema.test.ts test/local-sqlite-cash-purchases-schema.test.ts` — exit 0; 2 files, 6/6 passed. |
| Runtime harness command/scenario and exact result | N/A: this bounded schema-only contract adds no IPC/UI/runtime activation boundary. Its in-memory SQLite integration scenario explicitly executes a `BEGIN IMMEDIATE` graph plus generic outbox transaction and verifies rollback after a duplicate outbox ID. |
| Rollback boundary | Revert `test/local-sqlite-cash-purchases-schema.test.ts` and only the C4a table/index declarations in `electron/persistence/schema.ts`; no repository, IPC, UI, sync, migration/import, legacy, credit/AP, cloud, or production behavior is affected. |

## C4a Correction: Same-Branch Purchase Graph Integrity (Generation 23)
- Native lifecycle: owner reset receipt `sha256:85c5e91dbb1f36edf6c394025ea2a4c75242bce15363679b0f72c8de2f092e72`; `begin` accepted with unchanged request ID `iniciar-ajuste-c4`, ordinal 23, generation 23, 200-line ceiling.
- Correction: composite foreign keys now require purchase-linked `movimientos_inventario` and `gastos` rows to match the parent `compras` tenant and branch. The collision scenario now pre-seeds the exact outbox ID, asserts SQLite's `sync_outbox.id` uniqueness error, and verifies the pre-existing row survives rollback.
- Scope held: no C4b, UI, IPC, cloud/sync, migrations, imports, legacy removal, credit/AP, commits, or external action.

### Native Zero-Line Accounting Limitation
- The native candidate starts with C4a schema, test, and hybrid-artifact paths already untracked. Native accounting therefore reports zero changed lines for this correction even though the working tree contains the bounded source/test and progress edits.
- This zero is a candidate-identity limitation, not evidence that the C4a correction had no authored changes. The source paths and exact RED/GREEN commands below are the transparent behavior evidence; the native 200-line cap remains the authoritative bound.

### TDD Cycle Evidence: C4a Same-Branch Correction
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.4a C4a correction | `test/local-sqlite-cash-purchases-schema.test.ts` | SQLite integration | Focused baseline: exit 0; 1 file, 3/3 passed | Exit 1; 1 file, 2/4 failed: cross-branch movement/expense inserts were accepted; collision assertion independently observed `UNIQUE constraint failed: sync_outbox.id` | Exit 0; 1 file, 4/4 passed | Same-branch graph remains valid; cross-branch movement and expense both reject; a deliberately pre-existing outbox ID triggers the asserted collision and preserves the seed after rollback | None needed; declarative composite constraints remain minimal |

### Work Unit Evidence: C4a Same-Branch Correction
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- test/local-sqlite-cash-purchases-schema.test.ts` — exit 0; 1 file, 4/4 passed. |
| Runtime harness command/scenario and exact result | N/A: schema-only SQLite integration has no IPC/UI/runtime activation boundary; the in-memory `BEGIN IMMEDIATE` scenario exercises the actual constraints and rollback. |
| Rollback boundary | Revert the C4a correction portions of `electron/persistence/schema.ts` and `test/local-sqlite-cash-purchases-schema.test.ts`; this removes only same-tenant/branch graph guards and collision-proof evidence. |

## C4b Typed Cash-Purchase Repository, IPC, and Runtime Evidence
- Native begin: generation 24, ordinal 24, objective `C4b typed cash-purchase repository IPC and runtime evidence`; owner request ID `comenzar-c4b`; reset receipt `sha256:e5105a74766b64ba775f38a5d6562ccc801fc08636750448ce417cae2e965857`.
- Native settle: passed; final runtime revision `sha256:da95f1040b5945656388cc1c1f04639a8987091bca96637d2f484e32ebba72b8`; evidence revision `sha256:3a7ef60dd7bd78e6be1d222ef73d8487de690408fe25de499dc92358c8b89389`; native accounting reports 11 changed lines (≤200).
- Added only a main-process cash-only repository, tenant-pinned `BEGIN IMMEDIATE` graph/outbox transaction, trusted allowlisted IPC, and one named typed preload API. No UI, credit/AP, cloud/sync, migration/import, legacy removal, commit, or external operation was added.

### TDD Cycle Evidence: C4b
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.4b C4b | `test/local-sqlite-cash-purchases.test.ts`, `test/local-sqlite-cash-purchases.e2e.spec.ts` | SQLite integration + Electron E2E | `npm run test -- test/local-sqlite-cash-purchases-schema.test.ts test/local-sqlite-sales-fiscal.test.ts` — exit 0; 2 files, 7/7 passed | `npm run test -- test/local-sqlite-cash-purchases.test.ts` — exit 1; missing `cashPurchaseRepository` prevented collection | Focused Vitest — exit 0; 3 files, 10/10 passed; `npm run build; npx playwright test test/local-sqlite-cash-purchases.e2e.spec.ts` — exit 0; 1/1 passed | Trusted typed command; forged sender/tenant zero-write rejection; cash graph plus four pending outbox rows; duplicate outbox rollback; isolated Electron named bridge/no raw IPC | None needed; the allowlist and transaction remain narrow |

### Work Unit Evidence: C4b
| Evidence | Result |
|---|---|
| Focused test command and exact result | `npm run test -- test/local-sqlite-cash-purchases.test.ts test/local-sqlite-cash-purchases-schema.test.ts test/local-sqlite-sales-fiscal.test.ts` — exit 0; 3 files, 10/10 passed. |
| Runtime harness command/scenario and exact result | `npm run build; npx playwright test test/local-sqlite-cash-purchases.e2e.spec.ts` — exit 0; build succeeded and 1/1 passed. An isolated profile exposes the named bridge, exposes no raw IPC, and rejects an untrusted call without a tenant store. |
| Rollback boundary | Revert C4b-only additions in `electron/persistence/{cashPurchaseRepository,tenantStore,ipc}.ts`, `electron/{main,preload.ts,preload.cjs}`, `src/shared/types/electron.d.ts`, and the two C4b tests. This removes dormant local cash-purchase capability only; C4a schema and all unrelated work remain. |

## Remaining
- [ ] 2.5–2.8 C5 AR, C6 AP, C7 closings, and C8 analytics.
- [ ] Phase 3 verification and approval gates.
