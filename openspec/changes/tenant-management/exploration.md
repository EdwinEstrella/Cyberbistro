## Exploration: Tenant Management and Payment Alerts

### Current State
1. **User Deletion**: Staff user deletion is currently handled by the RPC `cloudix_owner_delete_staff_user` and super-admin deletion by `cloudix_super_admin_delete_tenant_user`. Both **already** contain logic to delete the associated record from `auth.users` using `DELETE FROM auth.users WHERE id = target_row.auth_user_id;`.
2. **Tenant Deletion**: The `cloudix_super_admin_delete_tenant` RPC deletes tenant data manually table by table (`consumos`, `facturas`, `comandas`, etc.). This approach is brittle and already missing newer tables like `gastos`, `cuentas_cobrar`, and `pagos`. Many foreign keys in `test/schema.sql` are set to `ON DELETE RESTRICT`.
3. **Payment Alerts**: There is no `payment_day_of_month` column in the `tenants` table. `AppLayout.tsx` has global alert/modal infrastructure but no checks for billing/payment dates.

### Affected Areas
- `sql/cloudix_super_admin_limits.sql` — `cloudix_super_admin_delete_tenant` RPC needs updating for cascading deletes.
- `migrations/*` (new migration needed) — To add `payment_day_of_month` to `tenants` and alter foreign keys to `ON DELETE CASCADE`.
- `src/app/components/AppLayout.tsx` — Needs logic to evaluate the current date vs `payment_day_of_month` and display a blocking/warning modal.
- `src/shared/hooks/useAuth.ts` (or similar) — To expose `payment_day_of_month` to the frontend state.

### Approaches

#### 1. **Tenant Deletion: RPC Manual Deletion vs Cascade**
- **Option A (Manual RPC Deletes)**: Add `DELETE FROM gastos`, `DELETE FROM cuentas_cobrar`, etc., to `cloudix_super_admin_delete_tenant`.
  - **Pros**: Explicit, no schema changes needed.
  - **Cons**: High maintenance; every new table will break tenant deletion if forgotten.
  - **Effort**: Low.
- **Option B (Foreign Key CASCADE)**: Modify all foreign keys referencing `tenant_id` to use `ON DELETE CASCADE`. Simplify the RPC to just `DELETE FROM tenants WHERE id = p_tenant_id;`.
  - **Pros**: Scalable, future-proof, robust.
  - **Cons**: Requires a migration script dropping and recreating foreign keys.
  - **Effort**: Medium.

#### 2. **Payment Alert Modal Implementation**
- **Option A (AppLayout global state)**: Check `payment_day_of_month` against `new Date().getDate()` inside `AppLayout.tsx`. If it's 1 day before or the exact day, trigger a custom Modal (e.g. `AlertModal`) via state.
  - **Pros**: Centralized, affects all users within the tenant.
  - **Cons**: If we only want admins to see it, we need an `if (rol === 'admin')` check.
  - **Effort**: Low.

### Recommendation
- **Feature 1 (Auth Deletion)**: No new backend code is needed since `cloudix_owner_delete_staff_user` already deletes from `auth.users`. We just need to verify the frontend is calling this RPC (which it is, in `Soporte.tsx`).
- **Feature 2 (Cascading Delete)**: Proceed with **Option B** (Foreign Key CASCADE). It's the standard PostgreSQL way to handle tenant teardown and removes the burden of updating the RPC for every new feature.
- **Feature 3 (Payment Alerts)**: Proceed with **Option A**. Add an `alert_payment_day` column to `tenants`. Inject a one-time check in `AppLayout.tsx` that triggers a non-dismissible (or highly visible) modal for admin users 1 day before and on the day of payment.

### Risks
- Dropping and recreating constraints (`ON DELETE CASCADE`) on large tables might lock them during migration.
- If the payment modal is non-dismissible on the day of payment, it might block the restaurant from operating in the middle of a shift if they forget to pay. We need clear requirements on whether it's a "soft" warning or a "hard" block.

### Ready for Proposal
Yes. The next step is `sdd-propose` to formalize the migration strategy for constraints and the UX behavior of the payment modal.