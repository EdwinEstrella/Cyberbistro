import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import {
  DurableSyncWorker,
  type ServerSyncClient,
} from "../electron/persistence/syncWorker";
import {
  reconcileGhostCycles,
  createSupabaseGhostCycleCloudPort,
  isConflictOutboxError,
  type GhostCycleCloudPort,
} from "../electron/persistence/ghostCycleReconcile";
import { classifyRemoteError } from "../electron/persistence/payrollSyncClient";

const TENANT = "tenant-ghost-test";

interface LocalCycleInsert {
  id: string;
  tenantId?: string;
  sucursalId?: string | null;
  businessDay?: string;
  openingCash?: number;
  state?: "open" | "closed";
  closedAt?: string | null;
  cycleNumber?: number | null;
  openedAt?: string;
}

function insertLocalCycle(db: DatabaseSync, cycle: LocalCycleInsert): void {
  db.prepare(`
    INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, closed_at, cycle_number, opened_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cycle.id,
    cycle.tenantId ?? TENANT,
    cycle.sucursalId !== undefined ? cycle.sucursalId : "branch-1",
    cycle.businessDay ?? "2026-09-19",
    cycle.openingCash ?? 1000,
    cycle.state ?? "open",
    cycle.closedAt ?? null,
    cycle.cycleNumber !== undefined ? cycle.cycleNumber : 109,
    cycle.openedAt ?? "2026-09-19T17:40:47.000Z",
    cycle.openedAt ?? "2026-09-19T17:40:47.000Z",
  );
}

function insertOutboxRow(
  db: DatabaseSync,
  outbox: {
    id?: string;
    tenantId?: string;
    branchId?: string | null;
    tableName?: string;
    rowId: string;
    operation?: string;
    status?: string;
    payloadJson?: string | null;
    errorJson?: string | null;
  },
): void {
  db.prepare(`
    INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, status, payload_json, error_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    outbox.id ?? randomUUID(),
    outbox.tenantId ?? TENANT,
    outbox.branchId ?? "branch-1",
    outbox.tableName ?? "cierres_operativos",
    outbox.rowId,
    outbox.operation ?? "cycle-open",
    outbox.status ?? "pending",
    outbox.payloadJson ?? JSON.stringify({ type: "orders.cycle.open", id: outbox.rowId }),
    outbox.errorJson ?? null,
  );
}

function createMockSupabaseBuilder(data: any, error: any = null) {
  const queryBuilder: any = {
    eq: vi.fn(() => queryBuilder),
    gt: vi.fn(() => queryBuilder),
    is: vi.fn(() => queryBuilder),
    in: vi.fn(() => queryBuilder),
    order: vi.fn(() => queryBuilder),
    limit: vi.fn(() => queryBuilder),
    then: (resolve: (val: any) => void) => resolve({ data, error }),
  };
  const tableClient = {
    select: vi.fn(() => queryBuilder),
  };
  return { tableClient, queryBuilder };
}

