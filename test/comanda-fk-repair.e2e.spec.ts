import { expect, test } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";

// Regression guard for the "no such table: comandas__legacy_migration" crash when
// deleting a comanda. An older recreate of `comandas` (before legacy_alter_table
// was enabled) rewrote produccion_cocina's foreign key to the temp table name and
// then dropped it, leaving a dangling FK. initializeTenantSchema must repair it.

function comandaFkTarget(db: DatabaseSync): string | undefined {
  const fks = db.prepare("PRAGMA foreign_key_list(produccion_cocina);").all() as Array<{ table: string; to: string }>;
  return fks.find((fk) => fk.to === "id" && fk.table.includes("comanda"))?.table;
}

test("initializeTenantSchema repairs produccion_cocina's dangling comanda FK", () => {
  const db = new DatabaseSync(":memory:");
  initializeTenantSchema(db, "tenant-e2e");

  // Healthy baseline: the FK points at the real comandas table.
  expect(comandaFkTarget(db)).toBe("comandas");

  // Reproduce the damage a pre-legacy_alter_table rename left behind: the FK now
  // points at a temp table that no longer exists.
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("ALTER TABLE produccion_cocina RENAME TO produccion_cocina__dmg;");
  db.exec(`
    CREATE TABLE produccion_cocina (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      comanda_id TEXT NOT NULL REFERENCES comandas__legacy_migration(id),
      state TEXT NOT NULL CHECK (state IN ('pending', 'preparing', 'ready', 'delivered'))
    ) STRICT;
  `);
  db.exec("DROP TABLE produccion_cocina__dmg;");
  db.exec("PRAGMA foreign_keys = ON;");
  expect(comandaFkTarget(db)).toBe("comandas__legacy_migration");

  // Re-running schema init must detect and repair the dangling FK.
  initializeTenantSchema(db, "tenant-e2e");
  expect(comandaFkTarget(db)).toBe("comandas");

  db.close();
});

test("recreateTable no longer rewrites a child FK when the parent is recreated", () => {
  // Drive the real comandas recreate path (triggered when comandas.mesa_id is
  // NOT NULL) and confirm produccion_cocina keeps pointing at comandas, proving
  // legacy_alter_table is in effect.
  const db = new DatabaseSync(":memory:");
  initializeTenantSchema(db, "tenant-e2e");
  expect(comandaFkTarget(db)).toBe("comandas");

  // Force the legacy comandas shape (mesa_id NOT NULL) so the next init recreates it.
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("ALTER TABLE comandas RENAME TO comandas__pre;");
  db.exec(`
    CREATE TABLE comandas (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
      mesa_id TEXT NOT NULL,
      mesa_numero INTEGER,
      state TEXT NOT NULL
    ) STRICT;
  `);
  db.exec("DROP TABLE comandas__pre;");
  db.exec("PRAGMA foreign_keys = ON;");

  initializeTenantSchema(db, "tenant-e2e");
  // After the recreate, the child FK must still resolve to a real table.
  expect(comandaFkTarget(db)).toBe("comandas");

  db.close();
});
