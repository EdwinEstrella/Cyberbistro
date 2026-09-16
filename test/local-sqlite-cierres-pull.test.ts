import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker } from "../electron/persistence/syncWorker";

const TENANT = "tenant-1";
type Row = Record<string, any>;

function makeCloud(data: Record<string, Row[]>, cap = 500) {
  const failures = new Set<string>();
  const client = { from(table: string) {
    let afterId = "", limit = cap, tenant: string | null = null;
    const builder: any = {
      upsert: async () => ({ error: null }),
      select: () => builder,
      eq: (_column: string, value: string) => { tenant = value; return builder; },
      order: () => builder,
      limit: (value: number) => { limit = Math.min(cap, value); return builder; },
      gt: (column: string, value: string) => { expect(column).toBe("id"); afterId = value; return builder; },
      then: (resolve: (result: unknown) => void) => resolve({
        data: (data[table] ?? [])
          .filter(row => row.id > afterId && (row.tenant_id ?? row.nomina_empleados?.tenant_id) === tenant)
          .sort((a, b) => a.id < b.id ? -1 : 1).slice(0, limit),
        error: failures.has(table) ? { message: "offline" } : null,
      }),
    };
    return { upsert: builder.upsert, select: () => builder };
  }};
  return { client: client as never, failures };
}

function cloudCycle(overrides: Row = {}): Row {
  return {
    id: "cycle-1", tenant_id: TENANT, sucursal_id: "branch-1", business_day: "2026-09-16",
    cycle_number: 3, opened_at: "2026-09-16T08:00:00Z", closed_at: null, printed_at: null,
    opened_by_auth_user_id: null, closed_by_auth_user_id: null, efectivo_inicial: 1500,
    created_at: "2026-09-16T08:00:00Z", ...overrides,
  };
}

describe("cierres_operativos cloud→local pull", () => {
  let db: DatabaseSync, store: SQLitePayrollSyncStore;
  beforeEach(() => { db = new DatabaseSync(":memory:"); initializeTenantSchema(db, TENANT); store = new SQLitePayrollSyncStore(db, TENANT); });
  afterEach(() => db.close());
  const pull = async (cloud: ReturnType<typeof makeCloud>) =>
    new DurableSyncWorker(store, new PayrollSyncClient(cloud.client), TENANT).pull();

  it("downloads an open cloud cycle mapping efectivo_inicial→opening_cash and deriving state", async () => {
    const cloud = makeCloud({ cierres_operativos: [cloudCycle()] });
    await pull(cloud);
    const row = db.prepare("SELECT * FROM cierres_operativos WHERE id = 'cycle-1'").get() as Row;
    expect(row).toBeTruthy();
    expect(row.tenant_id).toBe(TENANT);
    expect(row.sucursal_id).toBe("branch-1");
    expect(row.business_day).toBe("2026-09-16");
    expect(row.opening_cash).toBe(1500);
    expect(row.state).toBe("open");
    expect(row.closed_at).toBeNull();
    expect(row.cycle_number).toBe(3);
    expect(row.opened_at).toBe("2026-09-16T08:00:00Z");
  });

  it("marks a cycle with closed_at as closed and preserves it across a re-pull", async () => {
    const cloud = makeCloud({ cierres_operativos: [cloudCycle({ id: "cycle-2", cycle_number: 4, closed_at: "2026-09-16T20:00:00Z" })] });
    await pull(cloud);
    let row = db.prepare("SELECT * FROM cierres_operativos WHERE id = 'cycle-2'").get() as Row;
    expect(row.state).toBe("closed");
    expect(row.closed_at).toBe("2026-09-16T20:00:00Z");
    // A cycle absent from a later snapshot must never be deleted.
    await pull(makeCloud({ cierres_operativos: [] }));
    row = db.prepare("SELECT * FROM cierres_operativos WHERE id = 'cycle-2'").get() as Row;
    expect(row).toBeTruthy();
  });

  it("accepts a cloud cycle without a branch (nullable sucursal_id)", async () => {
    const cloud = makeCloud({ cierres_operativos: [cloudCycle({ id: "cycle-3", sucursal_id: null })] });
    await pull(cloud);
    const row = db.prepare("SELECT * FROM cierres_operativos WHERE id = 'cycle-3'").get() as Row;
    expect(row).toBeTruthy();
    expect(row.sucursal_id).toBeNull();
  });
});
