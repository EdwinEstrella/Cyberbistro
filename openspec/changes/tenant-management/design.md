# Design: Tenant Management and Payment Alerts

## Technical Approach

Migrate all `tenant_id` foreign keys to `ON DELETE CASCADE` to enable robust, single-statement tenant hard deletion. Add `payment_day_of_month` to `tenants` for configurable payment alerts, synced to local-first IndexedDB storage to work offline. In the frontend layout layer, compute clamped effective payment dates, surface a dismissible modal alert with daily `localStorage` persistence, and introduce an aggressive session-clearing mechanism on backend denial to prevent blocked-tenant loops from local hydration.

## Architecture Decisions

### Decision: Tenant Deletion Mechanism

**Choice**: PostgreSQL `ON DELETE CASCADE` on all `tenant_id` foreign keys.
**Alternatives considered**: Manual multi-table `DELETE` statements inside the RPC.
**Rationale**: Manual deletes are brittle; every new table requires RPC updates (e.g., `gastos` was missing). Cascades guarantee referential integrity and zero orphans at the database engine level.

### Decision: Auth User Deletion Ordering

**Choice**: RPC extracts `auth_user_id`s from `tenant_users` into an array/variable, deletes those rows from `auth.users` directly, and finally executes `DELETE FROM tenants`.
**Alternatives considered**: PostgreSQL `AFTER DELETE` triggers on `tenant_users`.
**Rationale**: Triggers calling out to the `auth` schema from `public` can hit permission boundaries or recursion issues. The RPC explicit transaction boundary ensures safe sequencing and atomicity without trigger side-effects.

### Decision: Payment Alert State Persistence

**Choice**: `localStorage` key format `payment-alert-{YYYY-MM-DD}`.
**Alternatives considered**: Server-side user preferences table.
**Rationale**: Alert dismissal is a transient, device-specific UI state. Server-side tracking is unnecessary overhead and complicates offline POS operation.

### Decision: Temporary Blocking and Tenant Access Realtime

**Choice**: Publish `tenants.activa` changes to a dedicated `tenant-access:<tenant-id>` Realtime channel. The auth/access layer is its sole owner and remains subscribed while blocked; blocked transitions clear only the automatic local-session hydration metadata and release protected services.
**Alternatives considered**: Window-focus refresh, sign-out/reauthentication, or deleting the tenant IndexedDB database.
**Rationale**: Blocking is reversible. A dedicated RLS-protected channel provides immediate bidirectional state changes without exposing other tenants, while preserving operational mirrors, unsynced sales, and outboxes.

### Decision: Reconnect and Fallback Reconciliation

**Choice**: Reconcile access after Realtime reconnects and on a bounded internal cadence. Focus/visibility refresh remains only a deduplicated fallback.
**Rationale**: Realtime is the primary propagation path, but temporary network loss must not make an unblock undiscoverable.

### Decision: Explicit Tenant Access Validation Gate

**Choice**: Keep cached tenant context private until the current online session
resolves tenant access. Protected layout effects, local-first bootstrap, branch
queries, and realtime subscriptions require an explicit `validated` access state;
offline desktop hydration is the only alternate path and is marked as offline-
validated.

**Rationale**: A cached tenant ID is not proof that the Auth identity is still
active in that tenant. Timing-based guards allow blocked sessions to mount once,
which starts protected requests and realtime retry loops before denial is known.

## Data Flow

    [Super Admin] ──(RPC)──→ [cloudix_super_admin_delete_tenant]
                                  │
                                  ├─ 1. Select auth_user_id array
                                  ├─ 2. Delete from auth.users
                                  └─ 3. Delete from tenants (Cascades to all children)

    [POS Client] ──(Sync)──→ [IndexedDB (payment_day_of_month)]
          │
          └─ AppLayout computes clamped date → Renders Modal 
          └─ Dismiss → Sets localStorage('payment-alert-YYYY-MM-DD')
           └─ Tenant access Realtime → deny/restore protected context
           └─ Block → invalidates only automatic-hydration session metadata

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/<timestamp>_tenant_management.sql` | Create | Drops RESTRICT FKs, adds CASCADE FKs. Adds `payment_day_of_month` column. |
| `sql/cloudix_super_admin_limits.sql` | Modify | Rewrites `cloudix_super_admin_delete_tenant` to capture auth IDs, delete auth users, then delete tenant. |
| `src/app/components/AppLayout.tsx` | Modify | Computes month-end clamped date, triggers `AlertModal`, handles `localStorage` dismiss logic. |
| `src/features/super-admin/TenantSettings.tsx` | Modify | Adds UI for super-admins to configure `payment_day_of_month` (1-31). |
| `src/shared/lib/localFirst.ts` | Modify | Syncs `payment_day_of_month`; blocking invalidates only automatic-hydration session metadata. |
| `src/shared/hooks/useAuth.ts` | Modify | Owns tenant access state and Realtime lifecycle; reconciles block/unblock/reconnect transitions. |
| `src/shared/lib/tenantAccessRealtimeOwner.ts` | Create | Centralized `tenant-access:<tenant-id>` channel owner with bounded reconciliation. |
| `migrations/<timestamp>_tenant-access-realtime.sql` | Create | Reviewed channel, trigger, and least-privilege RLS source; not applied remotely. |

## Interfaces / Contracts

```typescript
// Local-First Schema Addition
interface Tenant {
  id: string;
  // ... existing fields
  payment_day_of_month: number | null; // 1-31
}

// Blocked Tenant Purge Utility
export const purgeLocalSession = async (): Promise<void> => {
  // Clear IndexedDB, local storage configs, and query caches
};
```

```sql
-- Migration snippet
ALTER TABLE public.consumos
  DROP CONSTRAINT consumos_tenant_id_fkey,
  ADD CONSTRAINT consumos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Date Clamping Logic | Jest tests for 31st day in 30-day month and February non-leap years. |
| Integration | Tenant Hard Deletion | Call RPC in pgTap/Jest; assert `auth.users` removed, `tenants` removed, and child rows cascade deleted (0 orphans). |
| E2E | Alert Modal & Persistence | Cypress/Playwright: Mock date to 1 day before, verify modal appears, dismiss it, reload, verify it remains hidden. |
| E2E | Blocked Loop Protection | Simulate RLS denial, verify IndexedDB is cleared and user is redirected without flickering. |

## Migration / Rollout

No phased rollout required. The migration will lock per-tenant tables briefly while replacing constraints; this should be run during off-peak hours (e.g., 4 AM) to avoid POS transaction interruptions.

## Open Questions

- [ ] None.
