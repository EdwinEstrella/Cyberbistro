# Tenant Membership Selection Specification

## Purpose

Define truthful membership outcomes, isolated local selection caches, and safe tenant switching.

## Requirements

### Requirement: Explicit Tenant Access and Safe Switching

The system MUST distinguish active memberships, authorization errors, cloud-unavailable states, blocked access, and `truly_unlinked`; only `truly_unlinked` MAY show the unlinked-business UI. The active tenant's operational data MUST be read from its local SQLite store. Selection caches and hydrated sessions MUST be scoped to authenticated user and tenant. Switching MUST require online authorization and MUST NOT discard unsynchronized data.

#### Scenario: Non-unlinked failure

- GIVEN membership resolution returns an authorization, cloud, or cardinality error
- WHEN access state is presented
- THEN the error-specific state is shown
- AND the account is not reported as unlinked

#### Scenario: Safe switch

- GIVEN tenant A has pending outbox operations
- WHEN a user requests tenant B while online
- THEN B activates only after explicit membership validation
- AND A remains recoverable until synchronization or support-controlled recovery

#### Scenario: Isolated offline cache

- GIVEN tenant A is active and tenant B has cached membership or module rows
- WHEN the app starts offline or a module hydrates its local state
- THEN only A's user-and-tenant-scoped cache is eligible
- AND B's cache cannot satisfy an A lookup
