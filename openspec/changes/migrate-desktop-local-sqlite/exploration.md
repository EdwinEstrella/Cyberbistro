## Exploration: migrate-desktop-local-sqlite

### Current State
Cyberbistro is already desktop-local-first at its renderer boundary. `src/shared/lib/localFirst.ts` creates one IndexedDB database per tenant (`cloudix-local-first-{tenantId}`), mirrors 34 cloud tables, and keeps outbox, cursor, error, device-session, license, and fiscal metadata in the same tenant database. Electron writes commit the mirror row and outbox entry in one IndexedDB transaction; background work pushes to InsForge, pulls incremental changes, and exchanges events through the LAN edge. Web remains server-first unless local-first is explicitly enabled or the app is served by the LAN edge.

The Electron main process does not own operational data today. `electron/main.ts` owns windows, printing, certificates, updates, and the LAN server, while `electron/preload.ts` exposes narrow IPC methods. All IndexedDB access, tenant session state, InsForge auth, bootstrap, and cloud sync run in the renderer. This makes the renderer both UI and data/sync authority.

Authentication resolves exactly one business. `resolveTenantAccessForSession()` queries `tenant_users` with `maybeSingle()`, then falls back to an RPC whose latest migration uses `LIMIT 1`. The database also has a partial unique index on `tenant_users.auth_user_id`, so one authenticated user cannot currently belong to multiple businesses. Failures from all resolution paths eventually collapse to `unlinked` unless the error is recognized as a cloud-availability failure and a matching cache exists. Consequently, an RLS/API/cardinality error, an unclassified transient response, or a future multi-membership `maybeSingle()` error can surface as “account not linked to a business.” `probeCloudAvailability()` also treats non-404 responses below 500, including 401/403, as cloud availability, so connectivity and authorization are not cleanly separated.

Tenant data is mostly partitioned by database name and cloud query filters, but tenant selection/session state is global: `cloudix_last_tenant_id` and `cloudix_tenant_ctx_v1` hold one tenant, and `getLocalDeviceSession()` trusts the last tenant without requiring an expected auth user. Offline startup can therefore hydrate the previous local device session if account switching or future business switching leaves those pointers stale. A renderer can also request any known tenant database by passing a tenant ID. The LAN edge is a more direct boundary risk: it binds to all interfaces, allows `Access-Control-Allow-Origin: *`, accepts unauthenticated event writes, and returns event payloads for any requested `tenant_id`; all tenants share one plaintext NDJSON event log.

Current sync correctness is stronger than the original implementation but still unsuitable as a durable replication protocol. It has atomic local mirror/outbox writes, per-tenant push locks, conflict rules, retry/error rows, and compound `(updated_at,id)` pull cursors. However, cloud writes are direct per-row SDK calls without a server-side idempotency contract; update/delete filters use only `id`; delete tombstones are absent from pull; realtime is access-oriented rather than a durable change feed; client timestamps remain cursor inputs; and LAN events are an unauthenticated append-only side channel. InsForge documentation confirms CRUD is request-oriented and realtime resubscription provides fresh presence, not missed event replay, so durable sync must be implemented above those APIs.

Current Electron 41 ships Node 24, where the built-in `node:sqlite` API and backup function are available. This avoids native-addon rebuild and ASAR packaging complexity. Electron guidance supports a main-process service exposed through one narrow `contextBridge` method per IPC operation, with runtime argument validation and IPC sender validation; raw `ipcRenderer`, arbitrary SQL, and renderer-selected file paths must not be exposed.

