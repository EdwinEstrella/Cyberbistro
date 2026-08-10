# Delta for Tenant Fiscal Modes

## MODIFIED Requirements

### Requirement: Legacy Non-Regression

`internal_receipt` and `ncf_legacy` modes MUST preserve current invoice creation, local-first offline operation, B-series sequence reservation, and printed receipt behavior across SQLite migration, crash recovery, and synchronization. SQLite MUST be the normal source for invoice and sequence reads/writes; cloud access MAY synchronize or recover them but MUST NOT be required for routine local operation. Pending fiscal intent MUST NOT be lost or duplicated.
(Previously: The modes preserved invoice creation, offline operation, sequence reservation, and printed receipts without migration-specific durability guarantees or an explicit whole-system local-first source.)

#### Scenario: Internal receipt unchanged

- GIVEN a tenant uses `internal_receipt`
- WHEN checkout completes
- THEN the invoice is created without NCF or e-CF records

#### Scenario: Legacy NCF survives recovery

- GIVEN a tenant uses `ncf_legacy` and checkout commits before a crash or disconnect
- WHEN the SQLite store is reopened and synchronized
- THEN the existing B-series reservation remains valid
- AND the sale is not duplicated or lost

#### Scenario: Legacy mode during cloud outage

- GIVEN a tenant uses `internal_receipt` or `ncf_legacy` and SQLite is healthy
- WHEN checkout runs without cloud access
- THEN the invoice and fiscal intent commit locally before the UI succeeds
- AND synchronization is deferred without changing the receipt result
