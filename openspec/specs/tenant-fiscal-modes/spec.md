# Tenant Fiscal Modes Specification

## Purpose

Define tenant fiscal modes so Cyberbistro can choose between internal receipts, legacy NCF, and DGII e-CF without changing existing checkout behavior by accident.

## Requirements

### Requirement: Explicit Fiscal Mode

Each tenant MUST have one active fiscal mode: `internal_receipt`, `ncf_legacy`, or `dgii_ecf`. Existing `ncf_fiscal_activo = false` behavior MUST map to `internal_receipt`; `true` MUST map to `ncf_legacy` until explicitly changed.

#### Scenario: Legacy boolean migration

- GIVEN a tenant has only `ncf_fiscal_activo`
- WHEN fiscal settings are loaded
- THEN `false` resolves to `internal_receipt`
- AND `true` resolves to `ncf_legacy`

#### Scenario: Explicit e-CF mode

- GIVEN a tenant is configured as `dgii_ecf`
- WHEN a fiscal sale is created
- THEN the sale uses e-CF fiscal intent instead of B-series NCF reservation

### Requirement: Legacy Non-Regression

`internal_receipt` and `ncf_legacy` modes MUST preserve current invoice creation, offline operation, B-series sequence reservation, and printed receipt behavior.

#### Scenario: Internal receipt unchanged

- GIVEN a tenant uses `internal_receipt`
- WHEN checkout completes
- THEN the invoice is created without NCF or e-CF records

#### Scenario: Legacy NCF unchanged

- GIVEN a tenant uses `ncf_legacy`
- WHEN checkout completes online or offline
- THEN the existing B-series NCF reservation path remains valid

### Requirement: Mode Readiness Guard

The system MUST NOT allow `dgii_ecf` to become operational unless required fiscal configuration, certificate metadata, and worker readiness checks pass.

#### Scenario: Missing certificate

- GIVEN a tenant selects `dgii_ecf`
- WHEN no valid certificate metadata exists
- THEN the mode is shown as not ready
- AND sales cannot display DGII acceptance

#### Scenario: Safe fallback

- GIVEN `dgii_ecf` is disabled for rollback
- WHEN checkout continues
- THEN the tenant can use `internal_receipt` or `ncf_legacy` according to configured fallback
