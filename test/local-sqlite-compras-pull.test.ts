import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker } from "../electron/persistence/syncWorker";

const TENANT = "tenant-1";
type Row = Record<string, any>;

function makeCloud(data: Record<string, Row[]>, cap = 500) {
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
          .filter(row => row.id > afterId && row.tenant_id === tenant)
          .sort((a, b) => a.id < b.id ? -1 : 1).slice(0, limit),
        error: null,
      }),
    };
    return { upsert: builder.upsert, select: () => builder };
  }};
  return { client: client as never };
}

function cloudCompra(overrides: Row = {}): Row {
  return {
    id: "compra-1", tenant_id: TENANT, sucursal_id: "branch-1", proveedor_id: "prov-1",
    numero_factura: "F-CASH-001", tipo_pago: "contado", metodo_pago: "efectivo",
    monto_pagado: 1200, fecha_compra: "2026-06-08T14:40:00Z", cycle_id: null,
    estado: "completada", observacion: null, usuario_id: null, total: 1200, ...overrides,
  };
}

describe("compras cloud→local pull", () => {
  let db: DatabaseSync, store: SQLitePayrollSyncStore;
  beforeEach(() => { db = new DatabaseSync(":memory:"); initializeTenantSchema(db, TENANT); store = new SQLitePayrollSyncStore(db, TENANT); });
  afterEach(() => db.close());
  const pull = async (cloud: ReturnType<typeof makeCloud>) =>
    new DurableSyncWorker(store, new PayrollSyncClient(cloud.client), TENANT).pull();

  it("downloads a non-cash cloud purchase, ensuring proveedor FK and keeping payment_method='cash' with the real method in metodo_pago", async () => {
    const cloud = makeCloud({ compras: [cloudCompra()] });
    await pull(cloud);
    const row = db.prepare("SELECT * FROM compras WHERE id = 'compra-1'").get() as Row;
    expect(row).toBeTruthy();
    expect(row.tenant_id).toBe(TENANT);
    expect(row.sucursal_id).toBe("branch-1");
    expect(row.proveedor_id).toBe("prov-1");
    expect(row.payment_method).toBe("cash"); // legacy CHECK satisfied
    expect(row.metodo_pago).toBe("efectivo"); // real method preserved
    expect(row.numero_factura).toBe("F-CASH-001");
    expect(row.total).toBe(1200);
    expect(row.fecha_compra).toBe("2026-06-08T14:40:00Z");
    // proveedor FK row was created so the STRICT reference resolves
    expect(db.prepare("SELECT id FROM proveedores WHERE id = 'prov-1'").get()).toEqual({ id: "prov-1" });
  });

  it("is not hard-deleted when absent from a later snapshot", async () => {
    await pull(makeCloud({ compras: [cloudCompra({ id: "compra-2" })] }));
    await pull(makeCloud({ compras: [] }));
    expect(db.prepare("SELECT id FROM compras WHERE id = 'compra-2'").get()).toEqual({ id: "compra-2" });
  });
});
