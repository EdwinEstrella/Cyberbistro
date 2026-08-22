import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { initializeTenantSchema } from "../electron/persistence/schema";

function setupTestDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  initializeTenantSchema(database, "tenant-test");
  database.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-1", "tenant-test", "Main Branch");
  database.prepare("INSERT INTO customers (id, tenant_id, name) VALUES (?, ?, ?)").run("customer-1", "tenant-test", "John Doe");
  database.prepare("INSERT INTO proveedores (id, tenant_id, name) VALUES (?, ?, ?)").run("supplier-1", "tenant-test", "Acme Supplier");
  return database;
}

describe("Extended SQLite schema (AR, AP, sessions, sync)", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => databases.splice(0).forEach((db) => db.close()));

  it("creates accounts receivable (cuentas_cobrar / cxc_pagos) tables with foreign keys and check constraints", () => {
    const db = setupTestDatabase();
    databases.push(db);

    db.prepare(`
      INSERT INTO cuentas_cobrar (id, tenant_id, sucursal_id, customer_id, monto_total, monto_pendiente, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("cxc-1", "tenant-test", "branch-1", "customer-1", 1500, 1500, "pendiente");

    db.prepare(`
      INSERT INTO cxc_pagos (id, tenant_id, sucursal_id, cuenta_cobrar_id, monto, metodo_pago)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("cxc-pago-1", "tenant-test", "branch-1", "cxc-1", 500, "cash");

    const row = db.prepare("SELECT * FROM cuentas_cobrar WHERE id = 'cxc-1'").get() as { monto_total: number };
    expect(row.monto_total).toBe(1500);

    expect(() => {
      db.prepare(`
        INSERT INTO cuentas_cobrar (id, tenant_id, sucursal_id, customer_id, monto_total, monto_pendiente, estado)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("cxc-invalid", "tenant-test", "branch-1", "customer-1", 100, 100, "invalido");
    }).toThrow();
  });

  it("creates accounts payable (cuentas_pagar / cxp_pagos) tables with foreign keys and check constraints", () => {
    const db = setupTestDatabase();
    databases.push(db);

    db.prepare(`
      INSERT INTO cuentas_pagar (id, tenant_id, sucursal_id, proveedor_id, monto_total, monto_pendiente, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("cxp-1", "tenant-test", "branch-1", "supplier-1", 3000, 3000, "pendiente");

    db.prepare(`
      INSERT INTO cxp_pagos (id, tenant_id, sucursal_id, cuenta_pagar_id, monto, metodo_pago)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("cxp-pago-1", "tenant-test", "branch-1", "cxp-1", 1000, "transfer");

    const row = db.prepare("SELECT * FROM cuentas_pagar WHERE id = 'cxp-1'").get() as { monto_total: number };
    expect(row.monto_total).toBe(3000);
  });

  it("creates local session and license cache tables pinned to tenant", () => {
    const db = setupTestDatabase();
    databases.push(db);

    db.prepare("INSERT INTO local_device_session (tenant_id, session_json) VALUES (?, ?)")
      .run("tenant-test", JSON.stringify({ userId: "u1", role: "admin" }));

    db.prepare("INSERT INTO local_license_cache (tenant_id, license_json) VALUES (?, ?)")
      .run("tenant-test", JSON.stringify({ active: true, plan: "enterprise" }));

    const session = db.prepare("SELECT * FROM local_device_session WHERE tenant_id = 'tenant-test'").get() as { session_json: string };
    expect(JSON.parse(session.session_json)).toEqual({ userId: "u1", role: "admin" });
  });
});
