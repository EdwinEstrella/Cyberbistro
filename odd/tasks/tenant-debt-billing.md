# Feature: Tenant Debt Billing

## Objective
Enable the super admin to configure and manage outstanding SaaS subscription debt per tenant (amount owed in DOP or USD with an explicit due date). The tenant app reads this configuration to display a prominent, high-contrast personalized alert to staff users. If the payment becomes 3 or more days overdue, access to the tenant app is blocked by a full-screen lock gate until the super admin clicks "Pagó" in the Super Admin dashboard to clear the balance.

## Context & Problem
1. Currently, `tenants.payment_day_of_month` only supports monthly calendar day reminders (1-31) via `getPaymentAlert()`, which displays non-intrusive reminder alerts solely on the day before and day of payment.
2. When a tenant defaults on SaaS payment, the super admin currently has no way to record specific balances owed (in DOP or USD) or define custom due dates.
3. The only existing blocking mechanism is a binary `activa = false` switch (`cloudix_super_admin_block_tenant`), which completely revokes tenant member authentication and access without granular balance notification or grace period transparency.
4. Alerts rendered in `AlertModal.tsx` suffer from low contrast (`text-gray-400` on dark `#1e1e1e` backgrounds), which hinders visibility for critical billing messages.

## Decision Log (Single Source of Truth)
- **Client-Side Gate Only for Now**:
  Enforcement at 3+ days overdue is handled client-side via a full-screen blocking overlay in `AppLayout.tsx` / `RoleGuard.tsx`. We deliberately do NOT modify `cloudix_resolve_tenant_user()` or RLS at this stage. Server-side authoritative lockout remains an optional future hardening step.
- **"Pagó" Action Semantics**:
  Clearing debt executes a direct `tenants` table update from Super Admin:
  `UPDATE public.tenants SET debt_amount = NULL, debt_due_date = NULL, debt_updated_at = now() WHERE id = :tenantId`.
  No dedicated RPC is required; super admin direct updates are already authorized under `cb_tenants_super_admin_all`.
- **Preserve Existing Reminders**:
  Existing `payment_day_of_month` scheduling and `getPaymentAlert()` logic in `src/shared/lib/paymentDate.ts` remain completely untouched and active as secondary/routine monthly reminders.
- **Pure Domain Logic Separation**:
  All overdue calculations, grace period evaluations, currency formatting (DOP/USD), and message generation are centralized in a dedicated, pure helper `src/shared/lib/tenantDebt.ts` backed by 100% Vitest unit tests.
- **Local Persistence & Sync Whitelist**:
  Debt fields (`debt_amount`, `debt_currency`, `debt_due_date`, `debt_updated_at`) are whitelisted in `electron/persistence/cloudApply.ts` and `src/shared/lib/localFirst.ts` so desktop and offline instances maintain accurate local state without dropping cloud values.

## Implementation Tasks
- [x] **T1**: Create idempotent migration `supabase/migrations/20261111200000_tenant_debt_billing.sql` adding `debt_amount`, `debt_currency`, `debt_due_date`, and `debt_updated_at` to `public.tenants` with checks and column comments.
- [ ] **T2**: Implement pure logic module `src/shared/lib/tenantDebt.ts` with comprehensive unit tests in `src/shared/lib/tenantDebt.test.ts` (status categorization: `none`, `upcoming`, `due_today`, `overdue_grace`, `locked`; high-contrast copy; currency formatting).
- [ ] **T3**: Super Admin UI integration:
  - Update `src/features/super-admin/lib/types.ts` (`TenantRow`, `LimitDraft`, `TenantOverviewTenantBasics`).
  - Update `src/features/super-admin/lib/dirtyDetection.ts` and tests to track debt fields.
  - Extend `PaymentsForm.tsx` with debt inputs (`debt_amount`, `debt_currency` select DOP/USD, `debt_due_date` picker) and "Pagó" instant-clear button.
  - Update `SuperAdminPage.tsx` mutation handler.
  - Display debt balance badge and status in `TenantOverviewPanel.tsx`.
- [ ] **T4**: Tenant App UI & Local Sync:
  - Update `AppLayout.tsx` to fetch debt columns along with `payment_day_of_month`.
  - Fix color contrast in `src/shared/components/AlertModal.tsx` for readable alerts on dark backgrounds.
  - Implement full-screen lock gate blocking interactions when debt is 3+ days overdue.
  - Whitelist debt columns in local sync schemas (`electron/persistence/cloudApply.ts` and `src/shared/lib/localFirst.ts`).

## Acceptance Criteria
1. `public.tenants` table contains `debt_amount` (numeric 12,2), `debt_currency` ('DOP'/'USD'), `debt_due_date` (date), and `debt_updated_at` (timestamptz).
2. Super admin can assign or clear debt amount and due date per tenant in `PaymentsForm.tsx`.
3. Tenant app displays a prominent high-contrast modal when a debt is active.
4. When debt is 3 or more days overdue, tenant app displays a non-dismissible full-screen lock gate.
5. Desktop Electron app correctly persists debt columns in local storage.
6. All unit and e2e test suites pass with zero regressions.

## Next Steps
- Apply migration `20261111200000_tenant_debt_billing.sql` to PROD only with explicit user authorization.
- Proceed with task **T2** (`src/shared/lib/tenantDebt.ts` + unit tests).
