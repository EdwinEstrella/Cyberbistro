# Tasks: Integrate DGII e-CF

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700 - 900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Infrastructure/Types | PR 1 (Base: tracker) | DB schema, tenant modes, shared types. |
| 2 | Secure Worker | PR 2 (Base: PR 1) | Certificate custody, signing, DGII poll worker. |
| 3 | Engine/Lifecycle | PR 3 (Base: PR 2) | Fiscal engine, e-CF outbox, checkout integration. |
| 4 | Verification/Docs | PR 4 (Base: PR 3) | Testing, fiscal panel UI, final docs. |

## Phase 1: Infrastructure and Foundation

- [x] 1.1 Add migrations for e-CF tables, fiscal modes, and outbox (`migrations/001_init_ecf.sql`).
- [x] 1.2 Update `tenantBillingSettings.ts` to normalize fiscal modes.
- [x] 1.3 Implement shared fiscal mode and status types (`src/shared/lib/fiscalTypes.ts`).
- [x] 1.4 Register fiscal outbox stores in local-first lib.

## Phase 2: Secure Fiscal Worker

- [x] 2.1 Develop Node.js worker service (`worker/fiscal/`).
- [x] 2.2 Implement certificate validation and safe custody handling (no renderer access).
- [x] 2.3 Implement XML signing, DGII submission, and polling logic.
- [x] 2.4 Add audit logging and idempotency safeguards for worker jobs.

## Phase 3: Lifecycle and Engine

- [x] 3.1 Create unified fiscal engine (`src/shared/lib/fiscalEngine.ts`) for checkout orchestration.
- [x] 3.2 Integrate fiscal engine into `Dashboard.tsx` and `MesaCloseAccountModal.tsx`.
- [x] 3.3 Implement e-CF status mapping and acceptance state persistence.
- [x] 3.4 Update print templates for pending/accepted e-CF states.

## Phase 4: Testing and Verification

- [x] 4.1 Write unit tests for fiscal engine and mode normalization.
- [x] 4.2 Add integration tests for offline e-CF sales and worker idempotency.
- [x] 4.3 Verify checkout regressions for legacy NCF and internal receipts.
- [x] 4.4 Update technical docs and verify fiscal status truths.
