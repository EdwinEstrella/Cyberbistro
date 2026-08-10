# Design: Migrate Full Desktop Operations to Local SQLite

## Approach

Extend tenant-pinned `node:sqlite` into `STRICT` tables behind validated IPC. Activate dependency-ordered cohorts per tenant/branch, never globally. Accounts Receivable (AR) and Accounts Payable (AP) are independent. Commands commit domain rows and outbox operations in one `BEGIN IMMEDIATE`; reads never fall through to InsForge. This design changes no production behavior.

## Architecture Decisions

| Option | Tradeoff | Decision / rationale |
|---|---|---|
| Big-bang switch | Simple; unsafe | Reject; independent flags contain rollback and enforce dependencies. |
| AR/AP nested elsewhere | Fewer flags; hidden lifecycle | Reject; each needs distinct telemetry, reconciliation, and rollback. |
| Multi-call settlements | Familiar; partial writes | Use named transactions covering payment, debt, cycle/expense effects, and outbox. |
| Mutable payments / LWW | Easy; unauditable | Use immutable payments, linked reversals, and explicit reconciliation. |

## Data Flow

```text
sale --credit--> invoice + AR debt --receipt--> AR payment --cash--> open cycle
purchase --credit--> purchase + AP debt --payment--> AP payment + expense --> open cycle
command -> validated IPC -> BEGIN IMMEDIATE -> domain graph + ordered outbox -> UI success
```

## Cohorts, Dependencies, and Boundaries

Common tables: `cohort_state`, cursors/errors, tombstones, and `sync_outbox` with operation, commit, sequence, hash, status, dependency.

| Order / cohort | Dependency and atomic boundary | Offline / activation rule |
|---|---|---|
| 1 Catalogs | Customers, suppliers, products, categories, branches: row + outbox. | Pilot before dependents. |
| 2 Orders + cycle foundation | Tables/orders/kitchen plus open-cycle identity for cash movements. | Local operation; no cloud fallback. |
| 3 Sales/fiscal | Invoice, consumption close, stock/fiscal intent + outbox. Credit-sale path stays legacy until AR is active. | Local receipt; DGII remains visibly deferred. |
| 4 Purchases/inventory/expenses | Purchase/details, stock/fiscal/expense + outbox. Credit purchases stay legacy until AP activates. | Local commit; sync pending. |
| 5 AR | Requires customers, sales, cycles. Credit sale creates `facturas` + `cuentas_cobrar`; receipt inserts immutable `cxc_pagos`, rejects overpayment, updates debt, links cash to an open cycle, and enqueues atomically. | Independent flag; offline aging/read/receipt. Cash without open cycle fails closed. |
| 6 AP | Requires suppliers, purchases, expenses, cycles. Credit purchase creates purchase graph + `cuentas_pagar`; settlement inserts immutable `cxp_pagos`, rejects overpayment, updates debt, creates expense, updates fiscal payment date if applicable, and enqueues atomically. | Independent flag; offline aging/read/payment. Settlement without open cycle fails closed. |
| 7 Closings | Requires green AR/AP telemetry; snapshot includes cycle-linked AR receipts and AP expenses without rewriting debts. | Conflicts cannot auto-reopen/overwrite. |
| 8 Analytics | Rebuildable projections; no outbox. | Show local as-of time and reconciliation lag. |

Parent operations precede dependent debt/payments. Failure writes neither graph nor outbox; restart resets stale `syncing` to `pending`.

## Interfaces / Contracts

`DesktopRepository.execute(command): {commitId, localStatus, syncStatus}` uses allowlisted commands and main-process tenant/branch pinning. AR/AP states include `offline_queued`, `reconciliation_required`, and `blocked_safety`; success means local commit only.

## File Changes

| File | Action | Description |
|---|---|---|
| `openspec/changes/migrate-desktop-local-sqlite/design.md` | Modify now | Add first-class AR/AP design. |
| `electron/persistence/{schema,tenantStore,ipc,syncWorker}.ts` | Deferred | Graphs, commands, ordering, gates. |
| `src/features/{billing,compras,gastos,cuentas-cobrar,cuentas-pagar,cierre}/**` | Deferred | Adopt repositories. |
| `test/*local-sqlite*.test.ts` | Deferred | Activation evidence. |

## Testing and Activation Gates

| Gate | Required evidence |
|---|---|
| Unit | Money constraints, overpayment races, state transitions, reversals, dependency ordering. |
| Integration | AR/AP crash edges; replay/deduplication; ordering; cycle conflicts; FK rejection. |
| E2E | Packaged offline credit sale/purchase and settlements; power loss; disable; backup and IndexedDB-export restore. |
| Activation | Count/hash/FK parity; debt = source total - payments/reversals; cycle totals match receipts/expenses; zero unexplained conflicts; telemetry hold, restore and rollback drills; approval. |

## Threat Matrix

Renderer/main-process IPC triggered review; the prescribed matrix rows are:

| Boundary | Applicability / reason | Response / RED tests |
|---|---|---|
| Documentation-like paths | N/A: no execution classification | None. |
| Git repository selection | N/A: no VCS automation | None. |
| Commit state | N/A: no VCS automation | None. |
| Push state | N/A: no VCS automation | None. |
| PR commands | N/A: no PR automation | None. |

IPC sender/tenant spoofing must fail closed without writes in integration RED tests.

## Migration / Rollout

Each cohort proceeds import -> validate -> shadow -> canary -> pilot -> telemetry/restore hold -> approval. AR and AP activate independently only after prerequisites. No big-bang activation is allowed. On mismatch, loss, fiscal ambiguity, conflict spike, or restore failure: disable the cohort, quarantine SQLite, preserve outbox/evidence, and use support-controlled reconciliation or rollback. IndexedDB remains frozen, read-only, and available for rollback/export until cohort telemetry and restore validation pass. Legacy deletion requires separate approval after every cohort passes.

## Open Questions

None; activation approvals are explicit gates.