### Affected Areas
- `src/shared/lib/localFirst.ts` — IndexedDB schema, local repositories, tenant files, outbox, bootstrap, pull/push, conflicts, license, and local device session are currently coupled in one renderer module.
- `src/shared/hooks/useAuth.ts` — global cached tenant hydration can confuse cloud failure, authorization failure, and unlinked state; offline hydration does not bind the loaded session to an expected user.
- `src/shared/lib/resolveTenantUserFromAuth.ts` — single-business `maybeSingle()` resolution and error collapsing must become an explicit membership-list/selection contract.
- `src/shared/lib/tenantSessionCache.ts` — stores one global auth-user/tenant association instead of selected membership keyed by user and tenant.
- `src/shared/hooks/useLocalFirstBootstrap.ts` — renderer owns bootstrap and sync scheduling; it should consume repository/sync state rather than manipulate storage directly.
- `electron/main.ts` — target owner for SQLite lifecycle, migrations, backups, tenant activation, and eventually the sync worker.
- `electron/preload.ts` and `src/shared/types/electron.d.ts` — require a narrow, validated, typed persistence IPC contract.
- `electron/lanEdgeServer.ts` and `src/shared/lib/lanEdgeClient.ts` — unauthenticated cross-tenant event log must be secured, partitioned, or removed from the trusted replication path.
- `migrations/20260715120000_tenant-management.sql` — partial unique `auth_user_id` index explicitly prevents multi-business membership.
- `migrations/20260715130000_tenant-access-authoritative-rules.sql` — resolver RPC returns one arbitrary eligible membership with `LIMIT 1`.
- `src/features/auth/components/LoginForm.tsx` and `src/app/components/RoleGuard.tsx` — present the false `unlinked` result and have no business selector or degraded-cloud state.
- Feature modules calling `readLocalMirror()`, `shouldReadLocalFirst()`, and `enqueueLocalWrite()` — can retain their public adapter initially, but Electron implementations must route over IPC while browser implementations remain InsForge-backed.
- `package.json` — Electron 41 can use built-in `node:sqlite`; no SQLite native dependency is required, but runtime/version support must be verified in packaged builds.

### Approaches
1. **Per-tenant main-process SQLite with typed IPC** — create one SQLite file per tenant under `app.getPath("userData")`, pin the active tenant in the main process after validated membership selection, and adapt existing local-first functions to IPC-backed repositories.
   - Pros: strongest accidental tenant isolation; transactional constraints and indexes; straightforward per-tenant backup/delete/export; no native addon if `node:sqlite` is used; smallest feature-level cutover because existing local-first adapters can remain.
   - Cons: requires schema migrations, IPC contracts, IndexedDB export/import, packaged-runtime tests, and explicit cross-tenant switching; cloud sync must be redesigned rather than copied.
   - Effort: High

2. **Single device SQLite database with mandatory `tenant_id` keys** — store every business in one file and enforce composite tenant keys and repository filters.
   - Pros: simpler global migrations, membership catalog, and multi-business switching; one backup artifact.
   - Cons: one missed filter or malformed IPC request can expose another tenant; larger blast radius for corruption and restore; harder per-tenant deletion and support export.
   - Effort: High

3. **Keep per-tenant IndexedDB and harden auth/sync only** — fix error classification, tenant selection, LAN authentication, and replication semantics without changing the engine.
   - Pros: lowest migration and rollback risk; preserves current renderer APIs and tests.
   - Cons: renderer remains the data authority; weaker schema constraints/query ergonomics; does not establish the requested main-process ownership boundary.
   - Effort: Medium

### Recommendation
Use Approach 1, but stage it rather than performing a big-bang storage rewrite.

