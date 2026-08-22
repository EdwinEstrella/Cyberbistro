import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { initializeTenantSchema } from "../electron/persistence/schema";

function purchaseDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  initializeTenantSchema(database, "tenant-a");
  database.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-a", "tenant-a", "Main");
  database.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-b", "tenant-a", "Secondary");
  database.prepare("INSERT INTO proveedores (id, tenant_id, name) VALUES (?, ?, ?)").run("supplier-a", "tenant-a", "Supplier");
  database.prepare("INSERT INTO productos_inventario (id, tenant_id, name, unit) VALUES (?, ?, ?, ?)").run("inventory-a", "tenant-a", "Rice", "kg");
  return database;
}

describe("tenant-pinned local cash purchase SQLite schema", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.close()));

  it("creates strict cash purchase, detail, inventory, and expense tables with tenant-bound foreign keys", () => {
    const database = purchaseDatabase();
    databases.push(database);

    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('compras', 'detalles_compra', 'movimientos_inventario', 'gastos') ORDER BY name").all())
      .toEqual([{ name: "compras" }, { name: "detalles_compra" }, { name: "gastos" }, { name: "movimientos_inventario" }]);
    expect(() => database.prepare("INSERT INTO compras (id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status) VALUES (?, ?, ?, ?, ?, ?, ?)").run("purchase-foreign", "tenant-b", "branch-a", "supplier-a", "cash", 10, "pending_sync"))
      .toThrow();
    expect(() => database.prepare("INSERT INTO compras (id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status) VALUES (?, ?, ?, ?, ?, ?, ?)").run("purchase-credit", "tenant-a", "branch-a", "supplier-a", "credit", 10, "pending_sync"))
      .toThrow();
  });

  it("rejects invalid purchase detail, inventory movement, and expense values", () => {
    const database = purchaseDatabase();
    databases.push(database);
    database.prepare("INSERT INTO compras (id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status) VALUES (?, ?, ?, ?, ?, ?, ?)").run("purchase-a", "tenant-a", "branch-a", "supplier-a", "cash", 10, "pending_sync");

    expect(() => database.prepare("INSERT INTO detalles_compra (id, tenant_id, compra_id, inventory_product_id, quantity, unit_cost, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)").run("detail-invalid", "tenant-a", "purchase-a", "inventory-a", 0, 5, 0)).toThrow();
    expect(() => database.prepare("INSERT INTO movimientos_inventario (id, tenant_id, sucursal_id, compra_id, inventory_product_id, movement_type, quantity, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("movement-invalid", "tenant-a", "branch-a", "purchase-a", "inventory-a", "sale", 1, 5)).toThrow();
    expect(() => database.prepare("INSERT INTO gastos (id, tenant_id, sucursal_id, compra_id, payment_method, amount, local_status) VALUES (?, ?, ?, ?, ?, ?, ?)").run("expense-invalid", "tenant-a", "branch-a", "purchase-a", "cash", -1, "pending_sync")).toThrow();
  });

  it("rejects purchase-linked inventory movements and expenses from another branch", () => {
    const database = purchaseDatabase();
    databases.push(database);
    database.prepare("INSERT INTO compras (id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status) VALUES (?, ?, ?, ?, ?, ?, ?)").run("purchase-a", "tenant-a", "branch-a", "supplier-a", "cash", 10, "pending_sync");

    expect(() => database.prepare("INSERT INTO movimientos_inventario (id, tenant_id, sucursal_id, compra_id, inventory_product_id, movement_type, quantity, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("movement-other-branch", "tenant-a", "branch-b", "purchase-a", "inventory-a", "purchase_receipt", 2, 5)).toThrow();
    expect(() => database.prepare("INSERT INTO gastos (id, tenant_id, sucursal_id, compra_id, payment_method, amount, local_status) VALUES (?, ?, ?, ?, ?, ?, ?)").run("expense-other-branch", "tenant-a", "branch-b", "purchase-a", "cash", 10, "pending_sync")).toThrow();
  });

  it("supports an all-or-nothing local purchase graph and sync outbox transaction", () => {
    const database = purchaseDatabase();
    databases.push(database);
    database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("purchase-outbox", "tenant-a", "branch-a", "existing", "existing-row", "upsert", "{}", "pending");

    database.exec("BEGIN IMMEDIATE;");
    let collision: unknown;
    try {
      database.prepare("INSERT INTO compras (id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status) VALUES (?, ?, ?, ?, ?, ?, ?)").run("purchase-a", "tenant-a", "branch-a", "supplier-a", "cash", 10, "pending_sync");
      database.prepare("INSERT INTO detalles_compra (id, tenant_id, compra_id, inventory_product_id, quantity, unit_cost, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)").run("detail-a", "tenant-a", "purchase-a", "inventory-a", 2, 5, 10);
      database.prepare("INSERT INTO movimientos_inventario (id, tenant_id, sucursal_id, compra_id, inventory_product_id, movement_type, quantity, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("movement-a", "tenant-a", "branch-a", "purchase-a", "inventory-a", "purchase_receipt", 2, 5);
      database.prepare("INSERT INTO gastos (id, tenant_id, sucursal_id, compra_id, expense_type, payment_method, amount, local_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("expense-a", "tenant-a", "branch-a", "purchase-a", "purchase", "cash", 10, "pending_sync");
      database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("purchase-outbox", "tenant-a", "branch-a", "compras", "purchase-a", "upsert", "{}", "pending");
      database.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("purchase-outbox", "tenant-a", "branch-a", "gastos", "expense-a", "upsert", "{}", "pending");
      database.exec("COMMIT;");
    } catch (error) {
      collision = error;
      database.exec("ROLLBACK;");
    }

    expect(collision).toBeInstanceOf(Error);
    expect((collision as Error).message).toMatch(/UNIQUE constraint failed: sync_outbox.id/);
    expect(database.prepare("SELECT COUNT(*) AS count FROM compras").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM detalles_compra").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM movimientos_inventario").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM gastos").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT id, table_name, row_id FROM sync_outbox WHERE id = 'purchase-outbox'").get()).toEqual({ id: "purchase-outbox", table_name: "existing", row_id: "existing-row" });
  });
});