describe("Ghost cycle reconciliation (local SQLite)", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    db.prepare(`
      INSERT OR IGNORE INTO sucursales (id, tenant_id, name)
      VALUES ('branch-1', ?, 'Branch 1'),
             ('branch-2', ?, 'Branch 2'),
             ('main-process-default', ?, 'Default Branch')
    `).run(TENANT, TENANT, TENANT);
  });

  afterEach(() => {
    db.close();
  });

  // 1. Ghost with no outbox row + cloud lacks id + later cloud cycle same sucursal → closed with closed_at = earliest later cloud cycle opened_at; sync_errors audit row exists; no sync_outbox row created.
  it("1. closes ghost with no outbox row when cloud lacks id and has later cycle for same sucursal", async () => {
    const ghostId = "167ff8f7-5435-4500-9b06-de0d385eeff7";
    insertLocalCycle(db, {
      id: ghostId,
      cycleNumber: 109,
      openedAt: "2026-09-19T17:40:47.000Z",
      sucursalId: "branch-1",
      state: "open",
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async (branchId, afterIso) => {
        expect(branchId).toBe("branch-1");
        expect(afterIso).toBe("2026-09-19T17:40:47.000Z");
        return { id: "cloud-110", cycle_number: 110, opened_at: "2026-09-19T19:45:49.000Z" };
      }),
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);

    expect(res.closed).toEqual([
      {
        id: ghostId,
        cycleNumber: 109,
        closedAt: "2026-09-19T19:45:49.000Z",
        supersededByCycleNumber: 110,
      },
    ]);

    // Verify DB state
    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(ghostId) as Record<string, unknown>;
    expect(cycle.state).toBe("closed");
    expect(cycle.closed_at).toBe("2026-09-19T19:45:49.000Z");

    // Audit row in sync_errors
    const auditRows = db.prepare("SELECT * FROM sync_errors WHERE tenant_id = ?").all(TENANT) as Record<string, unknown>[];
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].table_name).toBe("cierres_operativos");
    expect(auditRows[0].row_id).toBe(ghostId);
    expect(auditRows[0].error_message).toContain("Ghost cycle #109 auto-closed: not present in cloud, superseded by cloud cycle #110 opened 2026-09-19T19:45:49.000Z");

    // No sync_outbox row created
    const outboxCount = db.prepare("SELECT count(*) as cnt FROM sync_outbox").get() as { cnt: number };
    expect(outboxCount.cnt).toBe(0);
  });

  // 2. Cloud HAS the id → untouched.
  it("2. leaves cycle untouched when cloud HAS the id", async () => {
    const cycleId = "valid-cycle-109";
    insertLocalCycle(db, {
      id: cycleId,
      cycleNumber: 109,
      openedAt: "2026-09-19T17:40:47.000Z",
      sucursalId: "branch-1",
      state: "open",
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => [cycleId]),
      findEarliestLaterCycle: vi.fn(async () => ({
        id: "cloud-110",
        cycle_number: 110,
        opened_at: "2026-09-19T19:45:49.000Z",
      })),
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);
    expect(res.closed).toEqual([]);

    expect(fakePort.findEarliestLaterCycle).not.toHaveBeenCalled();

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(cycleId) as Record<string, unknown>;
    expect(cycle.state).toBe("open");
    expect(cycle.closed_at).toBeNull();

    const errors = db.prepare("SELECT count(*) as cnt FROM sync_errors").get() as { cnt: number };
    expect(errors.cnt).toBe(0);
  });

  // 3. No later cloud cycle (only earlier ones) → untouched.
  it("3. leaves cycle untouched when no later cloud cycle exists", async () => {
    const cycleId = "latest-cycle-109";
    insertLocalCycle(db, {
      id: cycleId,
      cycleNumber: 109,
      openedAt: "2026-09-19T17:40:47.000Z",
      sucursalId: "branch-1",
      state: "open",
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => null), // No later cycles
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);
    expect(res.closed).toEqual([]);

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(cycleId) as Record<string, unknown>;
    expect(cycle.state).toBe("open");
    expect(cycle.closed_at).toBeNull();

    const errors = db.prepare("SELECT count(*) as cnt FROM sync_errors").get() as { cnt: number };
    expect(errors.cnt).toBe(0);
  });

  // 4. Later cloud cycle exists but for a DIFFERENT sucursal → untouched.
  it("4. leaves cycle untouched when later cloud cycle exists for a different sucursal", async () => {
    const cycleId = "branch1-cycle-109";
    insertLocalCycle(db, {
      id: cycleId,
      cycleNumber: 109,
      openedAt: "2026-09-19T17:40:47.000Z",
      sucursalId: "branch-1",
      state: "open",
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async (branchId) => {
        // Only return later cycle if querying branch-2
        if (branchId === "branch-2") {
          return { id: "cloud-b2-1", cycle_number: 5, opened_at: "2026-09-19T20:00:00.000Z" };
        }
        return null;
      }),
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);
    expect(res.closed).toEqual([]);

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(cycleId) as Record<string, unknown>;
    expect(cycle.state).toBe("open");
    expect(cycle.closed_at).toBeNull();
  });

  // 5. Cloud port throws → nothing written anywhere (cycle still open, no sync_errors row, outbox unchanged).
  it("5. writes nothing anywhere when cloud port throws", async () => {
    const cycleId = "cycle-fail-port";
    insertLocalCycle(db, {
      id: cycleId,
      cycleNumber: 109,
      openedAt: "2026-09-19T17:40:47.000Z",
      sucursalId: "branch-1",
      state: "open",
    });

    const outboxId = "outbox-fail";
    const initialErrorJson = JSON.stringify({ code: "23505", reason: "Remote conflict" });
    insertOutboxRow(db, {
      id: outboxId,
      rowId: cycleId,
      errorJson: initialErrorJson,
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => {
        throw new Error("Supabase connection timeout 504");
      }),
      findEarliestLaterCycle: vi.fn(async () => null),
    };

    await expect(reconcileGhostCycles(db, TENANT, fakePort)).rejects.toThrow("Supabase connection timeout 504");

    // Exact DB state assertion
    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(cycleId) as Record<string, unknown>;
    expect(cycle.state).toBe("open");
    expect(cycle.closed_at).toBeNull();

    const errors = db.prepare("SELECT count(*) as cnt FROM sync_errors").get() as { cnt: number };
    expect(errors.cnt).toBe(0);

    const outbox = db.prepare("SELECT * FROM sync_outbox WHERE id = ?").get(outboxId) as Record<string, unknown>;
    expect(outbox.error_json).toBe(initialErrorJson);
  });

  // 6. Open cycle with a pending outbox row with error_json NULL (normal offline cycle) → untouched, port not even asked about it.
  it("6. leaves normal offline cycle with NULL error_json untouched without querying port", async () => {
    const cycleId = "normal-offline-cycle";
    insertLocalCycle(db, {
      id: cycleId,
      cycleNumber: 110,
      openedAt: "2026-09-20T08:00:00.000Z",
      state: "open",
    });

    insertOutboxRow(db, {
      rowId: cycleId,
      errorJson: null, // Normal pending offline write
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => null),
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);
    expect(res.closed).toEqual([]);

    expect(fakePort.findExistingCycleIds).not.toHaveBeenCalled();
    expect(fakePort.findEarliestLaterCycle).not.toHaveBeenCalled();

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(cycleId) as Record<string, unknown>;
    expect(cycle.state).toBe("open");
  });

  // 7. Open cycle with an outbox row carrying a TRANSIENT error → untouched.
  it("7. leaves open cycle with a transient outbox error untouched without querying port", async () => {
    const cycleId = "transient-error-cycle";
    insertLocalCycle(db, {
      id: cycleId,
      cycleNumber: 110,
      openedAt: "2026-09-20T08:00:00.000Z",
      state: "open",
    });

    insertOutboxRow(db, {
      rowId: cycleId,
      errorJson: JSON.stringify({ reason: "FetchError: Failed to fetch (connect ECONNREFUSED)" }),
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => null),
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);
    expect(res.closed).toEqual([]);

    expect(fakePort.findExistingCycleIds).not.toHaveBeenCalled();
    expect(fakePort.findEarliestLaterCycle).not.toHaveBeenCalled();

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(cycleId) as Record<string, unknown>;
    expect(cycle.state).toBe("open");
  });

  // 8. Open cycle whose outbox row is a conflict → closed, and its outbox row still exists with retryable:false and is no longer returned by the store's claim() (exercise the real claim()).
  it("8. auto-closes cycle with conflict outbox row, marks retryable:false, and excludes from real claim()", async () => {
    const cycleId = "conflicted-cycle";
    insertLocalCycle(db, {
      id: cycleId,
      cycleNumber: 109,
      openedAt: "2026-09-19T17:40:47.000Z",
      sucursalId: "branch-1",
      state: "open",
    });

    const outboxId = "outbox-conflict-1";
    insertOutboxRow(db, {
      id: outboxId,
      rowId: cycleId,
      errorJson: JSON.stringify({
        reason: "Remote upsert conflict for cierres_operativos: duplicate key value violates unique constraint",
        code: "23505",
      }),
    });

    const store = new SQLitePayrollSyncStore(db, TENANT);

    // Before reconcile: verify real claim() picks it up (since retryable is not false yet)
    const claimedBefore = store.claim(Date.now());
    expect(claimedBefore.some((op) => op.id === outboxId)).toBe(true);

    // Reset status back to pending for reconcile
    db.prepare("UPDATE sync_outbox SET status = 'pending' WHERE id = ?").run(outboxId);

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => ({
        id: "cloud-110",
        cycle_number: 110,
        opened_at: "2026-09-19T19:45:49.000Z",
      })),
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);
    expect(res.closed).toHaveLength(1);
    expect(res.closed[0].id).toBe(cycleId);

    // Cycle is closed
    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(cycleId) as Record<string, unknown>;
    expect(cycle.state).toBe("closed");
    expect(cycle.closed_at).toBe("2026-09-19T19:45:49.000Z");

    // Outbox row still exists
    const outbox = db.prepare("SELECT * FROM sync_outbox WHERE id = ?").get(outboxId) as Record<string, unknown>;
    expect(outbox).toBeTruthy();
    const parsedError = JSON.parse(outbox.error_json as string);
    expect(parsedError.retryable).toBe(false);
    expect(parsedError.reason).toBe("ghost_cycle_auto_closed");
    expect(parsedError.ghostCycle).toBe(true);
    expect(parsedError.code).toBe("23505");

    // Exercise real store.claim(): must NOT return the outbox row anymore!
    const claimedAfter = store.claim(Date.now());
    expect(claimedAfter.some((op) => op.id === outboxId)).toBe(false);
  });

  // 9. Already closed cycles are never passed to the port nor modified.
  it("9. ignores already closed cycles and never queries port", async () => {
    const cycleId = "already-closed-cycle";
    insertLocalCycle(db, {
      id: cycleId,
      cycleNumber: 108,
      openedAt: "2026-09-18T10:00:00.000Z",
      closedAt: "2026-09-18T22:00:00.000Z",
      state: "closed",
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => null),
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);
    expect(res.closed).toEqual([]);

    expect(fakePort.findExistingCycleIds).not.toHaveBeenCalled();
    expect(fakePort.findEarliestLaterCycle).not.toHaveBeenCalled();

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(cycleId) as Record<string, unknown>;
    expect(cycle.state).toBe("closed");
    expect(cycle.closed_at).toBe("2026-09-18T22:00:00.000Z");
  });

  // 10. Two ghosts in the same run: both closed in one run; the earliest-later-cycle rule applied per ghost.
  it("10. closes two ghosts in the same run applying the earliest-later rule per ghost", async () => {
    const ghost1 = "ghost-1";
    const ghost2 = "ghost-2";

    insertLocalCycle(db, {
      id: ghost1,
      cycleNumber: 105,
      openedAt: "2026-09-18T10:00:00.000Z",
      sucursalId: "branch-1",
      state: "open",
    });

    insertLocalCycle(db, {
      id: ghost2,
      cycleNumber: 108,
      openedAt: "2026-09-19T10:00:00.000Z",
      sucursalId: "branch-1",
      state: "open",
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async (_branchId, afterIso) => {
        if (afterIso === "2026-09-18T10:00:00.000Z") {
          return { id: "cloud-106", cycle_number: 106, opened_at: "2026-09-18T14:00:00.000Z" };
        }
        if (afterIso === "2026-09-19T10:00:00.000Z") {
          return { id: "cloud-110", cycle_number: 110, opened_at: "2026-09-19T16:00:00.000Z" };
        }
        return null;
      }),
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);

    expect(res.closed).toHaveLength(2);
    expect(res.closed[0]).toEqual({
      id: ghost1,
      cycleNumber: 105,
      closedAt: "2026-09-18T14:00:00.000Z",
      supersededByCycleNumber: 106,
    });
    expect(res.closed[1]).toEqual({
      id: ghost2,
      cycleNumber: 108,
      closedAt: "2026-09-19T16:00:00.000Z",
      supersededByCycleNumber: 110,
    });

    const cycle1 = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(ghost1) as Record<string, unknown>;
    expect(cycle1.state).toBe("closed");
    expect(cycle1.closed_at).toBe("2026-09-18T14:00:00.000Z");

    const cycle2 = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(ghost2) as Record<string, unknown>;
    expect(cycle2.state).toBe("closed");
    expect(cycle2.closed_at).toBe("2026-09-19T16:00:00.000Z");

    const errors = db.prepare("SELECT * FROM sync_errors ORDER BY created_at ASC").all() as Record<string, unknown>[];
    expect(errors).toHaveLength(2);
  });

  // 11. 'main-process-default' local sucursal sentinel matches a cloud cycle with sucursal_id null.
  it("11. maps 'main-process-default' sucursal sentinel to null and matches cloud cycle with sucursal_id null", async () => {
    const ghostId = "ghost-main-process-default";
    insertLocalCycle(db, {
      id: ghostId,
      cycleNumber: 109,
      openedAt: "2026-09-19T17:40:47.000Z",
      sucursalId: "main-process-default",
      state: "open",
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async (branchId, afterIso) => {
        // Assert sentinel was mapped to null
        expect(branchId).toBeNull();
        expect(afterIso).toBe("2026-09-19T17:40:47.000Z");
        return { id: "cloud-null-branch", cycle_number: 110, opened_at: "2026-09-19T19:45:49.000Z" };
      }),
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);
    expect(res.closed).toEqual([
      {
        id: ghostId,
        cycleNumber: 109,
        closedAt: "2026-09-19T19:45:49.000Z",
        supersededByCycleNumber: 110,
      },
    ]);

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(ghostId) as Record<string, unknown>;
    expect(cycle.state).toBe("closed");
    expect(cycle.closed_at).toBe("2026-09-19T19:45:49.000Z");
  });

  // Correction 1: Numeric timestamp comparison tests
  it("closes ghost when cloud later cycle has timezone offset that is lexicographically smaller but numerically later", async () => {
    const ghostId = "ghost-tz-numeric-later";
    // Local is 17:40:47.672Z
    insertLocalCycle(db, {
      id: ghostId,
      cycleNumber: 109,
      openedAt: "2026-09-19T17:40:47.672Z",
      sucursalId: "branch-1",
      state: "open",
    });

    // Cloud is 13:45:49.555-06:00 = 19:45:49.555 UTC.
    // Lexicographically "2026-09-19T13..." < "2026-09-19T17...", but numerically later in epoch.
    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => ({
        id: "cloud-tz-110",
        cycle_number: 110,
        opened_at: "2026-09-19T13:45:49.555-06:00",
      })),
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);
    expect(res.closed).toHaveLength(1);
    expect(res.closed[0].closedAt).toBe("2026-09-19T13:45:49.555-06:00");

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(ghostId) as Record<string, unknown>;
    expect(cycle.state).toBe("closed");
    expect(cycle.closed_at).toBe("2026-09-19T13:45:49.555-06:00");
  });

  it("leaves ghost untouched when cloud cycle with offset is lexicographically greater but numerically earlier in absolute time", async () => {
    const ghostId = "ghost-tz-numeric-earlier";
    // Local is 17:40:47.672Z
    insertLocalCycle(db, {
      id: ghostId,
      cycleNumber: 109,
      openedAt: "2026-09-19T17:40:47.672Z",
      sucursalId: "branch-1",
      state: "open",
    });

    // Cloud is 20:00:00.000+06:00 = 14:00:00.000 UTC.
    // Lexicographically "2026-09-19T20..." > "2026-09-19T17...", but numerically EARLIER (14:00 < 17:40).
    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => ({
        id: "cloud-tz-earlier",
        cycle_number: 108,
        opened_at: "2026-09-19T20:00:00.000+06:00",
      })),
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);
    expect(res.closed).toEqual([]);

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(ghostId) as Record<string, unknown>;
    expect(cycle.state).toBe("open");
    expect(cycle.closed_at).toBeNull();
  });

  it("skips candidates whose opened_at does not parse to a finite number", async () => {
    const invalidId = "invalid-date-cycle";
    insertLocalCycle(db, {
      id: invalidId,
      cycleNumber: 109,
      openedAt: "not-a-valid-iso-date",
      sucursalId: "branch-1",
      state: "open",
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => ({
        id: "cloud-110",
        cycle_number: 110,
        opened_at: "2026-09-19T19:45:49.000Z",
      })),
    };

    const res = await reconcileGhostCycles(db, TENANT, fakePort);
    expect(res.closed).toEqual([]);

    expect(fakePort.findExistingCycleIds).not.toHaveBeenCalled();
    expect(fakePort.findEarliestLaterCycle).not.toHaveBeenCalled();

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(invalidId) as Record<string, unknown>;
    expect(cycle.state).toBe("open");
    expect(cycle.closed_at).toBeNull();
  });

  // Correction 3: Store implements reconcileGhostCycles
  it("executes ghost cycle reconcile via store.reconcileGhostCycles", async () => {
    const ghostId = "ghost-store-call";
    insertLocalCycle(db, {
      id: ghostId,
      cycleNumber: 109,
      openedAt: "2026-09-19T17:40:47.000Z",
      sucursalId: "branch-1",
      state: "open",
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => ({
        id: "cloud-110",
        cycle_number: 110,
        opened_at: "2026-09-19T19:45:49.000Z",
      })),
    };

    const store = new SQLitePayrollSyncStore(db, TENANT);
    const res = await store.reconcileGhostCycles(fakePort);

    expect(res.closed).toHaveLength(1);
    expect(res.closed[0].id).toBe(ghostId);

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(ghostId) as Record<string, unknown>;
    expect(cycle.state).toBe("closed");
  });

  // Correction 8: Conflict classifier real settle path and strict criteria
  describe("isConflictOutboxError & real settle path", () => {
    it("recognizes exact stored error_json from the REAL settle path with classifyRemoteError(23505)", () => {
      const store = new SQLitePayrollSyncStore(db, TENANT);
      const outboxId = "outbox-real-settle-test";
      const rowId = "cycle-real-settle";

      insertOutboxRow(db, {
        id: outboxId,
        rowId,
        status: "syncing",
      });

      // Obtain what classifyRemoteError produces for a Postgres unique constraint 23505 violation
      const pushResponse = classifyRemoteError(
        {
          code: "23505",
          message: 'duplicate key value violates unique constraint "cierres_operativos_tenant_cycle_idx"',
        },
        "cierres_operativos",
        "upsert",
      );

      expect(pushResponse.conflict).toBeDefined();

      // Settle through the REAL store method
      store.settle(outboxId, "conflicted", pushResponse.conflict!);

      const row = db.prepare("SELECT status, error_json FROM sync_outbox WHERE id = ?").get(outboxId) as {
        status: string;
        error_json: string;
      };

      expect(row.status).toBe("pending");
      const expectedShape = {
        reason: 'Remote upsert conflict for cierres_operativos: duplicate key value violates unique constraint "cierres_operativos_tenant_cycle_idx"',
      };
      expect(JSON.parse(row.error_json)).toEqual(expectedShape);

      // Verify classifier recognizes the real stored JSON
      expect(isConflictOutboxError(row.error_json)).toBe(true);
    });

    it("matches allowed conflict criteria (conflict key, code 23505, specific duplicate/cycle messages, remote conflict prefix)", () => {
      expect(isConflictOutboxError(JSON.stringify({ conflict: true }))).toBe(true);
      expect(isConflictOutboxError(JSON.stringify({ conflict: { reason: "concurrent" } }))).toBe(true);
      expect(isConflictOutboxError(JSON.stringify({ code: "23505" }))).toBe(true);
      expect(isConflictOutboxError(JSON.stringify({ code: 23505 }))).toBe(true);
      expect(isConflictOutboxError(JSON.stringify({ reason: "Ya existe un ciclo operativo abierto para esta sucursal." }))).toBe(true);
      expect(isConflictOutboxError(JSON.stringify({ message: "duplicate key value violates unique constraint" }))).toBe(true);
      expect(isConflictOutboxError(JSON.stringify({ reason: "Remote upsert conflict for cierres_operativos: custom message" }))).toBe(true);
      expect(isConflictOutboxError(JSON.stringify({ reason: "Remote update conflict for cierres_operativos: error" }))).toBe(true);
    });

    it("rejects generic messages and local guards as negative cases", () => {
      expect(isConflictOutboxError(null)).toBe(false);
      expect(isConflictOutboxError("")).toBe(false);
      expect(isConflictOutboxError("not json")).toBe(false);
      expect(isConflictOutboxError(JSON.stringify({ reason: "Open cycle already exists" }))).toBe(false);
      expect(isConflictOutboxError(JSON.stringify({ reason: "network conflict timeout" }))).toBe(false);
      expect(isConflictOutboxError(JSON.stringify({ message: "conflict occurred" }))).toBe(false);
      expect(isConflictOutboxError(JSON.stringify({ reason: "conflicto en la conexión" }))).toBe(false);
      expect(isConflictOutboxError(JSON.stringify({ message: "already exists" }))).toBe(false);
      expect(isConflictOutboxError(JSON.stringify({ reason: "Record already exists in cache" }))).toBe(false);
      expect(isConflictOutboxError(JSON.stringify({ reason: "FetchError: timeout" }))).toBe(false);
    });
  });
});

