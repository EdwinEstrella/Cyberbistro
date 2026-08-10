# Delta for e-CF Document Lifecycle

## MODIFIED Requirements

### Requirement: Offline Pending Fiscal Sync

Offline `dgii_ecf` sales MUST create durable local fiscal intent, preserve it through IndexedDB import, SQLite activation, crashes, and retries, and show pending fiscal sync until server persistence and worker processing complete. SQLite MUST be the normal source for the sale and fiscal lifecycle; InsForge synchronization and the DGII worker are explicit external authorities only for server persistence, processing, and acceptance.
(Previously: Offline e-CF sales created local fiscal intent and became processable after generic writes synchronized, but migration, crash durability, and the whole-system local-first boundary were unspecified.)

#### Scenario: Offline e-CF sale

- GIVEN the desktop app is offline and the tenant uses `dgii_ecf`
- WHEN checkout completes
- THEN the sale and fiscal lifecycle are recorded locally as pending sync
- AND the UI does not show acceptance

#### Scenario: Reconnect after interruption

- GIVEN pending fiscal records exist and migration or sync was interrupted
- WHEN the app reconnects and recovery completes
- THEN the same fiscal intent is submitted once for worker processing
- AND acceptance is shown only after confirmed DGII response data

#### Scenario: e-CF cloud outage

- GIVEN SQLite is healthy and the cloud or DGII worker is unavailable
- WHEN a `dgii_ecf` checkout completes
- THEN the sale and fiscal intent remain locally durable and visibly pending
- AND the UI does not claim server persistence or DGII acceptance
