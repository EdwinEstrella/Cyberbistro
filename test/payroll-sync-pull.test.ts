import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker } from "../electron/persistence/syncWorker";

const TENANT = "tenant-1";

/** Minimal thenable Supabase-style select builder for pull tests. */
function makeSelectClient(dataByTable: Record<string, Array<Record<string, unknown>>>) {
  const gtCalls: Array<{ table: string; column: string; value: string }> = [];
  const from = (table: string) => {
    let currentColumn = "updated_at";
    const rows = dataByTable[table] ?? [];
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: (col: string) => { currentColumn = col; return builder; },
      limit: () => builder,
      gt: (col: string, value: string) => { gtCalls.push({ table, column: col, value }); return builder; },
      then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: rows, error: null }),
    };
    return builder;
  };
  return { client: { from } as never, gtCalls };
}

describe("PayrollSyncClient.pull (cloud → local, fetch half)", () => {
  it("collects changes from all pull tables and returns the max updated_at as cursor", async () => {
    const { client } = makeSelectClient({
      gasto_categorias: [{ id: "cat-1", nombre: "Servicios", updated_at: "2026-09-15T10:00:00.000Z" }],
      gastos: [{ id: "exp-1", descripcion: "Luz", monto: 100, updated_at: "2026-09-15T11:00:00.000Z" }],
      customers: [{ id: "cust-1", name: "Ana", updated_at: "2026-09-15T09:00:00.000Z" }],
    });
    const batch = await new PayrollSyncClient(client).pull({ tenantId: TENANT, cursor: null });

    expect(batch.changes.map((c) => c.tableName).sort()).toEqual(["customers", "gasto_categorias", "gastos"]);
    expect(batch.changes.every((c) => c.deleted === false)).toBe(true);
    expect(batch.cursor).toBe("2026-09-15T11:00:00.000Z");
  });

  it("filters by the cursor column when a cursor is provided", async () => {
    const { client, gtCalls } = makeSelectClient({ customers: [] });
    await new PayrollSyncClient(client).pull({ tenantId: TENANT, cursor: "2026-09-15T00:00:00.000Z" });
    expect(gtCalls.length).toBe(3);
    expect(gtCalls.every((c) => c.column === "updated_at" && c.value === "2026-09-15T00:00:00.000Z")).toBe(true);
  });

  it("keeps the previous cursor when nothing changed", async () => {
    const { client } = makeSelectClient({});
    const batch = await new PayrollSyncClient(client).pull({ tenantId: TENANT, cursor: "2026-09-15T00:00:00.000Z" });
    expect(batch.changes).toHaveLength(0);
    expect(batch.cursor).toBe("2026-09-15T00:00:00.000Z");
  });
});

describe("end-to-end pull: worker.pull() writes cloud rows into SQLite", () => {
  let db: DatabaseSync;
  let store: SQLitePayrollSyncStore;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    store = new SQLitePayrollSyncStore(db, TENANT);
  });

  it("pulls cloud changes through the store into their SQLite tables and advances the cursor", async () => {
    const { client } = makeSelectClient({
      gasto_categorias: [{ id: "cat-1", nombre: "Servicios", activa: true, updated_at: "2026-09-15T10:00:00.000Z" }],
      gastos: [{ id: "exp-1", descripcion: "Luz", monto: 150, metodo_pago: "efectivo", fecha_gasto: "2026-09-14T00:00:00.000Z", category_id: "cat-1", updated_at: "2026-09-15T12:00:00.000Z" }],
      customers: [{ id: "cust-1", name: "Ana", updated_at: "2026-09-15T09:00:00.000Z" }],
    });

    const pulled = await new DurableSyncWorker(store, new PayrollSyncClient(client), TENANT).pull();
    expect(pulled).toBe(3);

    expect((db.prepare("SELECT name FROM gasto_categorias WHERE id='cat-1'").get() as any)?.name).toBe("Servicios");
    expect((db.prepare("SELECT amount FROM gastos WHERE id='exp-1'").get() as any)?.amount).toBe(150);
    expect((db.prepare("SELECT name FROM customers WHERE id='cust-1'").get() as any)?.name).toBe("Ana");
    expect(store.getCursor()).toBe("2026-09-15T12:00:00.000Z");
  });
});
