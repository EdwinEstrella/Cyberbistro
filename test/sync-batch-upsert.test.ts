import { describe, it, expect, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { TenantStore } from "../electron/persistence/tenantStore";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker } from "../electron/persistence/syncWorker";

const TENANT = "tenant-batch";

function openStore(db: DatabaseSync): TenantStore {
  const instance = Object.create(TenantStore.prototype);
  (instance as any).database = db;
  (instance as any).databasePath = ":memory:";
  (instance as any).tenantId = TENANT;
  return instance as TenantStore;
}

function seedPaidConsumos(store: TenantStore, count: number): void {
  for (let i = 1; i <= count; i++) {
    store.saveConsumo({
      id: `consumo-${i}`,
      tenant_id: TENANT,
      sucursal_id: "branch-1",
      plato_id: "10",
      nombre: `Item ${i}`,
      cantidad: 1,
      precio_unitario: 100,
      subtotal: 100,
      estado: "pagado",
      factura_id: null,
      mesa_numero: 5,
    });
  }
}

describe("Durable sync batch upsert (mesa checkout)", () => {
  it("dispatches N paid consumos in a single upsert call instead of N", async () => {
    const db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    const store = openStore(db);
    seedPaidConsumos(store, 15);

    const upsertCalls: Array<{ table: string; rows: unknown }> = [];
    const cloudClient = {
      from: vi.fn((table: string) => ({
        upsert: vi.fn((rows: unknown) => {
          upsertCalls.push({ table, rows });
          return { error: null };
        }),
        update: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(async () => ({ data: [{}], error: null })) })) })),
        delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      })),
    };

    const syncStore = new SQLitePayrollSyncStore(db, TENANT);
    const worker = new DurableSyncWorker(syncStore, new PayrollSyncClient(cloudClient as any), TENANT);

    const { pushed, conflicted } = await worker.push();
    expect(conflicted).toBe(0);
    expect(pushed).toBe(15);

    const consumoUpserts = upsertCalls.filter((c) => c.table === "consumos");
    expect(consumoUpserts).toHaveLength(1); // one batch, not fifteen round-trips
    expect(Array.isArray(consumoUpserts[0].rows)).toBe(true);
    expect((consumoUpserts[0].rows as unknown[]).length).toBe(15);

    db.close();
  });

  it("falls back to per-row upserts when the batch call fails", async () => {
    const db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    const store = openStore(db);
    seedPaidConsumos(store, 3);

    let batchFailed = false;
    const upsertCalls: Array<{ isArray: boolean }> = [];
    const cloudClient = {
      from: vi.fn(() => ({
        upsert: vi.fn((rows: unknown) => {
          const isArray = Array.isArray(rows);
          upsertCalls.push({ isArray });
          if (isArray && !batchFailed) {
            batchFailed = true;
            return { error: { message: "batch boom" } };
          }
          return { error: null };
        }),
        update: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(async () => ({ data: [{}], error: null })) })) })),
        delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      })),
    };

    const syncStore = new SQLitePayrollSyncStore(db, TENANT);
    const worker = new DurableSyncWorker(syncStore, new PayrollSyncClient(cloudClient as any), TENANT);

    const { pushed, conflicted } = await worker.push();
    expect(conflicted).toBe(0);
    expect(pushed).toBe(3); // fallback still delivered every row

    // One failed batch (array) followed by three per-row upserts (single objects).
    expect(upsertCalls.filter((c) => c.isArray)).toHaveLength(1);
    expect(upsertCalls.filter((c) => !c.isArray)).toHaveLength(3);

    db.close();
  });
});
