# Proposal: Migrate Desktop Runtime to Local SQLite

## Intent

Make per-tenant SQLite the desktop POS source of truth and InsForge only backup/synchronization. Preserve all POS workflows through Internet, cloud, or power disruption and allow validated sessions offline for 30 days without false unlinked-business errors.

## Proposal Question Round

- Which workflows define release-blocking “all POS functionality”?
- Who may recover unsynced tenant data after switching fails?
- Must LAN replication remain enabled before tenant authorization ships?

Assumptions: current POS workflows are the baseline, recovery is support-controlled, and insecure LAN replication is disabled.

## Scope

### In Scope
- Main-process per-tenant SQLite behind validated, typed IPC.
- Explicit membership outcomes and user/tenant-scoped selection caches; no offline switching.
- Crash-safe IndexedDB import and outbox preserving pending writes and fiscal intent.
- Phased sync cutover, safe business switching, backup, and rollback.

### Out of Scope
- InsForge or realtime as runtime authority.
- Immediate IndexedDB deletion.
- Generic last-write-wins for fiscal, closure, inventory, or deletion conflicts.

## Capabilities

### New Capabilities
- `desktop-local-persistence`: SQLite lifecycle, typed IPC, offline runtime, migration, and backup.
- `tenant-membership-selection`: Accurate access states, isolated caches, and safe switching.
- `durable-cloud-synchronization`: Idempotency, tombstones, server cursors, recovery, and cleanup.
- `secure-lan-replication`: Tenant-authorized LAN traffic or disabled replication.

### Modified Capabilities
- `tenant-fiscal-modes`: Offline fiscal operation survives migration and crashes.
- `ecf-document-lifecycle`: Pending fiscal intent remains recoverable before server processing.

## Approach

1. Separate membership, authorization, and cloud errors; only `truly_unlinked` shows unlinked UI.
2. Add the storage port and Node 24 `node:sqlite` foundation with foreign keys, WAL, migrations, and pinned tenant identity.
3. Transactionally import into a temporary file; verify tenant, hashes, integrity, and outbox IDs before atomic activation. Reset interrupted `syncing` operations to `pending`.
4. Add idempotent push and monotonic cursor/tombstone pull, shadow-compare, then cut over.

Despite `single-pr`, this likely exceeds 800 lines. Split delivery into identity/storage, importer, sync protocol, and legacy/LAN retirement PRs.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `electron/` | Modified | SQLite, IPC, activation, import |
| `src/shared/lib/` | Modified | Storage, auth/cache, sync |
| `migrations/` | Modified | Membership and sync contracts |
| `openspec/specs/` | Modified | Offline fiscal durability |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Lost/duplicated writes | High | Transactions, immutable IDs, deduplication |
| Cross-tenant leak | High | Main-process pinning; scoped caches |
| False unlinked state | High | Discriminated access outcomes |
| Oversized delivery | High | Independent PR rollback gates |

## Rollback Plan

Retain IndexedDB read-only for at least one release. On failure, quarantine SQLite and restore the unchanged adapter. Never delete a previous tenant database until pending writes are synchronized or durably recoverable.

## Dependencies

- Packaged Electron 41 validation of Node 24 `node:sqlite` and backup.
- Membership migration, idempotent server endpoint, monotonic change feed.
- At-rest protection decision.

## Success Criteria

- [ ] All POS workflows recover after offline and power-loss tests.
- [ ] Offline sessions expire at 30 days; switching stays blocked offline.
- [ ] Migration/switching lose no writes and expose no tenant data.
- [ ] Authorization, cloud, and cardinality failures never report unlinked.
