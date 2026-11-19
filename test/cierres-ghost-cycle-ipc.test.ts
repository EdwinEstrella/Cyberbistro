import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import {
  DurableSyncWorker,
  type ServerSyncClient,
} from "../electron/persistence/syncWorker";
import type { GhostCycleClosedItem } from "../electron/persistence/ghostCycleReconcile";
import {
  CIERRES_RECONCILE_GHOST_CYCLES_CHANNEL,
  CIERRES_CYCLE_SYNC_STATUS_CHANNEL,
  registerOrdersRepositoryIpc,
  type OrdersRepositoryIpcMain,
} from "../electron/persistence/ipc";
import { TenantStore } from "../electron/persistence/tenantStore";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TENANT = "tenant-ghost-t3";

function createIpcHarness() {
  const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
  const ipcMain: OrdersRepositoryIpcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    removeHandler(channel) {
      handlers.delete(channel);
    },
  };
  return { handlers, ipcMain };
}

describe("T3: Worker forced reconcile, throttle, and event emission", () => {
  let db: DatabaseSync;
  let store: SQLitePayrollSyncStore;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    db.prepare(`
      INSERT OR IGNORE INTO sucursales (id, tenant_id, name)
      VALUES ('branch-1', ?, 'Branch 1')
    `).run(TENANT);
    store = new SQLitePayrollSyncStore(db, TENANT);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
  });

  it("worker forced reconcile bypasses the 10-minute throttle and still stamps the last reconcile time", async () => {
    let now = 1000000;
    const fakePort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => ({
        id: "cloud-2",
        cycle_number: 2,
        opened_at: "2026-09-19T20:00:00.000Z",
      })),
      findOpenCycle: vi.fn(async () => null),
    };
    const server: ServerSyncClient = {
      pull: vi.fn(async () => ({ changes: [], snapshotTables: [] })),
      push: vi.fn(async () => ({ synced: true, remoteTable: "test" })),
      getGhostCycleCloudPort: vi.fn(async () => fakePort),
    };

    const closedNotifications: GhostCycleClosedItem[][] = [];
    const worker = new DurableSyncWorker(store, server, TENANT, {
      clock: () => now,
      ghostReconcileThrottleMs: 10 * 60 * 1000,
      onGhostCyclesClosed: (closed) => closedNotifications.push(closed),
    });

    // 1. First pull at now: executes reconcile
    db.prepare(`
      INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, cycle_number, opened_at, created_at)
      VALUES ('c-1', ?, 'branch-1', '2026-09-19', 1000, 'open', 1, '2026-09-19T10:00:00.000Z', '2026-09-19T10:00:00.000Z')
    `).run(TENANT);

    await worker.pull();
    expect(fakePort.findExistingCycleIds).toHaveBeenCalledTimes(1);
    expect(closedNotifications.length).toBe(1);
    expect(closedNotifications[0][0].cycleNumber).toBe(1);

    // 2. Normal pull at 2 minutes later: throttled (skipped)
    now += 2 * 60 * 1000;
    await worker.pull();
    expect(fakePort.findExistingCycleIds).toHaveBeenCalledTimes(1); // still 1

    // 3. Forced reconcile at 3 minutes later: bypasses throttle!
    now += 1 * 60 * 1000;
    db.prepare(`
      INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, cycle_number, opened_at, created_at)
      VALUES ('c-2', ?, 'branch-1', '2026-09-19', 1000, 'open', 2, '2026-09-19T11:00:00.000Z', '2026-09-19T11:00:00.000Z')
    `).run(TENANT);

    const result = await worker.reconcileGhostCyclesNow();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.closed.length).toBe(1);
      expect(result.closed[0].cycleNumber).toBe(2);
    }
    expect(fakePort.findExistingCycleIds).toHaveBeenCalledTimes(2);

    // 4. Verify throttle stamp was updated: normal pull at 5 minutes after forced reconcile is throttled
    now += 5 * 60 * 1000;
    db.prepare(`
      INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, cycle_number, opened_at, created_at)
      VALUES ('c-3', ?, 'branch-1', '2026-09-19', 1000, 'open', 3, '2026-09-19T12:00:00.000Z', '2026-09-19T12:00:00.000Z')
    `).run(TENANT);

    await worker.pull();
    expect(fakePort.findExistingCycleIds).toHaveBeenCalledTimes(2); // still 2

    // 5. At 10 minutes after forced reconcile: throttle has elapsed, runs!
    now += 5 * 60 * 1000 + 1000;
    await worker.pull();
    expect(fakePort.findExistingCycleIds).toHaveBeenCalledTimes(3);
  });

  it("event emission: emitted with payload when cycles are closed; NOT emitted when nothing closed", async () => {
    let now = 1000;
    const fakePort = {
      findExistingCycleIds: vi.fn(async () => []),
      findEarliestLaterCycle: vi.fn(async () => null), // returns null -> no cloud later cycle -> no close
      findOpenCycle: vi.fn(async () => null),
    };
    const server: ServerSyncClient = {
      pull: vi.fn(async () => ({ changes: [], snapshotTables: [] })),
      push: vi.fn(async () => ({ synced: true, remoteTable: "test" })),
      getGhostCycleCloudPort: vi.fn(async () => fakePort),
    };

    const emitted: GhostCycleClosedItem[][] = [];
    const worker = new DurableSyncWorker(store, server, TENANT, {
      clock: () => now,
      onGhostCyclesClosed: (closed) => emitted.push(closed),
    });

    db.prepare(`
      INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, cycle_number, opened_at, created_at)
      VALUES ('c-pending', ?, 'branch-1', '2026-09-19', 1000, 'open', 5, '2026-09-19T10:00:00.000Z', '2026-09-19T10:00:00.000Z')
    `).run(TENANT);

    // Pull when nothing closed
    await worker.pull();
    expect(emitted.length).toBe(0);

    // Forced reconcile when nothing closed
    const res = await worker.reconcileGhostCyclesNow();
    expect(res).toEqual({ ok: true, closed: [] });
    expect(emitted.length).toBe(0);

    // Now configure cloud to return a later cycle
    fakePort.findEarliestLaterCycle.mockResolvedValueOnce({
      id: "cloud-later",
      cycle_number: 6,
      opened_at: "2026-09-19T12:00:00.000Z",
    });

    const res2 = await worker.reconcileGhostCyclesNow();
    expect(res2.ok).toBe(true);
    expect(emitted.length).toBe(1);
    expect(emitted[0]).toEqual([
      {
        id: "c-pending",
        cycleNumber: 5,
        closedAt: "2026-09-19T12:00:00.000Z",
        supersededByCycleNumber: 6,
        supersededBy: "later_cycle",
      },
    ]);
  });

  it("returns { ok: false, reason: 'error' } when cloud port query throws network error", async () => {
    const server: ServerSyncClient = {
      pull: vi.fn(async () => ({ changes: [], snapshotTables: [] })),
      push: vi.fn(async () => ({ synced: true, remoteTable: "test" })),
      getGhostCycleCloudPort: vi.fn(async () => {
        throw new Error("Failed to fetch: network unreachable");
      }),
    };

    const worker = new DurableSyncWorker(store, server, TENANT);
    const result = await worker.reconcileGhostCyclesNow();
    expect(result).toEqual({ ok: false, reason: "error" });
  });

  it("returns { ok: false, reason: 'unavailable' } when server port is missing", async () => {
    const server: ServerSyncClient = {
      pull: vi.fn(async () => ({ changes: [], snapshotTables: [] })),
      push: vi.fn(async () => ({ synced: true, remoteTable: "test" })),
      getGhostCycleCloudPort: vi.fn(async () => null),
    };

    const worker = new DurableSyncWorker(store, server, TENANT);
    const result = await worker.reconcileGhostCyclesNow();
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("T3: TenantStore.getCycleSyncStatus", () => {
  let dataRoot: string;
  let tenantStore: TenantStore;

  beforeEach(() => {
    dataRoot = mkdtempSync(join(tmpdir(), "cloudix-t3-store-"));
    tenantStore = TenantStore.open({ dataRoot, tenantId: TENANT });
  });

  afterEach(() => {
    try {
      tenantStore.close();
      rmSync(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch {}
  });

  it("returns false for no outbox rows for the cycle", () => {
    const status = tenantStore.getCycleSyncStatus("cycle-nonexistent");
    expect(status).toEqual({ openPushConflict: false });
  });

  it("returns false for clean pending outbox row (error_json is null)", () => {
    const db = tenantStore.getDatabase();
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, status, payload_json, error_json)
      VALUES (?, ?, 'branch-1', 'cierres_operativos', 'cycle-clean', 'cycle-open', 'pending', '{}', NULL)
    `).run(randomUUID(), TENANT);

    const status = tenantStore.getCycleSyncStatus("cycle-clean");
    expect(status).toEqual({ openPushConflict: false });
  });

  it("returns false for transient error row that is not a conflict", () => {
    const db = tenantStore.getDatabase();
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, status, payload_json, error_json)
      VALUES (?, ?, 'branch-1', 'cierres_operativos', 'cycle-transient', 'cycle-open', 'pending', '{}', ?)
    `).run(randomUUID(), TENANT, JSON.stringify({ message: "ETIMEDOUT connection timeout", retryable: true }));

    const status = tenantStore.getCycleSyncStatus("cycle-transient");
    expect(status).toEqual({ openPushConflict: false });
  });

  it("returns true for a conflict row (23505 unique index / remote conflict)", () => {
    const db = tenantStore.getDatabase();
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, status, payload_json, error_json)
      VALUES (?, ?, 'branch-1', 'cierres_operativos', 'cycle-conflict', 'cycle-open', 'pending', '{}', ?)
    `).run(randomUUID(), TENANT, JSON.stringify({
      code: "23505",
      conflict: true,
      reason: "duplicate key value violates unique constraint 'cierres_operativos_unique_cycle'",
    }));

    const status = tenantStore.getCycleSyncStatus("cycle-conflict");
    expect(status).toEqual({ openPushConflict: true });
  });

  it("returns true for a ghostCycle row ({ ghostCycle: true })", () => {
    const db = tenantStore.getDatabase();
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, status, payload_json, error_json)
      VALUES (?, ?, 'branch-1', 'cierres_operativos', 'cycle-ghost', 'cycle-open', 'pending', '{}', ?)
    `).run(randomUUID(), TENANT, JSON.stringify({
      retryable: false,
      reason: "ghost_cycle_auto_closed",
      ghostCycle: true,
    }));

    const status = tenantStore.getCycleSyncStatus("cycle-ghost");
    expect(status).toEqual({ openPushConflict: true });
  });

  it("returns true when error_json contains 'ya existe un ciclo operativo abierto'", () => {
    const db = tenantStore.getDatabase();
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, status, payload_json, error_json)
      VALUES (?, ?, 'branch-1', 'cierres_operativos', 'cycle-p0001', 'cycle-open', 'pending', '{}', ?)
    `).run(randomUUID(), TENANT, JSON.stringify({
      message: "Remote upsert conflict for cierres_operativos: Ya existe un ciclo operativo abierto",
    }));

    const status = tenantStore.getCycleSyncStatus("cycle-p0001");
    expect(status).toEqual({ openPushConflict: true });
  });
});

describe("T3: IPC handlers for cierres ghost cycle reconcile and sync status", () => {
  it("rejects untrusted sender for cierres.reconcileGhostCycles", async () => {
    const { handlers, ipcMain } = createIpcHarness();
    registerOrdersRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getRepository: () => ({} as any),
      reconcileGhostCycles: vi.fn(async () => ({ ok: true as const, closed: [] })),
    });

    const handler = handlers.get(CIERRES_RECONCILE_GHOST_CYCLES_CHANNEL);
    await expect(handler?.({ senderId: 99 })).rejects.toThrow("Untrusted IPC sender");
  });

  it("returns { ok: false, reason: 'unavailable' } when reconcileGhostCycles handler is missing", async () => {
    const { handlers, ipcMain } = createIpcHarness();
    registerOrdersRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getRepository: () => ({} as any),
      // no reconcileGhostCycles provided
    });

    const handler = handlers.get(CIERRES_RECONCILE_GHOST_CYCLES_CHANNEL);
    const res = await handler?.({ senderId: 7 });
    expect(res).toEqual({ ok: false, reason: "unavailable" });
  });

  it("returns { ok: false, reason: 'error' } instead of throwing when reconcile throws", async () => {
    const { handlers, ipcMain } = createIpcHarness();
    registerOrdersRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getRepository: () => ({} as any),
      reconcileGhostCycles: vi.fn(async () => {
        throw new Error("Unexpected crash during reconcile");
      }),
    });

    const handler = handlers.get(CIERRES_RECONCILE_GHOST_CYCLES_CHANNEL);
    const res = await handler?.({ senderId: 7 });
    expect(res).toEqual({ ok: false, reason: "error" });
  });

  it("returns { ok: true, closed } when reconcile succeeds", async () => {
    const { handlers, ipcMain } = createIpcHarness();
    const closedList = [
      {
        id: "c-ghost",
        cycleNumber: 10,
        closedAt: "2026-09-19T20:00:00Z",
        supersededByCycleNumber: 11,
        supersededBy: "later_cycle" as const,
      },
    ];
    registerOrdersRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getRepository: () => ({} as any),
      reconcileGhostCycles: vi.fn(async () => ({ ok: true as const, closed: closedList })),
    });

    const handler = handlers.get(CIERRES_RECONCILE_GHOST_CYCLES_CHANNEL);
    const res = await handler?.({ senderId: 7 });
    expect(res).toEqual({ ok: true, closed: closedList });
  });

  it("rejects untrusted sender for cierres.cycleSyncStatus", async () => {
    const { handlers, ipcMain } = createIpcHarness();
    registerOrdersRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getRepository: () => ({} as any),
      getCycleSyncStatus: vi.fn(() => ({ openPushConflict: true })),
    });

    const handler = handlers.get(CIERRES_CYCLE_SYNC_STATUS_CHANNEL);
    await expect(handler?.({ senderId: 99 }, "c-1")).rejects.toThrow("Untrusted IPC sender");
  });

  it("returns { openPushConflict: false } for invalid cycleId payloads", async () => {
    const { handlers, ipcMain } = createIpcHarness();
    const getStatus = vi.fn(() => ({ openPushConflict: true }));
    registerOrdersRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getRepository: () => ({} as any),
      getCycleSyncStatus: getStatus,
    });

    const handler = handlers.get(CIERRES_CYCLE_SYNC_STATUS_CHANNEL);
    expect(await handler?.({ senderId: 7 }, null)).toEqual({ openPushConflict: false });
    expect(await handler?.({ senderId: 7 }, "")).toEqual({ openPushConflict: false });
    expect(await handler?.({ senderId: 7 }, 123)).toEqual({ openPushConflict: false });
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("returns cycleSyncStatus result from provider for valid cycleId", async () => {
    const { handlers, ipcMain } = createIpcHarness();
    registerOrdersRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getRepository: () => ({} as any),
      getCycleSyncStatus: (cycleId) => ({ openPushConflict: cycleId === "conflicted-cycle" }),
    });

    const handler = handlers.get(CIERRES_CYCLE_SYNC_STATUS_CHANNEL);
    expect(await handler?.({ senderId: 7 }, "conflicted-cycle")).toEqual({ openPushConflict: true });
    expect(await handler?.({ senderId: 7 }, "clean-cycle")).toEqual({ openPushConflict: false });
  });
});
