# Unified Fiscal Engine Specification

## Purpose

Unify checkout fiscal orchestration so takeout, table, split bills, printing, and fiscal operations use one fiscal contract.

## Requirements

### Requirement: Shared Checkout Fiscal Orchestration

Checkout flows MUST call a shared fiscal engine that resolves tenant mode, creates invoice fiscal payloads, and records fiscal lifecycle intent.

#### Scenario: Takeout checkout

- GIVEN a takeout sale completes
- WHEN fiscal processing runs
- THEN it uses the same mode rules as table checkout

#### Scenario: Split table checkout

- GIVEN a table account is split into multiple invoices
- WHEN fiscal processing runs
- THEN each invoice receives an independent fiscal lifecycle decision

### Requirement: Fiscal Output Consistency

Printed receipts and invoice views MUST represent fiscal state without implying DGII acceptance before confirmation.

#### Scenario: Pending e-CF print

- GIVEN an e-CF sale is pending DGII processing
- WHEN a receipt is printed
- THEN it shows pending fiscal status, not accepted status

#### Scenario: Legacy print

- GIVEN a legacy NCF invoice exists
- WHEN a receipt is printed
- THEN current NCF fields remain visible as before

### Requirement: Fiscal Operations Panel

The system SHOULD provide an operator view for pending, submitted, accepted, rejected, and retryable fiscal records.

#### Scenario: Pending records

- GIVEN pending fiscal records exist
- WHEN an operator opens the fiscal panel
- THEN records are filterable by fiscal status and invoice reference

#### Scenario: Retryable failure

- GIVEN a fiscal record has a retryable worker failure
- WHEN an operator reviews it
- THEN the reason and next retry action are visible
