import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { initializeTenantSchema } from "../electron/persistence/schema";

function fiscalDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  initializeTenantSchema(database, "tenant-a");
  database.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-a", "tenant-a", "Main");
  return database;
}

describe("local fiscal SQLite schema", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.close()));

  it("creates strict fiscal tables with tenant and branch foreign keys", () => {
    const database = fiscalDatabase();
    databases.push(database);

    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('facturas', 'ecf_documents', 'fiscal_outbox', 'ecf_sequence_allocations') ORDER BY name").all())
      .toEqual([{ name: "ecf_documents" }, { name: "ecf_sequence_allocations" }, { name: "facturas" }, { name: "fiscal_outbox" }]);
    expect(() => database.prepare("INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status) VALUES (?, ?, ?, ?, ?, ?)").run("invoice-foreign", "tenant-b", "branch-a", "internal_receipt", 10, "committed"))
      .toThrow();
    expect(() => database.prepare("INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status) VALUES (?, ?, ?, ?, ?, ?)").run("invoice-branch", "tenant-a", "missing-branch", "internal_receipt", 10, "committed"))
      .toThrow();
  });

  it("rejects invalid fiscal states and cannot represent local DGII acceptance", () => {
    const database = fiscalDatabase();
    databases.push(database);
    database.prepare("INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status) VALUES (?, ?, ?, ?, ?, ?)").run("invoice-1", "tenant-a", "branch-a", "dgii_ecf", 10, "committed");

    expect(() => database.prepare("INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status) VALUES (?, ?, ?, ?, ?, ?)").run("invoice-negative", "tenant-a", "branch-a", "dgii_ecf", -1, "committed")).toThrow();
    expect(() => database.prepare("INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status) VALUES (?, ?, ?, ?, ?, ?)").run("ecf-accepted", "tenant-a", "branch-a", "invoice-1", "31", "accepted")).toThrow();
    expect(() => database.prepare("INSERT INTO fiscal_outbox (id, tenant_id, sucursal_id, factura_id, status) VALUES (?, ?, ?, ?, ?)").run("outbox-accepted", "tenant-a", "branch-a", "invoice-1", "accepted")).toThrow();
  });

  it("enforces fiscal uniqueness and pending lookup indexes", () => {
    const database = fiscalDatabase();
    databases.push(database);
    database.prepare("INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status) VALUES (?, ?, ?, ?, ?, ?)").run("invoice-1", "tenant-a", "branch-a", "ncf_legacy", 10, "committed");
    database.prepare("INSERT INTO ecf_sequence_allocations (id, tenant_id, sucursal_id, document_type, sequence_number, status) VALUES (?, ?, ?, ?, ?, ?)").run("allocation-1", "tenant-a", "branch-a", "31", 1, "allocating");

    expect(() => database.prepare("INSERT INTO ecf_sequence_allocations (id, tenant_id, sucursal_id, document_type, sequence_number, status) VALUES (?, ?, ?, ?, ?, ?)").run("allocation-duplicate", "tenant-a", "branch-a", "31", 1, "reserved")).toThrow();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('idx_facturas_tenant_branch', 'idx_ecf_documents_pending', 'idx_fiscal_outbox_pending') ORDER BY name").all())
      .toEqual([{ name: "idx_ecf_documents_pending" }, { name: "idx_facturas_tenant_branch" }, { name: "idx_fiscal_outbox_pending" }]);
  });
});
