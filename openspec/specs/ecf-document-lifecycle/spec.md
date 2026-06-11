# e-CF Document Lifecycle Specification

## Purpose

Define e-CF persistence, fiscal outbox, DGII status tracking, and offline behavior independently from payment state and generic local-first sync.

## Requirements

### Requirement: Separate Fiscal Lifecycle

The system MUST store e-CF lifecycle state separately from `facturas.estado`, payment state, and client `sync_outbox` status.

#### Scenario: Paid but pending DGII

- GIVEN an invoice is paid
- WHEN its e-CF has not been accepted by DGII
- THEN payment state remains paid
- AND fiscal state remains pending or processing

#### Scenario: DGII rejection

- GIVEN DGII rejects an e-CF
- WHEN status is recorded
- THEN the fiscal state becomes rejected
- AND the invoice payment state is not overwritten

### Requirement: Truthful DGII Acceptance Display

The system MUST display DGII acceptance only when confirmed by server-side DGII response data.

#### Scenario: Submitted document

- GIVEN an e-CF was submitted and has a track ID
- WHEN DGII has not returned accepted status
- THEN the UI MUST NOT label it accepted

#### Scenario: Accepted document

- GIVEN DGII returns accepted status for a track ID
- WHEN the fiscal status is refreshed
- THEN the UI MAY display accepted with the confirmed timestamp and track reference

### Requirement: Offline Pending Fiscal Sync

Offline `dgii_ecf` sales MUST create local fiscal intent and show pending fiscal sync until server persistence and worker processing complete.

#### Scenario: Offline e-CF sale

- GIVEN the desktop app is offline and the tenant uses `dgii_ecf`
- WHEN checkout completes
- THEN the sale is locally recorded
- AND the fiscal lifecycle is pending sync, not accepted

#### Scenario: Reconnect processing

- GIVEN pending fiscal records exist locally
- WHEN the app reconnects and generic writes sync
- THEN the server fiscal outbox becomes processable by the fiscal worker
