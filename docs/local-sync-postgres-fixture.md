# Local Sync PostgreSQL Fixture

This fixture is an isolated PostgreSQL 17 database for Slice 3's dormant `sync_*` protocol validation. It contains no application tables, production URL, InsForge credential, active-user configuration, or production data.

## Quick path

1. Validate the files and generate a local-only password without starting a container:

   ```powershell
   .\scripts\local-sync-postgres.ps1 init
   ```

2. Start the fixture when you are ready to run protocol checks:

   ```powershell
   .\scripts\local-sync-postgres.ps1 start
   ```

3. Assert the dormant schema, grants, RLS, synthetic seed, and all four `sync_*` RPC responses:

   ```powershell
    .\scripts\local-sync-postgres.ps1 validate
    ```

4. Run only the synthetic protocol handlers. This never enables the seeded tenant or the dormant `cloudix_sync_*` RPCs:

   ```powershell
   .\scripts\local-sync-postgres.ps1 protocol
   ```

5. Stop it while retaining its local named volume:

   ```powershell
   .\scripts\local-sync-postgres.ps1 stop
   ```

## Reset

Reset destroys only the named Docker volume `cyberbistro_sync_fixture_pgdata`. It does not start a container, alter the app, or contact InsForge.

```powershell
.\scripts\local-sync-postgres.ps1 reset
```

Run `start` afterwards to create a fresh schema and synthetic seed.

## Fixture contract

| Item | Local fixture value |
|---|---|
| PostgreSQL image | `postgres:17.4-alpine` |
| Host endpoint | `127.0.0.1:55432` only |
| Database/user | `cyberbistro_sync_fixture` / `sync_fixture` |
| Credentials | Generated into ignored `fixtures/local-sync-postgres/.env` |
| Seed tenant | `11111111-1111-1111-1111-111111111111`, disabled |
| Seed device | `22222222-2222-2222-2222-222222222222` |
| Seed operations/events | None |

The schema has only `sync_tenants`, `sync_operations`, `sync_stream_heads`, `sync_events`, and `sync_devices`. The four RPCs intentionally return `sync_disabled`; no handlers, business tables, capture triggers, or activation rows are included.

## Safety proof

- `compose.yaml` has no application environment file, URL, InsForge key, database URL, service dependency, or production mount.
- PostgreSQL is bound only to loopback on a non-default port. There is no externally reachable host port.
- The only Docker network is declared `internal: true`, isolating the container from external networks.
- The only writable persistence is the explicitly named local Docker volume. Schema, seed, and validation scripts are mounted read-only.
- The lifecycle script invokes only local `docker compose` commands. It does not call InsForge, npm scripts, application code, HTTP clients, or production tooling.
- `init` validates Compose with `docker compose config --quiet`; it does not start the service.

## Next validation

Use this fixture as the runtime target for the pending `test/local-sync-protocol.test.ts` contracts: identity/tenant/device/table rejection, idempotency, cursor pagination, acknowledgement boundaries, tombstone replay, and timeout/plan checks. Those tests require a later, explicit fixture-only implementation of activated protocol handlers; do not enable the seeded tenant or point app runtime configuration at this database.
