# Feature: Recurring Monthly Fee (monthly-fee)

## Objective
The super admin configures a recurring monthly fee per tenant; each payment day the fee is charged to the outstanding balance (unpaid months accumulate); "Pagó" settles the balance, keeps the fee, and records the payment in a persistent history table.

## Context & Problem
1. Currently, tenant debt tracking is manual and one-off: `public.tenants.debt_amount` stores a single outstanding balance, but there is no mechanism for an automated recurring monthly subscription fee.
2. Production PostgreSQL operates without `pg_cron`, meaning background scheduled cron jobs cannot be run at the database level.
3. When a tenant makes a payment, clicking "Pagó" directly clears `debt_amount` and `debt_due_date` via a client table update without recording who took the payment, when it was paid, or the amount settled.
4. When multiple months go unpaid, balances must accumulate without resetting the grace period clock. The 3-day grace and blocking gate (`DebtLockedGate`) must remain anchored to the oldest unpaid charge.

## Constraints & Product Decisions
- **Lazy Idempotent Accrual**: Production has no `pg_cron`. Accrual runs lazily whenever tenant billing is inspected (superadmin load, tenant app boot / cloud pull).
- **First Charge Anchor**: The first automatic charge is the NEXT payment day after the fee is configured — never retroactive. For example, configuring a fee on 2026-11-19 with payment day 13 sets the anchor to 2026-11-13; the first automatic charge occurs on 2026-12-13. Any balance owed at configuration time is entered manually as an outstanding balance.
- **Balance Accumulation**: Unpaid months accumulate (`debt_amount = coalesce(debt_amount, 0) + n * fee`).
- **Oldest Due Date Preservation**: If a tenant already had outstanding debt (`debt_amount > 0` and `debt_due_date IS NOT NULL`), newly accrued fees add to the balance but preserve the existing `debt_due_date` so the grace period and lock gate timing remain anchored to the oldest unpaid period.
- **Settlement Semantics ("Pagó")**: "Pagó" calls a dedicated RPC `cloudix_register_tenant_payment` that runs accrual for today first, records the payment in `tenant_billing_payments`, clears `debt_amount` and `debt_due_date`, and keeps `monthly_fee_amount`, `monthly_fee_currency`, and `last_charged_period`.
- **Database Safety & Protection**: Production DDL requires explicit user approval (Claude applies it). Trigger `tenants_protect_debt_columns` prevents non-superadmin clients from tampering with debt or monthly fee columns.
- **Language**: English for code, database schemas, comments, and internal docs; neutral Spanish with "tú" for user-facing UI copy in subsequent tasks.

## Quality Checks & Delivery
- **Checks**: TDD off (tests mandatory), `npx vitest run`, `npm run typecheck`.
- **Delivery**: Branch `feat/monthly-fee`, one commit per task, merge to master.

## Tasks
- [x] **T1 DB migration**: fee columns, payments history, set-fee/accrue/register-payment RPCs, protection trigger + tests. Route: delegated (agy). (Commit 5a01d3a, applied to prod 2026-11-19, rehearsal on Test tenant rolled back: anchor 2026-11-13, Dec 13 → 1 cycle, Feb 13 → 3 cycles RD$4,500 due 2026-12-13, payment settled + history, fee kept, Feb 31 clamp, currency mismatch raised, stranger 42501).
- [x] **T2 Super admin UI**: fee vs balance fields, "Pagó" via RPC, payment history, accrual before listing. Route: delegated (agy). Verified: dirty detection, validation, payment settlement, history table, currency mismatch guard, unit tests passing. (Round 1 corrections applied: mixed-currency hole closed with draft currency locking + validation error, spurious fee changes fixed with amount/day normalization).
- [x] **T3 Tenant app**: call accrual on billing read; desktop mirror whitelist for new columns. Route: delegated (agy). Verified: session-throttled accrual hook in AppLayout, desktop SQLite mirror columns whitelist and pull tests.
- [ ] **T4 Apply migration to prod after user OK, verify** (Claude, inline).
