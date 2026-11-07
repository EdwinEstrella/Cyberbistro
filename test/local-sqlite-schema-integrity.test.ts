import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { initializeTenantSchema as initializeReleasedSchema } from "./fixtures/schema-v12.1.29";
import {
  assertSchemaIntegrity,
  findDanglingForeignKeys,
  findLeftoverMigrationArtifacts,
} from "./helpers/schemaIntegrity";

function isColumnNullable(db: DatabaseSync, tableName: string, columnName: string): boolean {
  const info = db.prepare(`PRAGMA table_info(${tableName});`).all() as Array<{ name: string; notnull: number }>;
  const col = info.find((c) => c.name === columnName);
  return col ? col.notnull === 0 : true;
}

function getTableColumns(db: DatabaseSync, tableName: string): string[] {
  return (db.prepare(`PRAGMA table_info(${tableName});`).all() as Array<{ name: string }>).map((c) => c.name);
}

describe("local SQLite schema integrity guard", () => {
  it("passes integrity check on fresh schema initialization", () => {
    const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    try {
      initializeTenantSchema(db, "tenant-test");
      assertSchemaIntegrity(db);
    } finally {
      db.close();
    }
  });

  it("passes integrity check when upgrading from released v12.1.29 and remains idempotent across restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "cb-schema-upgrade-"));
    const dbPath = join(dir, "tenant.sqlite");
    try {
      const db1 = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
      try {
        initializeReleasedSchema(db1, "tenant-test");
        initializeTenantSchema(db1, "tenant-test");
        assertSchemaIntegrity(db1);
      } finally {
        db1.close();
      }

      // App restart: open existing database and re-initialize
      const db2 = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
      try {
        initializeTenantSchema(db2, "tenant-test");
        assertSchemaIntegrity(db2);
      } finally {
        db2.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exercises and asserts every recreateTable migration path from legacy shapes", () => {
    const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    try {
      // Build a legacy database containing every legacy table shape that triggers recreateTable:
      db.exec(`
        CREATE TABLE tenant_identity (
          id TEXT PRIMARY KEY
        );
        INSERT INTO tenant_identity (id) VALUES ('tenant-test');

        CREATE TABLE tenants (
          id TEXT PRIMARY KEY REFERENCES tenant_identity(id)
        );
        INSERT INTO tenants (id) VALUES ('tenant-test');

        CREATE TABLE sucursales (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          name TEXT NOT NULL
        );
        INSERT INTO sucursales (id, tenant_id, name) VALUES ('suc-1', 'tenant-test', 'Main Branch');

        CREATE TABLE mesas_estado (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          numero INTEGER NOT NULL,
          estado TEXT NOT NULL
        );
        INSERT INTO mesas_estado (id, tenant_id, sucursal_id, numero, estado) VALUES ('mesa-1', 'tenant-test', 'suc-1', 1, 'libre');

        -- 1. comandas with mesa_id NOT NULL
        CREATE TABLE comandas (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          mesa_id TEXT NOT NULL REFERENCES mesas_estado(id),
          mesa_numero INTEGER CHECK (mesa_numero > 0),
          state TEXT NOT NULL CHECK (state IN ('pending', 'preparing', 'ready', 'delivered'))
        );
        INSERT INTO comandas (id, tenant_id, sucursal_id, mesa_id, mesa_numero, state)
        VALUES ('cmd-1', 'tenant-test', 'suc-1', 'mesa-1', 1, 'pending');

        -- 2. consumos with comanda_id NOT NULL REFERENCES comandas(id)
        CREATE TABLE consumos (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          comanda_id TEXT NOT NULL REFERENCES comandas(id),
          plato_id TEXT,
          name TEXT NOT NULL,
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          unit_price REAL NOT NULL CHECK (unit_price >= 0),
          subtotal REAL NOT NULL CHECK (subtotal >= 0),
          state TEXT NOT NULL
        );
        INSERT INTO consumos (id, tenant_id, sucursal_id, comanda_id, plato_id, name, quantity, unit_price, subtotal, state)
        VALUES ('cons-1', 'tenant-test', 'suc-1', 'cmd-1', NULL, 'Burger', 1, 100, 100, 'delivered');

        -- 3. produccion_cocina referencing comandas(id)
        CREATE TABLE produccion_cocina (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          comanda_id TEXT NOT NULL REFERENCES comandas(id),
          state TEXT NOT NULL CHECK (state IN ('pending', 'preparing', 'ready', 'delivered', 'cancelled'))
        );
        INSERT INTO produccion_cocina (id, tenant_id, sucursal_id, comanda_id, state)
        VALUES ('prod-1', 'tenant-test', 'suc-1', 'cmd-1', 'pending');

        -- 4. payroll_employees without base_salary_cents
        CREATE TABLE payroll_employees (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          role TEXT NOT NULL,
          base_salary REAL,
          frequency TEXT NOT NULL,
          is_active INTEGER,
          created_at TEXT,
          updated_at TEXT
        );
        INSERT INTO payroll_employees (id, tenant_id, sucursal_id, first_name, last_name, role, base_salary, frequency)
        VALUES ('emp-1', 'tenant-test', 'suc-1', 'John', 'Doe', 'Chef', 500, 'monthly');

        -- 5. payroll_payments without amount_paid_cents
        CREATE TABLE payroll_payments (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          employee_id TEXT NOT NULL REFERENCES payroll_employees(id),
          period TEXT NOT NULL,
          frequency TEXT NOT NULL,
          base_amount REAL,
          amount_paid REAL,
          pending_amount REAL,
          receipt_snapshot TEXT NOT NULL,
          created_at TEXT
        );
        INSERT INTO payroll_payments (id, tenant_id, sucursal_id, employee_id, period, frequency, base_amount, amount_paid, pending_amount, receipt_snapshot)
        VALUES ('pay-1', 'tenant-test', 'suc-1', 'emp-1', '2026-09', 'monthly', 500, 500, 0, '{}');

        -- 6. payroll_payment_adjustments without amount_cents / scope / sucursal_id
        CREATE TABLE payroll_payment_adjustments (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          payment_id TEXT NOT NULL REFERENCES payroll_payments(id),
          kind TEXT NOT NULL,
          type TEXT NOT NULL,
          apply_mode TEXT NOT NULL,
          amount REAL,
          note TEXT
        );
        INSERT INTO payroll_payment_adjustments (id, tenant_id, payment_id, kind, type, apply_mode, amount, note)
        VALUES ('adj-1', 'tenant-test', 'pay-1', 'bonus', 'overtime', 'current_payment', 50, 'Good job');

        -- 7. customers without phone, document_id, deleted_at
        CREATE TABLE customers (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          name TEXT NOT NULL
        );
        INSERT INTO customers (id, tenant_id, name) VALUES ('cust-1', 'tenant-test', 'Alice');

        -- 8. gasto_categorias without color, active
        CREATE TABLE gasto_categorias (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          name TEXT NOT NULL
        );
        INSERT INTO gasto_categorias (id, tenant_id, name) VALUES ('cat-1', 'tenant-test', 'Utilities');

        -- 9. gastos without category_id, cycle_id, expense_date
        CREATE TABLE gastos (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          compra_id TEXT,
          payroll_payment_id TEXT,
          expense_type TEXT NOT NULL DEFAULT 'operational',
          payment_method TEXT NOT NULL DEFAULT 'cash',
          amount REAL,
          amount_cents INTEGER,
          local_status TEXT NOT NULL DEFAULT 'committed',
          description TEXT
        );
        INSERT INTO gastos (id, tenant_id, sucursal_id, expense_type, payment_method, amount, amount_cents, local_status, description)
        VALUES ('gasto-1', 'tenant-test', 'suc-1', 'operational', 'cash', 100, 10000, 'committed', 'Electricity');

        -- 10. cierres_operativos without cycle_number, opened_at
        CREATE TABLE cierres_operativos (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT REFERENCES sucursales(id),
          business_day TEXT NOT NULL,
          opening_cash REAL NOT NULL,
          state TEXT NOT NULL,
          closed_at TEXT
        );
        INSERT INTO cierres_operativos (id, tenant_id, sucursal_id, business_day, opening_cash, state)
        VALUES ('cierre-1', 'tenant-test', 'suc-1', '2026-09-01', 1000, 'open');

        -- 11. menu_categories without nombre, color
        CREATE TABLE menu_categories (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          name TEXT NOT NULL
        );
        INSERT INTO menu_categories (id, tenant_id, name) VALUES ('menu-cat-1', 'tenant-test', 'Drinks');

        -- 12. platos without nombre, precio
        CREATE TABLE platos (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          name TEXT NOT NULL
        );
        INSERT INTO platos (id, tenant_id, name) VALUES ('plato-1', 'tenant-test', 'Coffee');

        -- Helper tables for fiscal tables
        CREATE TABLE facturas (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          fiscal_mode TEXT,
          total REAL
        );
        INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total) VALUES ('fact-1', 'tenant-test', 'suc-1', 'ncf_legacy', 100);

        -- 13. ecf_documents without certificate_metadata_id / signed columns
        CREATE TABLE ecf_documents (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          factura_id TEXT NOT NULL UNIQUE REFERENCES facturas(id),
          document_type TEXT NOT NULL,
          status TEXT NOT NULL
        );
        INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status)
        VALUES ('ecf-1', 'tenant-test', 'suc-1', 'fact-1', 'E31', 'signed');

        -- 14. fiscal_outbox without ecf_document_id / operation / attempts
        CREATE TABLE fiscal_outbox (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          factura_id TEXT NOT NULL REFERENCES facturas(id),
          status TEXT NOT NULL
        );
        INSERT INTO fiscal_outbox (id, tenant_id, sucursal_id, factura_id, status)
        VALUES ('fo-1', 'tenant-test', 'suc-1', 'fact-1', 'pending');
      `);

      // Verify that all shapes are in legacy state BEFORE migration
      expect(isColumnNullable(db, "comandas", "mesa_id")).toBe(false);
      expect(isColumnNullable(db, "consumos", "comanda_id")).toBe(false);
      expect(getTableColumns(db, "payroll_employees")).not.toContain("base_salary_cents");
      expect(getTableColumns(db, "payroll_payments")).not.toContain("amount_paid_cents");
      expect(getTableColumns(db, "payroll_payment_adjustments")).not.toContain("amount_cents");
      expect(getTableColumns(db, "customers")).not.toContain("phone");
      expect(getTableColumns(db, "gasto_categorias")).not.toContain("color");
      expect(getTableColumns(db, "gastos")).not.toContain("category_id");
      expect(getTableColumns(db, "cierres_operativos")).not.toContain("cycle_number");
      expect(getTableColumns(db, "menu_categories")).not.toContain("nombre");
      expect(getTableColumns(db, "platos")).not.toContain("nombre");
      expect(getTableColumns(db, "ecf_documents")).not.toContain("certificate_metadata_id");
      expect(getTableColumns(db, "fiscal_outbox")).not.toContain("ecf_document_id");

      // Execute migration
      initializeTenantSchema(db, "tenant-test");

      // Assert that EVERY recreateTable path actually executed and evolved the shape
      expect(isColumnNullable(db, "comandas", "mesa_id")).toBe(true);
      expect(isColumnNullable(db, "consumos", "comanda_id")).toBe(true);
      expect(getTableColumns(db, "payroll_employees")).toContain("base_salary_cents");
      expect(getTableColumns(db, "payroll_payments")).toContain("amount_paid_cents");
      expect(getTableColumns(db, "payroll_payment_adjustments")).toEqual(
        expect.arrayContaining(["amount_cents", "scope", "sucursal_id"]),
      );
      expect(getTableColumns(db, "customers")).toEqual(
        expect.arrayContaining(["phone", "document_id", "deleted_at"]),
      );
      expect(getTableColumns(db, "gasto_categorias")).toEqual(
        expect.arrayContaining(["color", "active"]),
      );
      expect(getTableColumns(db, "gastos")).toEqual(
        expect.arrayContaining(["category_id", "cycle_id", "expense_date"]),
      );
      expect(getTableColumns(db, "cierres_operativos")).toEqual(
        expect.arrayContaining(["cycle_number", "opened_at"]),
      );
      expect(getTableColumns(db, "menu_categories")).toEqual(
        expect.arrayContaining(["nombre", "color"]),
      );
      expect(getTableColumns(db, "platos")).toEqual(
        expect.arrayContaining(["nombre", "precio"]),
      );
      expect(getTableColumns(db, "ecf_documents")).toContain("certificate_metadata_id");
      expect(getTableColumns(db, "fiscal_outbox")).toContain("ecf_document_id");

      // Finally assert complete structural integrity
      assertSchemaIntegrity(db);
    } finally {
      db.close();
    }
  });

  it("proves helper catches dangling foreign keys that PRAGMA foreign_key_check misses when tables have no rows", () => {
    const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    try {
      db.exec("PRAGMA foreign_keys = OFF;");
      db.exec(`
        CREATE TABLE consumos (
          id TEXT PRIMARY KEY,
          comanda_id TEXT REFERENCES "comandas__legacy_migration"(id)
        );
      `);
      db.exec("PRAGMA foreign_keys = ON;");

      // Verify that PRAGMA foreign_key_check misses it because there are no rows:
      const pragmaCheck = db.prepare("PRAGMA foreign_key_check").all();
      expect(pragmaCheck).toEqual([]);

      // But findDanglingForeignKeys detects the dangling structural reference:
      const dangling = findDanglingForeignKeys(db);
      expect(dangling).toEqual([
        {
          table: "consumos",
          column: "comanda_id",
          parent: "comandas__legacy_migration",
          parentColumn: "id",
          reason: "missing_table",
        },
      ]);

      // And findLeftoverMigrationArtifacts catches the reference in sql:
      const leftovers = findLeftoverMigrationArtifacts(db);
      expect(leftovers).toContain("consumos");
    } finally {
      db.close();
    }
  });

  it("safely migrates ecf_documents and fiscal_outbox from old status CHECKs to accept 'queued'", () => {
    const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    try {
      const tenantId = "tenant-mig-queued";
      const branchId = "branch-mig-queued";
      const invId = "inv-mig-queued";
      const docId = "doc-mig-queued";
      const outboxId = "job-mig-queued";

      // 1. Build database with OLD status CHECKs (without 'queued')
      db.exec(`
        CREATE TABLE tenant_identity (
          id TEXT PRIMARY KEY CHECK (id = '${tenantId}')
        ) STRICT;
        INSERT INTO tenant_identity (id) VALUES ('${tenantId}');

        CREATE TABLE tenants (
          id TEXT PRIMARY KEY REFERENCES tenant_identity(id)
        ) STRICT;
        INSERT INTO tenants (id) VALUES ('${tenantId}');

        CREATE TABLE sucursales (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          name TEXT NOT NULL
        ) STRICT;
        INSERT INTO sucursales (id, tenant_id, name) VALUES ('${branchId}', '${tenantId}', 'Main');

        CREATE TABLE facturas (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          fiscal_mode TEXT NOT NULL CHECK (fiscal_mode IN ('internal_receipt', 'ncf_legacy', 'dgii_ecf')),
          total REAL NOT NULL CHECK (total >= 0),
          local_status TEXT NOT NULL CHECK (local_status IN ('committed', 'annulled', 'draft'))
        ) STRICT;
        INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status)
        VALUES ('${invId}', '${tenantId}', '${branchId}', 'dgii_ecf', 1500, 'committed');

        CREATE TABLE ecf_documents (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          factura_id TEXT NOT NULL UNIQUE REFERENCES facturas(id),
          document_type TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending_offline', 'pending_configuration', 'pending_sync', 'pending_processing', 'signed')),
          certificate_metadata_id TEXT,
          created_at TEXT,
          updated_at TEXT,
          signed_xml TEXT,
          xml_hash TEXT,
          dgii_security_code TEXT,
          signed_at TEXT,
          signed_by_device TEXT
        ) STRICT;
        INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status, created_at, updated_at)
        VALUES ('${docId}', '${tenantId}', '${branchId}', '${invId}', 'E31', 'pending_offline', '2026-11-06T00:00:00Z', '2026-11-06T00:00:00Z');

        CREATE TABLE fiscal_outbox (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id),
          sucursal_id TEXT NOT NULL REFERENCES sucursales(id),
          factura_id TEXT NOT NULL REFERENCES facturas(id),
          ecf_document_id TEXT,
          operation TEXT,
          status TEXT NOT NULL CHECK (status IN ('pending', 'syncing', 'pending_sync', 'blocked_configuration')),
          attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at TEXT,
          idempotency_key TEXT,
          created_at TEXT,
          updated_at TEXT
        ) STRICT;
        INSERT INTO fiscal_outbox (id, tenant_id, sucursal_id, factura_id, ecf_document_id, operation, status, attempts, idempotency_key, created_at, updated_at)
        VALUES ('${outboxId}', '${tenantId}', '${branchId}', '${invId}', '${docId}', 'submit', 'pending_sync', 0, 'idem-key-1', '2026-11-06T00:00:00Z', '2026-11-06T00:00:00Z');
      `);

      // Verify old CHECK constraint rejects 'queued'
      expect(() => {
        db.prepare("UPDATE ecf_documents SET status = 'queued' WHERE id = ?").run(docId);
      }).toThrow();
      expect(() => {
        db.prepare("UPDATE fiscal_outbox SET status = 'queued' WHERE id = ?").run(outboxId);
      }).toThrow();

      // 2. Run schema initialization and evolution
      initializeTenantSchema(db, tenantId);

      // 3. Assert rows are preserved
      const factura = db.prepare("SELECT * FROM facturas WHERE id = ?").get(invId) as Record<string, unknown>;
      expect(factura).toBeDefined();
      expect(factura.fiscal_mode).toBe("dgii_ecf");
      expect(factura.total).toBe(1500);

      const ecfDoc = db.prepare("SELECT * FROM ecf_documents WHERE id = ?").get(docId) as Record<string, unknown>;
      expect(ecfDoc).toBeDefined();
      expect(ecfDoc.status).toBe("pending_offline");
      expect(ecfDoc.document_type).toBe("E31");
      expect(ecfDoc.factura_id).toBe(invId);

      const outbox = db.prepare("SELECT * FROM fiscal_outbox WHERE id = ?").get(outboxId) as Record<string, unknown>;
      expect(outbox).toBeDefined();
      expect(outbox.status).toBe("pending_sync");
      expect(outbox.ecf_document_id).toBe(docId);
      expect(outbox.factura_id).toBe(invId);

      // 4. Assert status 'queued' is now accepted
      db.prepare("UPDATE ecf_documents SET status = 'queued' WHERE id = ?").run(docId);
      expect((db.prepare("SELECT status FROM ecf_documents WHERE id = ?").get(docId) as { status: string }).status).toBe("queued");

      db.prepare("UPDATE fiscal_outbox SET status = 'queued' WHERE id = ?").run(outboxId);
      expect((db.prepare("SELECT status FROM fiscal_outbox WHERE id = ?").get(outboxId) as { status: string }).status).toBe("queued");

      // 5. Assert foreign keys and schema integrity
      expect(db.prepare("PRAGMA foreign_key_check;").all()).toEqual([]);
      expect(findDanglingForeignKeys(db)).toEqual([]);
      expect(findLeftoverMigrationArtifacts(db)).toEqual([]);
      assertSchemaIntegrity(db);

      // Verify no dangling references to __old_table__ or __legacy_migration
      const schemaRows = db.prepare("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL").all() as Array<{ name: string; sql: string }>;
      for (const r of schemaRows) {
        expect(r.name).not.toContain("__old_table__");
        expect(r.name).not.toContain("__legacy_migration");
        expect(r.sql).not.toContain("__old_table__");
        expect(r.sql).not.toContain("__legacy_migration");
      }
    } finally {
      db.close();
    }
  });

  it("verifies statically that any electron file using ALTER TABLE RENAME TO also sets legacy_alter_table = ON", () => {
    const electronDir = join(__dirname, "../electron");
    const violations: string[] = [];

    function checkDir(dir: string): void {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
          const content = readFileSync(fullPath, "utf-8");
          const hasRename = /ALTER\s+TABLE[\s\S]*?RENAME\s+TO/i.test(content);
          if (hasRename) {
            const hasLegacyAlter = /legacy_alter_table\s*=\s*ON/i.test(content);
            if (!hasLegacyAlter) {
              violations.push(fullPath);
            }
          }
        }
      }
    }

    checkDir(electronDir);
    expect(
      violations,
      `Files containing ALTER TABLE ... RENAME TO without setting PRAGMA legacy_alter_table = ON: ${violations.join(", ")}`,
    ).toEqual([]);
  });
});
