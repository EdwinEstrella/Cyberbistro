# Durable Cloud Synchronization Specification

## Purpose

Define lossless, replay-safe synchronization, backup, and recovery between tenant SQLite and InsForge.

## Requirements

### Requirement: SQLite-First Idempotent Replication

Every local mutation MUST have an immutable tenant-scoped operation identity, payload integrity metadata, ordering information, and retry state before cloud synchronization. Cloud push MUST deduplicate operations and return authoritative synchronization results; pull MUST use a server-issued monotonic cursor with tombstones and apply changes locally before advancing it. InsForge is synchronization, backup, and recovery infrastructure, not the normal module read/write source. Realtime MAY trigger pulls but MUST NOT become the source of truth. Fiscal, closure, inventory, and deletion conflicts MUST NOT use generic last-write-wins.

#### Scenario: Local commit while cloud is unavailable

- GIVEN a supported module has a validated tenant session and the cloud is unavailable
- WHEN it commits a mutation
- THEN SQLite commits the record and retryable outbox entry atomically
- AND no cloud response is required for user-visible success

#### Scenario: Duplicate delivery

- GIVEN an operation has already been accepted
- WHEN the same operation is pushed again after a timeout
- THEN the cloud returns the prior authoritative result
- AND no duplicate business or fiscal record is created

#### Scenario: Interrupted pull

- GIVEN a change batch includes an update and a tombstone
- WHEN local application fails before commit
- THEN the cursor is not advanced
- AND retrying applies the complete batch exactly once
