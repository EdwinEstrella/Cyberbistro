import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker } from "../electron/persistence/syncWorker";

const TENANT = "tenant-1";
type Row = Record<string, any>;

/**
 * Minimal cloud mock whose ids may be JS numbers (platos.id is a plain integer
 * in Postgres, so PostgREST returns it as a number). `cap` forces small pages so
 * the keyset pagination (`.gt("id", afterId)`) is exercised with numeric ids —
 * the exact path that regressed when the pull loop required `typeof id ==="string"`.
 */
function makeNumericCloud(data: Record<string, Row[]>, cap = 500) {
  const client = {
    from(table: string) {
      let afterId: number | string | null = null;
      let tenant: string | null = null;
      const builder: any = {
        select: () => builder,
        eq: (_column: string, value: string) => { tenant = value; return builder; },
        order: () => builder,
        limit: () => builder,
        gt: (column: string, value: any) => { expect(column).toBe("id"); afterId = value; return builder; },
        then: (resolve: (result: unknown) => void) => resolve({
          data: (data[table] ?? [])
            .filter(row => (afterId == null || row.id > afterId) && row.tenant_id === tenant)
            .sort((a, b) => (a.id < b.id ? -1 : 1))
            .slice(0, cap),
          error: null,
        }),
      };
      return { select: () => builder };
    },
  };
  return client as never;
}

function plato(overrides: Row = {}): Row {
  return { id: -100, tenant_id: TENANT, sucursal_id: "branch-1", nombre: "Empanada", precio: 50,
    categoria: "Entradas", disponible: true, va_a_cocina: true, ...overrides };
}

describe("catalog cloud→SQLite pull with integer ids", () => {
  let db: DatabaseSync, store: SQLitePayrollSyncStore;
  beforeEach(() => { db = new DatabaseSync(":memory:"); initializeTenantSchema(db, TENANT); store = new SQLitePayrollSyncStore(db, TENANT); });
  afterEach(() => db.close());
  const pull = (client: never) => new DurableSyncWorker(store, new PayrollSyncClient(client), TENANT).pull();

  it("downloads platos whose ids are negative integers (not string uuids)", async () => {
    const applied = await pull(makeNumericCloud({ platos: [plato()] }));
    expect(applied).toBe(1);
    // The integer id is stored as its string form in the TEXT primary key.
    expect(db.prepare("SELECT id, nombre, precio, disponible, va_a_cocina FROM platos").get())
      .toEqual({ id: "-100", nombre: "Empanada", precio: 50, disponible: 1, va_a_cocina: 1 });
  });

  it("paginates numeric ids by keyset without skipping or looping", async () => {
    const platos = [plato({ id: -100, nombre: "A" }), plato({ id: -99, nombre: "B" }), plato({ id: -98, nombre: "C" })];
    // cap=2 forces two full pages plus a terminating empty page, driven by .gt("id", afterId).
    const applied = await pull(makeNumericCloud({ platos }, 2));
    expect(applied).toBe(3);
    expect(db.prepare("SELECT id FROM platos ORDER BY id").all())
      .toEqual([{ id: "-100" }, { id: "-98" }, { id: "-99" }]);
  });
});
