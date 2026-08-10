import { describe, expect, it } from "vitest";
import {
  DurableSyncWorker,
  createDurableOperation,
  type DurableSyncStore,
  type ServerSyncClient,
} from "../electron/persistence/syncWorker";

const tenantId = "tenant-a";

function createStore(): DurableSyncStore & { rows: Map<string, Record<string, unknown>>; cursor: string | null } {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    cursor: null,
    operations: [],
    commitMutation(operation) { this.operations.push(operation); this.rows.set(`${operation.tableName}:${operation.rowId}`, operation.payload ?? {}); },
    claim(now) { return this.operations.filter((operation) => operation.status === "pending" || (operation.status === "syncing" && operation.leaseUntil <= now)).map((operation) => ({ ...operation, status: "syncing", leaseUntil: now + 60_000 })); },
    settle(id, status, result) { const operation = this.operations.find((item) => item.id === id); if (operation) Object.assign(operation, { status, result, leaseUntil: 0 }); },
    applyPull(batch) { for (const change of batch.changes) change.deleted ? this.rows.delete(`${change.tableName}:${change.rowId}`) : this.rows.set(`${change.tableName}:${change.rowId}`, change.payload); this.cursor = batch.cursor; },
    getCursor() { return this.cursor; },
  };
}

describe("durable cloud sync worker", () => {
  it("commits an offline mutation with a stable tenant-bound hash before any cloud request", async () => {
    const store = createStore();
    const operation = createDurableOperation({ tenantId, tableName: "facturas", rowId: "sale-1", op: "insert", payload: { id: "sale-1", total: 25 }, deviceId: "device-1", sequence: 1, id: "operation-1" });
    store.commitMutation(operation);

    expect(store.operations[0]).toMatchObject({ id: "operation-1", tenantId, status: "pending", sequence: 1 });
    expect(store.operations[0].payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(store.rows.get("facturas:sale-1")).toEqual({ id: "sale-1", total: 25 });
  });

  it("reuses an authoritative result when the same immutable operation is delivered twice", async () => {
    const store = createStore();
    store.commitMutation(createDurableOperation({ tenantId, tableName: "facturas", rowId: "sale-1", op: "insert", payload: { id: "sale-1" }, deviceId: "device-1", sequence: 1, id: "operation-1" }));
    let pushes = 0;
    const client: ServerSyncClient = { push: async () => { pushes++; return { result: { authoritativeId: "sale-1" } }; }, pull: async () => ({ cursor: "0", changes: [] }) };
    const worker = new DurableSyncWorker(store, client, tenantId);

    await worker.push();
    store.operations[0].status = "pending";
    await worker.push();

    expect(pushes).toBe(2);
    expect(store.operations[0]).toMatchObject({ status: "synced", result: { authoritativeId: "sale-1" } });
  });

  it("does not advance the cursor when applying a pull batch fails, then replays its tombstone", async () => {
    const store = createStore();
    store.rows.set("facturas:obsolete", { id: "obsolete" });
    let fail = true;
    const originalApply = store.applyPull.bind(store);
    store.applyPull = (batch) => { if (fail) throw new Error("disk full"); originalApply(batch); };
    const client: ServerSyncClient = { push: async () => ({ result: {} }), pull: async () => ({ cursor: "cursor-2", changes: [{ tableName: "facturas", rowId: "sale-2", deleted: false, payload: { id: "sale-2" } }, { tableName: "facturas", rowId: "obsolete", deleted: true, payload: null }] }) };
    const worker = new DurableSyncWorker(store, client, tenantId);

    await expect(worker.pull()).rejects.toThrow("disk full");
    expect(store.getCursor()).toBeNull();
    fail = false;
    await worker.pull();

    expect(store.getCursor()).toBe("cursor-2");
    expect(store.rows.get("facturas:sale-2")).toEqual({ id: "sale-2" });
    expect(store.rows.has("facturas:obsolete")).toBe(false);
  });

  it.each(["facturas", "cierres_operativos", "inventario_movimientos"] as const)("never resolves %s conflicts with last-write-wins", async (tableName) => {
    const store = createStore();
    store.commitMutation(createDurableOperation({ tenantId, tableName, rowId: "row-1", op: "update", payload: { id: "row-1" }, deviceId: "device-1", sequence: 1, id: `operation-${tableName}` }));
    const client: ServerSyncClient = { push: async () => ({ conflict: { reason: "manual review required" } }), pull: async () => ({ cursor: "0", changes: [] }) };

    await new DurableSyncWorker(store, client, tenantId).push();
    expect(store.operations[0]).toMatchObject({ status: "conflicted", result: { reason: "manual review required" } });
  });

  it("keeps fiscal and delete conflicts out of automatic last-write-wins resolution", async () => {
    const store = createStore();
    store.commitMutation(createDurableOperation({ tenantId, tableName: "ecf_documents", rowId: "fiscal-1", op: "update", payload: { id: "fiscal-1" }, deviceId: "device-1", sequence: 1, id: "fiscal-conflict" }));
    store.commitMutation(createDurableOperation({ tenantId, tableName: "facturas", rowId: "sale-1", op: "delete", payload: null, deviceId: "device-1", sequence: 2, id: "delete-conflict" }));
    const client: ServerSyncClient = { push: async () => ({ conflict: { reason: "manual review required" } }), pull: async () => ({ cursor: "0", changes: [] }) };

    await new DurableSyncWorker(store, client, tenantId).push();
    expect(store.operations.map((operation) => operation.status)).toEqual(["conflicted", "conflicted"]);
  });
});