1. **Correct tenant identity first.** Replace the scalar resolver with an explicit result union such as `active_memberships | blocked | truly_unlinked | cloud_unavailable | authorization_error`. Decide and migrate the cloud membership model before claiming multi-business support: remove/replace the unique `auth_user_id` index, return all authorized memberships, require explicit selection, and scope cached selection by `authUserId + tenantId`. Immediately require authentication and tenant authorization on LAN edge reads/writes, or disable LAN replication until that exists.
2. **Introduce a storage port without changing feature behavior.** Keep browser/server-first code unchanged. Preserve the existing `readLocalMirror`/`enqueueLocalWrite` facade for Electron, but make it call typed preload methods. Main process selects the database from its activated tenant context; renderer requests must not include arbitrary file paths, SQL, or an independently trusted tenant ID. Validate IPC payloads and sender URLs.
3. **Create the SQLite foundation.** Prefer built-in `node:sqlite` for Electron 41, one file per tenant, WAL mode with deliberate checkpointing, foreign keys enabled, `schema_migrations`, `tenant_identity`, normalized operational tables, durable `sync_operations`, `sync_failures`, `sync_cursor`, and tombstones. Secrets and refresh tokens should remain outside plaintext SQLite and use `safeStorage` or an OS credential store.
4. **Run a crash-safe lazy migration per tenant.** After a tenant is selected, freeze local mutations briefly, export IndexedDB stores plus manifest, counts, hashes, and pending outbox entries through a one-time bounded IPC importer. Import into a temporary SQLite file in one transaction, validate tenant ownership, foreign keys, `integrity_check`, counts, hashes, and outbox identity, then atomically rename. Reset stale `syncing` entries to `pending`. Keep IndexedDB read-only for at least one rollback release and never delete it automatically on first success.
5. **Replace sync with an explicit protocol.** Every local mutation needs immutable `operation_id`, tenant, device, entity, row, operation, client sequence, base server version, payload hash, retry metadata, and dependency/aggregate ordering. Push through an idempotent server RPC or function that atomically deduplicates and returns authoritative versions; pull by a server-issued monotonic change cursor with tombstones. Advance cursors only after a committed local apply. Realtime may trigger a pull but must not be the source of truth. Bootstrap must return a snapshot and its matching cursor. Fiscal, closure, identity, and inventory conflict policies require dedicated rules.
6. **Cut over and remove IndexedDB only after evidence.** Shadow-compare SQLite and IndexedDB during migration testing, exercise power-loss and network-loss cases, test business/account switching, packaged Windows upgrades/downgrades, backup/restore, duplicate operation delivery, cursor replay, and tenant revocation. Remove renderer IndexedDB access and legacy LAN event storage only after rollback telemetry is acceptable.

This change is likely to exceed the 800-line review budget if tenant model, SQLite, migration, sync redesign, and LAN security are implemented together. With the fixed single-PR strategy, the proposal should narrow the first PR to the tenant/auth contract, storage port, SQLite foundation, and safe importer, while treating full sync cutover as a subsequent named change; otherwise review and rollback risk will be high.

### Risks
- A SQLite engine swap without a new idempotent sync protocol will preserve current replication bugs in a more durable store.
- Removing the cloud `auth_user_id` uniqueness constraint without adding explicit membership selection will create cardinality errors or arbitrary tenant choice.
- Main-process IPC can recreate the same tenant leak if it trusts renderer-provided tenant IDs, table names, SQL, or file paths.
- The current unauthenticated LAN edge can expose or inject tenant event payloads from another device on the local network.
- IndexedDB-to-SQLite migration can lose pending fiscal/outbox operations unless IDs, ordering, statuses, and payload hashes are preserved and verified.
- SQLite and WAL files are plaintext by default; local credential, personal, and fiscal-data protection needs a separate at-rest security decision.
- Full-table schemas and constraints may drift from InsForge/Postgres; local migrations need explicit compatibility tests for every supported app upgrade path.
- Multi-device fiscal sequences, closures, inventory, and deletes cannot safely use generic last-write-wins rules.
- Electron 41 is near end of support as of August 2026; the SQLite choice must be verified against the Electron upgrade plan, not only the current runtime.
- A single large PR would exceed the stated review budget and make rollback boundaries difficult to prove.

### Ready for Proposal
Yes — propose a staged per-tenant main-process SQLite architecture, but make tenant/auth resolution and LAN boundary security prerequisites. The proposal should explicitly separate local operational ownership from cloud synchronization/backup, define migration rollback guarantees, and avoid promising multi-business support until the cloud membership schema and business-selection state machine are redesigned.