describe("DurableSyncWorker ghost cycle integration and throttle", () => {
  let db: DatabaseSync;
  let store: SQLitePayrollSyncStore;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    db.prepare(`
      INSERT OR IGNORE INTO sucursales (id, tenant_id, name)
      VALUES ('branch-1', ?, 'Branch 1'),
             ('branch-2', ?, 'Branch 2'),
             ('main-process-default', ?, 'Default Branch')
    `).run(TENANT, TENANT, TENANT);
    store = new SQLitePayrollSyncStore(db, TENANT);
  });

  afterEach(() => {
    db.close();
  });

  it("invokes ghost cycle reconcile after successful pull and updates result", async () => {
    const ghostId = "worker-ghost-1";
    insertLocalCycle(db, {
      id: ghostId,
      cycleNumber: 109,
      openedAt: "2026-09-19T17:40:47.000Z",
      sucursalId: "branch-1",
      state: "open",
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => ({
        id: "cloud-110",
        cycle_number: 110,
        opened_at: "2026-09-19T19:45:49.000Z",
      })),
    };

    const server: ServerSyncClient = {
      push: async () => ({ result: {} }),
      pull: async () => ({
        cursor: "c1",
        changes: [{ tableName: "facturas", rowId: "f1", deleted: false, payload: { id: "f1" } }],
      }),
      getGhostCycleCloudPort: () => fakePort,
    };

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const worker = new DurableSyncWorker(store, server, TENANT);
    const pullResult = await worker.pull();

    expect(pullResult.applied).toBe(2); // 1 factura change + 1 closed ghost
    expect(pullResult.tables).toContain("facturas");
    expect(pullResult.tables).toContain("cierres_operativos");

    expect(fakePort.findExistingCycleIds).toHaveBeenCalledTimes(1);

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(ghostId) as Record<string, unknown>;
    expect(cycle.state).toBe("closed");
    expect(cycle.closed_at).toBe("2026-09-19T19:45:49.000Z");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[sync↓] cierres_operativos worker-ghost-1 → ciclo fantasma #109 auto-cerrado (superado por #110)"),
    );
    warnSpy.mockRestore();
  });

  it("does NOT invoke ghost cycle reconcile when pull fails", async () => {
    const ghostId = "worker-ghost-fail";
    insertLocalCycle(db, {
      id: ghostId,
      cycleNumber: 109,
      openedAt: "2026-09-19T17:40:47.000Z",
      sucursalId: "branch-1",
      state: "open",
    });

    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => null),
    };

    const server: ServerSyncClient = {
      push: async () => ({ result: {} }),
      pull: async () => {
        throw new Error("Cloud network unreachable");
      },
      getGhostCycleCloudPort: () => fakePort,
    };

    const worker = new DurableSyncWorker(store, server, TENANT);
    await expect(worker.pull()).rejects.toThrow("Cloud network unreachable");

    expect(fakePort.findExistingCycleIds).not.toHaveBeenCalled();
    expect(fakePort.findEarliestLaterCycle).not.toHaveBeenCalled();

    const cycle = db.prepare("SELECT * FROM cierres_operativos WHERE id = ?").get(ghostId) as Record<string, unknown>;
    expect(cycle.state).toBe("open");
  });

  it("throttles ghost cycle reconcile to at most once per 10 minutes", async () => {
    let now = 1_000_000;
    const fakePort: GhostCycleCloudPort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => null),
    };

    const server: ServerSyncClient = {
      push: async () => ({ result: {} }),
      pull: async () => ({ cursor: "c1", changes: [] }),
      getGhostCycleCloudPort: () => fakePort,
    };

    const worker = new DurableSyncWorker(store, server, TENANT, {
      clock: () => now,
      ghostReconcileThrottleMs: 10 * 60 * 1000,
    });

    // 1st pull: runs immediately (worker start)
    insertLocalCycle(db, { id: "c1", cycleNumber: 1, openedAt: "2026-09-19T10:00:00Z", state: "open" });
    await worker.pull();
    expect(fakePort.findExistingCycleIds).toHaveBeenCalledTimes(1);

    // 2nd pull at 5 minutes later: throttled (skipped)
    now += 5 * 60 * 1000;
    await worker.pull();
    expect(fakePort.findExistingCycleIds).toHaveBeenCalledTimes(1); // Still 1

    // 3rd pull at 9 minutes and 59 seconds: still throttled
    now += 4 * 60 * 1000 + 59_000;
    await worker.pull();
    expect(fakePort.findExistingCycleIds).toHaveBeenCalledTimes(1);

    // 4th pull at 10 minutes: throttle elapsed, runs!
    now += 1_000;
    await worker.pull();
    expect(fakePort.findExistingCycleIds).toHaveBeenCalledTimes(2);
  });
});

