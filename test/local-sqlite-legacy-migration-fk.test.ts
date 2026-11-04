import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initializeTenantSchema } from "../electron/persistence/schema";

describe("local SQLite legacy migration dangling FK references", () => {
  const getTableSql = (database: DatabaseSync, tableName: string): string => {
    const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as
      | { sql: string }
      | undefined;
    return row ? row.sql : "";
  };

  it("repairs existing databases where consumos and produccion_cocina reference comandas__legacy_migration", () => {
    const database = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });

    // Step 1: Initialize a healthy database and seed rows.
    initializeTenantSchema(database, "tenant-a");
    database.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES ('main-process-default', 'tenant-a', 'Main')").run();

    database.prepare(`
      INSERT INTO comandas (id, tenant_id, sucursal_id, state)
      VALUES ('cmd-1', 'tenant-a', 'main-process-default', 'pending')
    `).run();

    database.prepare(`
      INSERT INTO consumos (id, tenant_id, sucursal_id, name, quantity, unit_price, subtotal, state, comanda_id)
      VALUES ('cons-1', 'tenant-a', 'main-process-default', 'Pizza Margherita', 1, 450, 450, 'delivered', 'cmd-1')
    `).run();

    database.prepare(`
      INSERT INTO produccion_cocina (id, tenant_id, sucursal_id, comanda_id, state)
      VALUES ('prod-1', 'tenant-a', 'main-process-default', 'cmd-1', 'pending')
    `).run();

    // Step 2: Simulate the historic production bug where recreateTable rebuilt comandas
    // without PRAGMA legacy_alter_table = ON, which rewrote FKs in consumos and produccion_cocina.
    database.exec("PRAGMA foreign_keys = OFF;");
    database.exec("BEGIN IMMEDIATE;");
    database.exec("ALTER TABLE comandas RENAME TO comandas__legacy_migration;");
    database.exec(`
      CREATE TABLE comandas (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
        mesa_id TEXT REFERENCES mesas_estado(id),
        mesa_numero INTEGER CHECK (mesa_numero > 0),
        state TEXT NOT NULL CHECK (state IN ('pending', 'preparing', 'ready', 'delivered'))
      ) STRICT;
    `);
    database.exec(`
      INSERT INTO comandas (id, tenant_id, sucursal_id, state)
      SELECT id, tenant_id, sucursal_id, state FROM comandas__legacy_migration;
    `);
    database.exec("DROP TABLE comandas__legacy_migration;");
    database.exec("COMMIT;");
    database.exec("PRAGMA foreign_keys = ON;");

    // Verify that the database is currently in the broken production state:
    // 1) sqlite_master contains tables with references to __legacy_migration
    const brokenTables = database
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql LIKE '%__legacy_migration%'")
      .all() as Array<{ name: string; sql: string }>;
    expect(brokenTables.map((t) => t.name).sort()).toEqual(["consumos", "produccion_cocina"]);

    // 2) Touching consumos or produccion_cocina fails with "no such table: main.comandas__legacy_migration"
    expect(() => {
      database.prepare(`
        INSERT INTO consumos (id, tenant_id, sucursal_id, name, quantity, unit_price, subtotal, state, comanda_id)
        VALUES ('cons-fail', 'tenant-a', 'main-process-default', 'Burger', 1, 300, 300, 'delivered', 'cmd-1')
      `).run();
    }).toThrow(/no such table:.*comandas__legacy_migration/);

    // Step 3: Run initializeTenantSchema which triggers repairDanglingLegacyMigrationReferences.
    initializeTenantSchema(database, "tenant-a");

    // Verify after repair:
    // a) No table in sqlite_master contains __legacy_migration
    const remainingDangling = database
      .prepare("SELECT name, sql FROM sqlite_master WHERE sql LIKE '%__legacy_migration%'")
      .all();
    expect(remainingDangling).toEqual([]);

    // b) DDL references "comandas" (or "comandas(id)") cleanly
    expect(getTableSql(database, "consumos")).toContain("REFERENCES comandas(id)");
    expect(getTableSql(database, "produccion_cocina")).toContain("REFERENCES comandas(id)");

    // c) Existing rows are fully preserved
    const consumosRows = database.prepare("SELECT id, comanda_id, name FROM consumos").all();
    expect(consumosRows).toEqual([
      { id: "cons-1", comanda_id: "cmd-1", name: "Pizza Margherita" },
    ]);
    const produccionRows = database.prepare("SELECT id, comanda_id, state FROM produccion_cocina").all();
    expect(produccionRows).toEqual([
      { id: "prod-1", comanda_id: "cmd-1", state: "pending" },
    ]);

    // d) Table indexes still exist
    const indexes = (
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'consumos'").all() as Array<{
        name: string;
      }>
    ).map((row) => row.name);
    expect(indexes).toContain("idx_consumos_comanda");

    // e) Inserting a consumo with a valid comanda_id succeeds
    expect(() => {
      database.prepare(`
        INSERT INTO consumos (id, tenant_id, sucursal_id, name, quantity, unit_price, subtotal, state, comanda_id)
        VALUES ('cons-2', 'tenant-a', 'main-process-default', 'Burger', 1, 350, 350, 'delivered', 'cmd-1')
      `).run();
    }).not.toThrow();

    const allConsumos = database.prepare("SELECT id FROM consumos ORDER BY id").all();
    expect(allConsumos).toEqual([{ id: "cons-1" }, { id: "cons-2" }]);
  });

  it("prevents recreateTable on comandas from rewriting consumos FK to __legacy_migration", () => {
    const database = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });

    // Build the legacy shape where comandas.mesa_id was NOT NULL:
    // ensureSalonCocinaSchemaEvolution will detect !isColumnNullable(comandas, "mesa_id")
    // and invoke recreateTable on comandas.
    database.exec(`
      CREATE TABLE tenant_identity (id TEXT PRIMARY KEY CHECK (id = 'tenant-a')) STRICT;
      INSERT INTO tenant_identity VALUES ('tenant-a');
      CREATE TABLE tenants (id TEXT PRIMARY KEY REFERENCES tenant_identity(id)) STRICT;
      INSERT INTO tenants VALUES ('tenant-a');
      CREATE TABLE sucursales (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL) STRICT;
      INSERT INTO sucursales VALUES ('main-process-default', 'tenant-a', 'Main');
      CREATE TABLE mesas_estado (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
        numero INTEGER NOT NULL,
        estado TEXT NOT NULL
      ) STRICT;
      INSERT INTO mesas_estado VALUES ('mesa-1', 'tenant-a', 'main-process-default', 1, 'libre');
      CREATE TABLE comandas (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
        mesa_id TEXT NOT NULL REFERENCES mesas_estado(id),
        mesa_numero INTEGER CHECK (mesa_numero > 0),
        state TEXT NOT NULL CHECK (state IN ('pending', 'preparing', 'ready', 'delivered'))
      ) STRICT;
      INSERT INTO comandas VALUES ('cmd-legacy', 'tenant-a', 'main-process-default', 'mesa-1', 1, 'pending');
      CREATE TABLE consumos (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
        comanda_id TEXT REFERENCES comandas(id),
        plato_id TEXT,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price REAL NOT NULL CHECK (unit_price >= 0),
        subtotal REAL NOT NULL CHECK (subtotal >= 0),
        state TEXT NOT NULL
      ) STRICT;
      INSERT INTO consumos VALUES ('cons-legacy', 'tenant-a', 'main-process-default', 'cmd-legacy', null, 'Pasta', 1, 200, 200, 'delivered');
    `);

    // Run initializeTenantSchema: ensureSalonCocinaSchemaEvolution will execute recreateTable on comandas
    initializeTenantSchema(database, "tenant-a");

    const consumosSql = getTableSql(database, "consumos");
    expect(consumosSql).toContain("REFERENCES comandas(id)");
    expect(consumosSql).not.toContain("__legacy_migration");

    // Inserting a new consumo must succeed cleanly
    expect(() => {
      database.prepare(`
        INSERT INTO consumos (id, tenant_id, sucursal_id, name, quantity, unit_price, subtotal, state, comanda_id)
        VALUES ('cons-new', 'tenant-a', 'main-process-default', 'Tiramisu', 1, 150, 150, 'delivered', 'cmd-legacy')
      `).run();
    }).not.toThrow();
  });

  it("is idempotent: a second call to initializeTenantSchema leaves sqlite_master unchanged", () => {
    const database = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    initializeTenantSchema(database, "tenant-a");

    const snapshot1 = database
      .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name")
      .all();

    initializeTenantSchema(database, "tenant-a");

    const snapshot2 = database
      .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name")
      .all();

    expect(snapshot2).toEqual(snapshot1);
  });
});
