# Proposal: Tenant Management and Payment Alerts

## Intent

Harden tenant and user lifecycle operations (hard-delete cascades, auth cleanup) and introduce payment-day alerting modals so restaurant owners receive timely reminders before suspension.

## Scope

### In Scope
- Migrate tenant-referencing FKs to `ON DELETE CASCADE`; simplify `cloudix_super_admin_delete_tenant` RPC to a single `DELETE FROM tenants`
- Verify user deletion RPCs unconditionally remove from `auth.users` (already implemented — audit-only)
- Add `payment_day_of_month` column to `tenants`; admin UI to configure it (1-31, clamped to month end)
- Payment alert modal in `AppLayout`: "reminder" 1 day before, "today" on the day; dismissible but reappears next full load via daily `localStorage` flag

### Out of Scope
- Automatic suspension or payment processing
- Email/push notifications for payment reminders
- Soft-delete or archiving mechanisms
- Billing/invoicing system integration

## Capabilities

### New Capabilities
- `tenant-lifecycle`: Hard-delete cascade for tenants, auth user cleanup on user deletion
- `payment-alerts`: Admin-configured payment day with date-aware modal reminders

### Modified Capabilities
None

## Approach

1. **Migration**: Drop + recreate all `tenant_id` FKs with `ON DELETE CASCADE`. Simplify the delete-tenant RPC to `DELETE FROM tenants WHERE id = $1`.
2. **Audit**: Confirm both user-deletion RPCs already delete from `auth.users`; add integration test.
3. **Schema**: Add `payment_day_of_month SMALLINT CHECK (1..31)` to `tenants`.
4. **Super-admin UI**: Add day-of-month picker in tenant settings panel.
5. **Alert logic**: In `AppLayout.tsx`, compute effective payment date (clamped to month's last day), compare to today. Show `AlertModal` with Spanish copy. Set `localStorage` key `payment-alert-{YYYY-MM-DD}` on dismiss.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `migrations/` | New | FK cascade migration + `payment_day_of_month` column |
| `sql/cloudix_super_admin_limits.sql` | Modified | Simplify delete-tenant RPC |
| `src/app/components/AppLayout.tsx` | Modified | Payment date check + AlertModal trigger |
| `src/features/super-admin/` | Modified | Payment day config UI for admin |
| `src/shared/lib/localFirst.ts` | Modified | Sync `payment_day_of_month` field |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| FK migration locks large tables | Low | Run during off-hours; tables are per-tenant and small |
| Missing FK causes cascade miss | Med | Audit all `tenant_id` columns before migration |
| Alert blocks POS during service | Low | Modal is dismissible; reappears only on next full load |

## Rollback Plan

Revert the migration (re-create FKs as `ON DELETE RESTRICT`). Remove `payment_day_of_month` column. Revert `AppLayout` changes. All changes are additive or replaceable.

## Dependencies

- Super-admin must have access to `tenants` table to set `payment_day_of_month`

## Success Criteria

- [ ] `DELETE FROM tenants WHERE id = X` cascades to all child tables with zero orphaned rows
- [ ] Deleting a tenant user removes corresponding `auth.users` entry
- [ ] Setting payment day 31 in a 30-day month triggers alert on day 30
- [ ] Modal appears 1 day before and on the payment day; dismiss persists for the calendar day
