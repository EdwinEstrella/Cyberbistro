# Secure Fiscal Worker Specification

## Purpose

Protect fiscal certificates and DGII credentials by moving `.p12` custody, signing, submission, and polling to a trusted Node.js worker boundary.

## Requirements

### Requirement: Certificate Secret Boundary

The system MUST NOT expose `.p12` bytes, passphrases, private keys, or derived signing keys to React, localStorage, IndexedDB, Electron preload, or the Electron renderer.

#### Scenario: Certificate upload

- GIVEN a tenant uploads a fiscal certificate
- WHEN validation begins
- THEN certificate material is handled only by trusted server/worker infrastructure
- AND the renderer receives only non-secret metadata

#### Scenario: Renderer request

- GIVEN renderer code requests fiscal status
- WHEN data is returned
- THEN no certificate secret or private key material is included

### Requirement: Server-Side DGII Operations

The worker MUST perform XML generation/signing, DGII authentication, submission, polling, and status persistence outside the POS renderer.

#### Scenario: Worker submission

- GIVEN a server fiscal outbox entry is ready
- WHEN the worker processes it
- THEN it signs with tenant certificate custody
- AND stores DGII track/status results

#### Scenario: Worker failure

- GIVEN DGII or certificate validation fails
- WHEN the worker records the failure
- THEN the fiscal lifecycle captures retryability and operator-visible reason

### Requirement: Operational Safeguards

The worker MUST enforce tenant isolation, idempotency, audit logs, and environment selection for DGII test/certification/production.

#### Scenario: Duplicate processing

- GIVEN the same fiscal outbox entry is picked twice
- WHEN processing starts
- THEN only one accepted submission is recorded

#### Scenario: Wrong tenant access

- GIVEN a worker job references tenant fiscal material
- WHEN tenant ownership does not match
- THEN the job is rejected and audited
