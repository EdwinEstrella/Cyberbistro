import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { initializeTenantSchema as initializeReleasedSchema } from "./fixtures/schema-v12.1.29";

/**
 * Upgrade path for real installs: a tenant database created and filled by the
 * released v12.1.29 must survive the current schema initialization with every
 * row and value intact. Every other schema test starts from an empty database,
 * which never exercises ALTER TABLE / table-recreation migrations on live data.
 */

const TENANT = "tenant-test";
const BRANCH = "branch-1";

type Row = Record<string, unknown>;
type TableSnapshot = { columns: string[]; rows: Row[] };

// Same flags TenantStore.open uses in production.
function openDatabase(path: string): DatabaseSync {
  return new DatabaseSync(path, { enableForeignKeyConstraints: true, defensive: true });
}

function listTables(database: DatabaseSync): string[] {
  return (database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>).map((row) => row.name);
}

function listColumns(database: DatabaseSync, table: string): string[] {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
}

function sortRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function snapshotTables(database: DatabaseSync): Map<string, TableSnapshot> {
  const snapshot = new Map<string, TableSnapshot>();
  for (const table of listTables(database)) {
    const columns = listColumns(database, table);
    const rows = database.prepare(`SELECT * FROM ${table}`).all() as Row[];
    snapshot.set(table, { columns, rows: sortRows(rows) });
  }
  return snapshot;
}

function projectRows(database: DatabaseSync, table: string, columns: string[]): Row[] {
  const list = columns.map((column) => `"${column}"`).join(", ");
  return sortRows(database.prepare(`SELECT ${list} FROM ${table}`).all() as Row[]);
}

function seedReleasedData(database: DatabaseSync): void {
  const run = (sql: string, ...params: Array<string | number | null>) => database.prepare(sql).run(...params);

  run("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)", BRANCH, TENANT, "Principal");
  run(
    "INSERT INTO platos (id, tenant_id, sucursal_id, nombre, precio, categoria, disponible, va_a_cocina, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "plato-1", TENANT, BRANCH, "Burger", 450, "Comidas", 1, 1, "2026-09-01T12:00:00.000Z",
  );

  // Invoice history: the data users rely on most.
  run(
    `INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status, numero_factura, mesa_numero,
       cliente_nombre, metodo_pago, estado, subtotal, itbis, propina, moneda, items, ncf, ncf_tipo, created_at, pagada_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "factura-1", TENANT, BRANCH, "ncf_legacy", 531, "committed", 101, 1, "Cliente Final", "cash", "pagada",
    450, 81, 0, "DOP", JSON.stringify([{ nombre: "Burger", cantidad: 1, precio: 450 }]), "B0100000101", "B01",
    "2026-09-01T12:30:00.000Z", "2026-09-01T12:31:00.000Z",
  );
  run(
    `INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status, numero_factura, metodo_pago, estado, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "factura-2", TENANT, BRANCH, "dgii_ecf", 900, "pending_sync", 102, "card", "pagada", "2026-09-02T18:00:00.000Z",
  );
  run(
    `INSERT INTO consumos (id, tenant_id, sucursal_id, plato_id, name, quantity, unit_price, subtotal, state,
       nombre, cantidad, precio_unitario, estado, factura_id, mesa_numero, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "consumo-1", TENANT, BRANCH, "plato-1", "Burger", 1, 450, 450, "delivered",
    "Burger", 1, 450, "pagado", "factura-1", 1, "2026-09-01T12:10:00.000Z",
  );
  run(
    `INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state, closed_at, cycle_number, opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "cierre-1", TENANT, BRANCH, "2026-09-01", 2000, "closed", "2026-09-01T23:00:00.000Z", 105, "2026-09-01T08:00:00.000Z",
  );

  // Tables that the current schema recreates (ecf_documents, fiscal_outbox)
  // or alters (productos_inventario, recetas).
  run(
    "INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status) VALUES (?, ?, ?, ?, ?, ?)",
    "ecf-1", TENANT, BRANCH, "factura-2", "E32", "pending_sync",
  );
  run(
    "INSERT INTO fiscal_outbox (id, tenant_id, sucursal_id, factura_id, status) VALUES (?, ?, ?, ?, ?)",
    "fiscal-outbox-1", TENANT, BRANCH, "factura-2", "pending",
  );
  run("INSERT INTO productos_inventario (id, tenant_id, name, unit) VALUES (?, ?, ?, ?)", "insumo-1", TENANT, "Pan", "unidad");
  run(
    "INSERT INTO recetas (id, tenant_id, plato_id, inventory_product_id, quantity) VALUES (?, ?, ?, ?, ?)",
    "receta-1", TENANT, "plato-1", "insumo-1", 1,
  );

  // Unsynced local work must not be dropped by the upgrade.
  run(
    "INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "outbox-1", TENANT, BRANCH, "facturas", "factura-2", "insert", JSON.stringify({ id: "factura-2", total: 900 }), "pending",
  );
}