describe("createSupabaseGhostCycleCloudPort", () => {
  it("queries existing cycle ids using Supabase query builder", async () => {
    const { tableClient, queryBuilder } = createMockSupabaseBuilder([{ id: "c-1" }]);
    const fromMock = vi.fn(() => tableClient);

    const port = createSupabaseGhostCycleCloudPort(fromMock, "tenant-abc");
    const ids = await port.findExistingCycleIds(["c-1", "c-2"]);

    expect(fromMock).toHaveBeenCalledWith("cierres_operativos");
    expect(tableClient.select).toHaveBeenCalledWith("id");
    expect(queryBuilder.eq).toHaveBeenCalledWith("tenant_id", "tenant-abc");
    expect(queryBuilder.in).toHaveBeenCalledWith("id", ["c-1", "c-2"]);
    expect(ids).toEqual(["c-1"]);
  });

  it("queries earliest later cycle with non-null branch using eq, order, and limit 1", async () => {
    const { tableClient, queryBuilder } = createMockSupabaseBuilder([
      { id: "c-2", cycle_number: 110, opened_at: "2026-09-19T20:00:00Z" },
    ]);
    const fromMock = vi.fn(() => tableClient);

    const port = createSupabaseGhostCycleCloudPort(fromMock, "tenant-abc");
    const cycle = await port.findEarliestLaterCycle("branch-1", "2026-09-19T18:00:00Z");

    expect(tableClient.select).toHaveBeenCalledWith("id, cycle_number, opened_at");
    expect(queryBuilder.eq).toHaveBeenCalledWith("tenant_id", "tenant-abc");
    expect(queryBuilder.gt).toHaveBeenCalledWith("opened_at", "2026-09-19T18:00:00Z");
    expect(queryBuilder.eq).toHaveBeenCalledWith("sucursal_id", "branch-1");
    expect(queryBuilder.order).toHaveBeenCalledWith("opened_at", { ascending: true });
    expect(queryBuilder.limit).toHaveBeenCalledWith(1);
    expect(cycle).toEqual({
      id: "c-2",
      cycle_number: 110,
      opened_at: "2026-09-19T20:00:00Z",
    });
  });

  it("queries earliest later cycle with null branch using is, order, and limit 1", async () => {
    const { tableClient, queryBuilder } = createMockSupabaseBuilder([
      { id: "c-3", cycle_number: 111, opened_at: "2026-09-19T21:00:00Z" },
    ]);
    const fromMock = vi.fn(() => tableClient);

    const port = createSupabaseGhostCycleCloudPort(fromMock, "tenant-abc");
    const cycle = await port.findEarliestLaterCycle(null, "2026-09-19T18:00:00Z");

    expect(queryBuilder.is).toHaveBeenCalledWith("sucursal_id", null);
    expect(queryBuilder.order).toHaveBeenCalledWith("opened_at", { ascending: true });
    expect(queryBuilder.limit).toHaveBeenCalledWith(1);
    expect(cycle).toEqual({
      id: "c-3",
      cycle_number: 111,
      opened_at: "2026-09-19T21:00:00Z",
    });
  });

  it("returns null when no later cycle is found in cloud", async () => {
    const { tableClient } = createMockSupabaseBuilder([]);
    const fromMock = vi.fn(() => tableClient);

    const port = createSupabaseGhostCycleCloudPort(fromMock, "tenant-abc");
    const cycle = await port.findEarliestLaterCycle("branch-1", "2026-09-19T18:00:00Z");

    expect(cycle).toBeNull();
  });

  it("throws when Supabase query returns an error", async () => {
    const { tableClient } = createMockSupabaseBuilder(null, { message: "Permission denied (RLS)" });
    const fromMock = vi.fn(() => tableClient);

    const port = createSupabaseGhostCycleCloudPort(fromMock, "tenant-abc");
    await expect(port.findExistingCycleIds(["c-1"])).rejects.toThrow("Permission denied (RLS)");
  });
});
