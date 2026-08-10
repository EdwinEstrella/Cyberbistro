import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { FiscalSequenceRepository } from "../electron/persistence/fiscalSequenceRepository";
import { initializeTenantSchema } from "../electron/persistence/schema";

function fiscalDatabase(tenantId = "tenant-a"): DatabaseSync {
  const database = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  initializeTenantSchema(database, tenantId);
  database.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-a", tenantId, "A");
  database.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-b", tenantId, "B");
  return database;
}

describe("local fiscal sequence allocation", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.close()));

  it("allocates monotonically within a tenant, branch, and document-type scope", () => {
    const database = fiscalDatabase();
    databases.push(database);
    const repository = new FiscalSequenceRepository({ database, tenantId: "tenant-a", branchId: "branch-a", createId: (() => { let id = 0; return () => `allocation-${++id}`; })() });

    expect(repository.allocate("31")).toMatchObject({ sequenceNumber: 1, status: "reserved" });
    expect(repository.allocate("31")).toMatchObject({ sequenceNumber: 2, status: "reserved" });
    expect(new FiscalSequenceRepository({ database, tenantId: "tenant-a", branchId: "branch-b", createId: () => "branch-b" }).allocate("31").sequenceNumber).toBe(1);
    expect(repository.allocate("32").sequenceNumber).toBe(1);
  });

  it("recovers only stale allocating leases by reserving them before advancing the sequence", () => {
    const database = fiscalDatabase();
    databases.push(database);
    database.prepare("INSERT INTO ecf_sequence_allocations (id, tenant_id, sucursal_id, document_type, sequence_number, status, allocated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("stale", "tenant-a", "branch-a", "31", 4, "allocating", "2026-08-09T10:00:00.000Z");
    database.prepare("INSERT INTO ecf_sequence_allocations (id, tenant_id, sucursal_id, document_type, sequence_number, status, allocated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("fresh", "tenant-a", "branch-a", "31", 7, "allocating", "2026-08-09T11:59:00.000Z");
    const repository = new FiscalSequenceRepository({ database, tenantId: "tenant-a", branchId: "branch-a", now: () => "2026-08-09T12:00:00.000Z", createId: () => "next" });

    expect(repository.allocate("31")).toMatchObject({ id: "next", sequenceNumber: 8, status: "reserved" });
    expect(database.prepare("SELECT id, status FROM ecf_sequence_allocations WHERE id = ?").get("stale")).toEqual({ id: "stale", status: "reserved" });
    expect(database.prepare("SELECT id, status FROM ecf_sequence_allocations WHERE id = ?").get("fresh")).toEqual({ id: "fresh", status: "allocating" });
  });
});