describe("schema upgrade from released v12.1.29", () => {
  let directory: string;
  let databasePath: string;
  let released: Map<string, TableSnapshot>;
  const open: DatabaseSync[] = [];

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "cloudix-schema-upgrade-"));
    databasePath = join(directory, `${TENANT}.sqlite`);

    const legacy = openDatabase(databasePath);
    initializeReleasedSchema(legacy, TENANT);
    seedReleasedData(legacy);
    released = snapshotTables(legacy);
    legacy.close();
  });

  afterEach(() => {
    open.splice(0).forEach((database) => database.close());
    rmSync(directory, { recursive: true, force: true });
  });

  function upgrade(): DatabaseSync {
    const database = openDatabase(databasePath);
    open.push(database);
    initializeTenantSchema(database, TENANT);
    return database;
  }

  it("seeds a realistic released database", () => {
    expect(released.get("facturas")?.rows).toHaveLength(2);
    expect(released.get("ecf_documents")?.rows).toHaveLength(1);
    expect(released.get("sync_outbox")?.rows).toHaveLength(1);
  });

  it("keeps every released table", () => {
    const database = upgrade();
    const tables = listTables(database);
    for (const table of released.keys()) expect(tables).toContain(table);
  });

  it("keeps every released column and every row value unchanged", () => {
    const database = upgrade();
    for (const [table, before] of released) {
      const after = listColumns(database, table);
      for (const column of before.columns) expect(after, `${table}.${column}`).toContain(column);
      expect(projectRows(database, table, before.columns), table).toEqual(before.rows);
    }
  });

  it("adds the new inventory and fiscal columns with safe defaults", () => {
    const database = upgrade();
    expect(listColumns(database, "ecf_documents")).toContain("certificate_metadata_id");
    expect(listColumns(database, "fiscal_outbox")).toEqual(expect.arrayContaining(["ecf_document_id", "attempts", "idempotency_key"]));
    expect(listTables(database)).toContain("inventario_movimientos");

    const insumo = database.prepare("SELECT stock_actual, stock_minimo, costo_promedio FROM productos_inventario WHERE id = ?").get("insumo-1");
    expect(insumo).toEqual({ stock_actual: 0, stock_minimo: 0, costo_promedio: 0 });
    const outbox = database.prepare("SELECT attempts FROM fiscal_outbox WHERE id = ?").get("fiscal-outbox-1");
    expect(outbox).toEqual({ attempts: 0 });
  });

  it("leaves foreign keys and file integrity clean", () => {
    const database = upgrade();
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(database.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    expect(database.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
  });

  it("is idempotent across app restarts", () => {
    const first = upgrade();
    const afterFirst = snapshotTables(first);
    first.close();
    open.splice(open.indexOf(first), 1);

    const second = upgrade();
    expect(snapshotTables(second)).toEqual(afterFirst);
  });

  it("keeps accepting new writes on recreated tables after the upgrade", () => {
    const database = upgrade();
    database.prepare(
      "INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status, certificate_metadata_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("ecf-2", TENANT, BRANCH, "factura-1", "E31", "pending_processing", "cert-1");
    expect(() =>
      database.prepare(
        "INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("ecf-3", TENANT, BRANCH, "factura-missing", "E31", "pending_sync"),
    ).toThrow(/FOREIGN KEY/);
  });
});
