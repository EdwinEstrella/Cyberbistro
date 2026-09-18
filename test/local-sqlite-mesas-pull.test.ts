import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { applyCloudMesasEstadoRows, applyCloudComandaRows } from "../electron/persistence/cloudApply";

const TENANT = "tenant-mesas-test";

describe("mesas_estado and comandas cloud→local pull", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-1", TENANT, "Central");
  });

  afterEach(() => {
    db.close();
  });

  it("applies cloud mesas_estado without table_number by extracting table number from integer id", () => {
    applyCloudMesasEstadoRows(db, TENANT, [
      { id: 1, estado: "libre", tenant_id: TENANT, sucursal_id: "branch-1" },
      { id: 2, estado: "ocupada", tenant_id: TENANT, sucursal_id: "branch-1" },
    ]);

    const rows = db.prepare("SELECT * FROM mesas_estado WHERE tenant_id = ? ORDER BY table_number ASC").all(TENANT) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "1", table_number: 1, state: "free" });
    expect(rows[1]).toMatchObject({ id: "2", table_number: 2, state: "occupied" });
  });

  it("applies cloud comandas referencing a mesa_id seamlessly", () => {
    applyCloudComandaRows(db, TENANT, [
      {
        id: "comanda-1",
        tenant_id: TENANT,
        sucursal_id: "branch-1",
        numero_comanda: 101,
        mesa_id: "1",
        mesa_numero: 1,
        estado: "en_preparacion",
        items: [{ name: "Burger", quantity: 1, price: 100 }],
      },
    ]);

    const comandas = db.prepare("SELECT * FROM comandas WHERE tenant_id = ?").all(TENANT) as Array<Record<string, unknown>>;
    expect(comandas).toHaveLength(1);
    expect(comandas[0]).toMatchObject({
      id: "comanda-1",
      numero_comanda: 101,
      mesa_numero: 1,
      state: "preparing",
    });
  });
});
