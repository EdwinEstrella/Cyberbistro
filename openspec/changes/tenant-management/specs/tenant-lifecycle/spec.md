# Tenant Lifecycle Specification

## Purpose

Hard-delete cascade for tenants; auth cleanup on user deletion.

## Requirements

### Requirement: FK Cascade Migration

All foreign keys referencing `tenants.id` MUST use `ON DELETE CASCADE`.

#### Scenario: Cascade deletes all child rows

- GIVEN a tenant with rows in all child tables (`consumos`, `facturas`, `comandas`, `mesas_estado`, `cocina_estado`, `platos`, `cierres_operativos`, `tenant_users`, `gastos`, `cuentas_cobrar`, `pagos`)
- WHEN `DELETE FROM tenants WHERE id = $1` executes
- THEN all child rows MUST be deleted with zero orphaned rows remaining

### Requirement: Simplified Tenant Deletion RPC

`cloudix_super_admin_delete_tenant` MUST collect auth user IDs, delete `auth.users` entries, then execute a single `DELETE FROM tenants WHERE id = $1` — cascade handles all children.

#### Scenario: Super-admin deletes tenant

- GIVEN a valid super-admin caller and an existing tenant with users
- WHEN `cloudix_super_admin_delete_tenant(p_tenant_id)` is called
- THEN all `auth.users` entries for the tenant's users MUST be deleted
- AND the tenant row MUST be deleted (cascade cleans child tables)
- AND a `{ok: true, tenant_id, deleted_users}` JSONB response is returned

#### Scenario: Non-super-admin rejected

- GIVEN the caller does NOT pass `cloudix_is_super_admin()`
- WHEN the RPC is called
- THEN it MUST raise an exception

### Requirement: Auth Cleanup on User Deletion

Both `cloudix_owner_delete_staff_user` and `cloudix_super_admin_delete_tenant_user` MUST delete from `auth.users` when `auth_user_id IS NOT NULL`. (Already implemented — audit and integration test only.)

#### Scenario: User with auth account deleted

- GIVEN a `tenant_users` row with a non-null `auth_user_id`
- WHEN either deletion RPC is called
- THEN the corresponding `auth.users` row MUST be deleted
- AND references in `cierres_operativos` and `comandas` MUST be nullified first

### Requirement: One Tenant per Auth Identity

`tenant_users.auth_user_id` MUST have a database-enforced unique index for non-null
values. The migration MUST fail with the duplicate Auth IDs and tenant-user row IDs
before creating the index.

#### Scenario: Auth identity cannot cross tenant boundaries

- GIVEN an Auth identity is already linked to one tenant
- WHEN a second `tenant_users` row for another tenant uses the same `auth_user_id`
- THEN the database MUST reject the insert or update

### Requirement: Realtime Access Lifecycle

Protected realtime subscriptions MUST be disposed when tenant access becomes
unvalidated or the owning effect unmounts. If asynchronous subscription setup
resolves after disposal, the resulting subscription MUST be unsubscribed
immediately and MUST NOT attach event handlers.

#### Scenario: Access denied during subscription setup

- GIVEN a protected realtime subscribe call is in flight
- WHEN tenant access becomes denied before it resolves
- THEN the resulting channel MUST be unsubscribed and no handlers may be attached

Multiple validated consumers of the same tenant channel MUST use one shared
reference-counted subscription. The first consumer subscribes once, intermediate
consumer cleanup only detaches that consumer, and the final cleanup unsubscribes
the SDK-global channel exactly once.

### Requirement: Realtime Tenant Access State

The authenticated tenant member MUST observe only their own tenant's `activa`
state through a dedicated Realtime channel. The channel MUST remain observable
while the tenant is blocked, MUST NOT permit client publication or mutation, and
MUST deliver both active-to-blocked and blocked-to-active transitions.

The client MUST own this channel in the auth/access layer. A blocked transition
MUST immediately hide protected tenant context and release protected services;
an active transition MUST revalidate membership and restore them without focus,
reload, sign-out, or reauthentication. Reconnects and a bounded reconciliation
cadence MUST reconcile the current backend state.

#### Scenario: Connected client is blocked

- GIVEN an authenticated member is connected to `tenant-access:<tenant-id>`
- WHEN the tenant `activa` value changes from true to false
- THEN the client MUST enter denied access immediately
- AND protected realtime/local-first services MUST be released
- AND operational data and outboxes MUST remain intact

#### Scenario: Connected client is unblocked

- GIVEN an authenticated member remains connected while their tenant is blocked
- WHEN the tenant `activa` value changes from false to true
- THEN the client MUST revalidate membership and restore the tenant context
- AND protected services MUST resume without focus or reauthentication

#### Scenario: Access channel isolation

- GIVEN a client is authenticated as a member of tenant A
- WHEN it subscribes to the access channel
- THEN it MUST be allowed only `tenant-access:<tenant-A>`
- AND it MUST be unable to observe or publish tenant B access state

### Requirement: Temporary Blocking Preserves Data

Blocking or denying tenant access MUST NOT delete the tenant's local IndexedDB,
operational mirrors, sync outbox, fiscal outbox, or cloud operational data.
Blocking MAY invalidate only the local session credential/context used for
automatic hydration. Explicit tenant deletion is the sole destructive flow.

#### Scenario: Blocked tenant reconnects later

- GIVEN a tenant is temporarily blocked with local sales and pending outbox rows
- WHEN access denial is processed
- THEN the local operational database and outboxes MUST remain intact
- AND only the local automatic-hydration session context MAY be removed
