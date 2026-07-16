# Tasks: Tenant Management and Payment Alerts

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700 - 800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (DB/RPC) → PR 2 (Logic/Modal) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units (For Single-PR review tracking)

| Unit | Goal | Notes |
|------|------|-----------|
| 1 | DB Migration & RPC | FK cascade migration, `payment_day_of_month` column, RPC cleanup |
| 2 | Logic & Utilities | Clamping utility, `purgeLocalSession` utility, `localStorage` alert state |
| 3 | Admin UI | Super-admin tenant settings day-picker |
| 4 | Alert Modal UI | `AppLayout` modal integration with date-aware logic |
| 5 | Integration & Tests | Integration tests, regression tests, type/build checks |

## Phase 1: Database and RPC Foundation

- [x] 1.1 Create migration to drop/re-add `tenant_id` FKs as `ON DELETE CASCADE`
- [x] 1.2 Add `payment_day_of_month SMALLINT CHECK (1..31)` to `tenants` table in migration
- [x] 1.3 Simplify `cloudix_super_admin_delete_tenant` RPC to safely delete auth users then cascade-delete tenant
- [x] 1.4 Add migration regression test to verify cascade/auth-cleanup ordering

## Phase 2: Core Logic and Utilities

- [x] 2.1 Implement month-end clamping utility `clampPaymentDate(day, month, year)`
- [x] 2.2 Implement `purgeLocalSession` utility in `src/shared/lib/localFirst.ts`
- [x] 2.3 Update `localFirst.ts` sync logic to include `payment_day_of_month`
- [x] 2.4 Unit test clamping utility (30-day months, Feb non-leap)

## Phase 3: Frontend Implementation

- [x] 3.1 Update super-admin tenant settings panel with Day-of-Month config picker
- [x] 3.2 Implement `AlertModal` in `AppLayout.tsx` with date-logic and daily dismissal logic
- [x] 3.3 Integrate denial purge in auth/layout flow to handle RLS/backend denial

## Phase 4: Verification

- [x] 4.1 Migration regression test for Super-admin tenant deletion ordering
- [x] 4.2 Date-window regression tests for Alert Modal behavior
- [x] 4.3 Role/auth regression coverage plus online-denial hydration guard
- [x] 4.4 Verify all types, build, and migration SQL structure

> Staging migration execution remains an operational rollout step; it was not run against production from this workspace.

## Corrective Risk-Review Remediation

- [x] 5.1 Audit all repository tenant-owned tables, including `payments`, with orphan preflight and cascade-FK coverage
- [x] 5.2 Add duplicate Auth identity preflight and one-tenant-per-Auth-user unique index
- [x] 5.3 Gate protected mounts, local-first sync, and realtime on explicit validated tenant access
- [x] 5.4 Scope payment-alert dismissal keys by tenant and clear stale alert state
- [x] 5.5 Add regression coverage for the corrective findings and rerun targeted/full verification
- [x] 5.6 Make AppLayout and Pedidos realtime setup/cleanup race-safe, including late-subscribe disposal
- [x] 5.7 Reset and gate stale protected UI state during tenant/access transitions
- [x] 5.8 Preserve tenant IndexedDB operational data during temporary blocking; invalidate session context only
- [x] 5.9 Guard realtime connect-before-subscribe, branch responses, and payment lookups against stale access generations
- [x] 5.10 Centralize tenant realtime ownership with reference counting so AppLayout and Pedidos share one SDK-global channel
- [x] 5.11 Integrate Cocina into the shared manager and guard stale release/reacquire generations
- [x] 5.12 Add three-consumer, pending-reacquire, and tenant A-B-A realtime regression coverage
- [x] 5.13 Attribute auth refreshes by focus, visibility, interval, or manual source and coalesce Electron restore bursts
- [x] 5.14 Preserve validated tenant mounts during same-tenant session refresh and allow explicit retry after denial
- [x] 5.15 Degrade missing `payment_day_of_month` column to one session-scoped warning with no retry/modal loop
- [x] 5.16 Add rapid-restore and pre-migration payment-column regression tests; rerun full verification
- [x] 5.17 Add reviewed tenant-access Realtime channel, trigger, and least-privilege blocked-member policies
- [x] 5.18 Centralize tenant-access Realtime ownership in auth state with immediate block/unblock transitions
- [x] 5.19 Revalidate `tenants.activa` for every active membership resolution
- [x] 5.20 Reconcile access on reconnect and bounded cadence without focus-only dependence
- [x] 5.21 Serialize delayed global channel unsubscribe before replacement subscribe
- [x] 5.22 Add behavior-level access, resolver, reconnect, security, and data-preservation coverage
- [x] 5.23 Remove staff-state mutation from all block/unblock definitions and preserve legacy individual staff state
- [x] 5.24 Add user-specific revocation events for staff deletion/inactivation and tighten Auth/email identity matching
- [x] 5.25 Preserve local session metadata during suspension with a non-destructive durable suspension marker
- [x] 5.26 Add access-generation cancellation checks to local-first work after every protected await
- [x] 5.27 Queue reconciliation and harden stale access-channel lifecycle cleanup/replacement
