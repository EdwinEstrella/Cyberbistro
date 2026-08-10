# Desktop Local Persistence Specification

## Purpose

Define local-first ownership, per-tenant SQLite durability, offline operation, migration, backup, and rollback for the complete desktop POS.

## Requirements

### Requirement: Whole-System Local-First Runtime

The desktop runtime MUST use the active tenant's SQLite store as the normal read/write source for every supported tenant-scoped module and workflow: sales/dashboard, orders, waiter, tables, kitchen, deliveries, customers, inventory/products/recipes, purchases/suppliers, expenses, closings, accounts payable/receivable, fiscal records, branches/settings, digital-menu data/orders, and tenant-scoped support or analytics. Each successful mutation MUST commit locally before UI success and enqueue synchronization. InsForge MAY provide synchronization, backup, recovery, identity/authorization, online tenant switching, licensing/expiry authority, or named external fiscal processing, but MUST NOT be a routine runtime fallback. No other cloud exception is implicit.

#### Scenario: Cloud outage across modules

- GIVEN a validated tenant session and an unavailable cloud
- WHEN any listed module reads or mutates tenant data
- THEN it reads SQLite or commits SQLite plus an outbox entry
- AND it does not report success for a cloud-only write

#### Scenario: No module bypass

- GIVEN a supported module has local SQLite data and cloud data is reachable
- WHEN the module loads or saves a tenant-scoped record
- THEN the observed source and commit are SQLite-first
- AND cloud access is limited to synchronization or a named exception

#### Scenario: Tenant cache isolation

- GIVEN tenant A is active and tenant B data exists on the device
- WHEN any module requests a record or cache entry
- THEN only tenant-A rows and session-scoped cache keys are returned
- AND a missing A row never falls back to tenant-B data

### Requirement: Per-Tenant Durable Desktop Store

The desktop runtime MUST keep operational data in a per-tenant main-process SQLite store behind typed, sender-validated IPC. It MUST pin tenant identity, enforce relational integrity, support backup, keep the complete local-first module set available for validated sessions offline for 30 days, and block offline tenant switching. Live SQLite encryption is NOT required. Practical user-scoped file permissions MUST protect database files, and secrets or credentials MUST remain outside SQLite and MUST NOT be stored in plaintext.

#### Scenario: Tenant-bound IPC

- GIVEN tenant A is active
- WHEN the renderer supplies a forged tenant, path, SQL, or table identifier
- THEN only validated tenant-A operations are accepted
- AND arbitrary database access is rejected

#### Scenario: Offline expiry

- GIVEN a validated tenant session has been offline for 30 days
- WHEN the desktop starts
- THEN the session is denied without exposing data
- AND tenant switching is not an offline bypass

#### Scenario: Local data protection boundary

- GIVEN a tenant SQLite database and its runtime configuration exist on a device
- WHEN a security inspection reads the database and configuration
- THEN database encryption is not required and database-file permissions are user-scoped
- AND no secret or credential is present as plaintext in SQLite or configuration

#### Scenario: Crash-safe import and rollback

- GIVEN IndexedDB contains pending outbox or fiscal records
- WHEN migration or activation is interrupted or validation fails
- THEN SQLite is not activated with partial data
- AND stale `syncing` records reset to `pending` while IndexedDB remains recoverable
