import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker, createDurableOperation, type ServerSyncClient } from "../electron/persistence/syncWorker";

describe("local sqlite payroll sync store", () => {
  let db: DatabaseSync;
  let store: SQLitePayrollSyncStore;
  const tenantId = "tenant-1";

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, tenantId);
    store = new SQLitePayrollSyncStore(db, tenantId);
  });

  it("adds error_json column during schema initialization", () => {
    const cols = db.prepare("PRAGMA table_info(sync_outbox)").all() as Array<{ name: string }>;
    expect(cols.map(c => c.name)).toContain("error_json");
  });

  it("returns no claims when there are zero matching payroll rows", () => {
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("outbox-1", tenantId, "branch-1", "compras", "compra-1", "upsert", JSON.stringify({}), "pending");

    expect(store.claim(Date.now())).toEqual([]);

    const row = db.prepare("SELECT status, error_json FROM sync_outbox WHERE id = 'outbox-1'").get() as any;
    expect(row.status).toBe("pending");
    expect(row.error_json).toBeNull();
  });

  it("claims only payroll rows and transitions them to syncing", () => {
    // Non-payroll
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("outbox-1", tenantId, "branch-1", "compras", "compra-1", "upsert", JSON.stringify({}), "pending");

    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("outbox-2", tenantId, "branch-1", "gastos", "gasto-1", "upsert", JSON.stringify({ expenseType: "purchase" }), "pending");

    // Payroll
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("outbox-3", tenantId, "branch-1", "payroll_employees", "emp-1", "upsert", JSON.stringify({ firstName: "Juan" }), "pending");

    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("outbox-4", tenantId, "branch-1", "gastos", "gasto-2", "upsert", JSON.stringify({ expenseType: "payroll" }), "pending");

    const claims = store.claim(Date.now());
    expect(claims).toHaveLength(2);
    expect(claims.map(c => c.id)).toEqual(["outbox-3", "outbox-4"]);
    expect(claims[0].status).toBe("syncing");

    // Check DB status
    const pendingNonPayroll = db.prepare("SELECT id FROM sync_outbox WHERE status = 'pending'").all() as any[];
    expect(pendingNonPayroll.map(r => r.id)).toEqual(["outbox-1", "outbox-2"]);

    const syncingPayroll = db.prepare("SELECT id FROM sync_outbox WHERE status = 'syncing'").all() as any[];
    expect(syncingPayroll.map(r => r.id)).toEqual(["outbox-3", "outbox-4"]);
  });

  it("claims gastos deletes of any expense type but never their purchase upserts", () => {
    // A purchase expense created via Compras (IndexedDB) must NOT be re-pushed as an upsert.
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("purchase-upsert", tenantId, "branch-1", "gastos", "gasto-1", "upsert", JSON.stringify({ expenseType: "purchase" }), "pending");

    // But deleting that same expense locally must propagate to the cloud through the outbox.
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("purchase-delete", tenantId, "branch-1", "gastos", "gasto-1", "delete", JSON.stringify({ id: "gasto-1", expenseType: "purchase" }), "pending");

    const claims = store.claim(Date.now());
    expect(claims.map(c => c.id)).toEqual(["purchase-delete"]);
    expect(claims[0].op).toBe("delete");

    const upsertRow = db.prepare("SELECT status, error_json FROM sync_outbox WHERE id = 'purchase-upsert'").get() as any;
    expect(upsertRow.status).toBe("pending");
    expect(upsertRow.error_json).toBeNull();
  });

  it("deletes rows on successful ack (synced)", () => {
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("outbox-1", tenantId, "branch-1", "payroll_payments", "pay-1", "upsert", JSON.stringify({}), "syncing");

    store.settle("outbox-1", "synced", { externalId: "ext-1" });

    const row = db.prepare("SELECT * FROM sync_outbox WHERE id = 'outbox-1'").get();
    expect(row).toBeUndefined();
  });

  it("preserves rows on not_retryable with permanent error metadata", () => {
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("outbox-1", tenantId, "branch-1", "payroll_payments", "pay-1", "upsert", JSON.stringify({}), "syncing");

    store.settle("outbox-1", "not_retryable", { reason: "invalid format" });

    const row = db.prepare("SELECT status, error_json FROM sync_outbox WHERE id = 'outbox-1'").get() as any;
    expect(row.status).toBe("pending");
    expect(JSON.parse(row.error_json)).toEqual({ reason: "invalid format", retryable: false });
    expect(store.claim(Date.now())).toEqual([]);
  });

  it("preserves error state and reverts to pending on failure/conflict", () => {
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("outbox-1", tenantId, "branch-1", "payroll_payments", "pay-1", "upsert", JSON.stringify({}), "syncing");

    store.settle("outbox-1", "conflicted", { reason: "timestamp mismatch" });

    const row = db.prepare("SELECT status, error_json FROM sync_outbox WHERE id = 'outbox-1'").get() as any;
    expect(row.status).toBe("pending");
    expect(JSON.parse(row.error_json)).toEqual({ reason: "timestamp mismatch" });

    // The next claim should pick it up again and include the error state in the result
    const claims = store.claim(Date.now());
    expect(claims).toHaveLength(1);
    expect(claims[0].id).toBe("outbox-1");
    expect(claims[0].result).toEqual({ reason: "timestamp mismatch" });
  });

  it("does not strand invalid payroll JSON rows during claim", () => {
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("outbox-invalid", tenantId, "branch-1", "payroll_payments", "pay-1", "upsert", "{bad json", "pending");

    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("outbox-valid", tenantId, "branch-1", "payroll_employees", "emp-1", "upsert", JSON.stringify({ firstName: "Juan" }), "pending");

    const claims = store.claim(Date.now());
    expect(claims.map((claim) => claim.id)).toEqual(["outbox-valid"]);

    const invalidRow = db.prepare("SELECT status, error_json FROM sync_outbox WHERE id = 'outbox-invalid'").get() as any;
    expect(invalidRow.status).toBe("pending");
    expect(JSON.parse(invalidRow.error_json)).toEqual({ reason: "Invalid payload_json", category: "invalid_json", retryable: false });
    expect(store.claim(Date.now())).toEqual([]);
  });

  it("never inspects or mutates non-payroll gastos rows during claim", () => {
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("gasto-purchase", tenantId, "branch-1", "gastos", "gasto-1", "upsert", JSON.stringify({ expenseType: "purchase", note: "office supplies" }), "pending");

    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("gasto-malformed", tenantId, "branch-1", "gastos", "gasto-2", "upsert", "{bad json", "pending");

    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("payroll-row", tenantId, "branch-1", "payroll_payments", "pay-1", "upsert", JSON.stringify({ amount: 1200 }), "pending");

    const claims = store.claim(Date.now());
    expect(claims.map((claim) => claim.id)).toEqual(["payroll-row"]);

    const untouchedGastos = db.prepare(`
      SELECT id, status, error_json
      FROM sync_outbox
      WHERE id IN ('gasto-purchase', 'gasto-malformed')
      ORDER BY id ASC
    `).all() as Array<{ id: string; status: string; error_json: string | null }>;

    expect(untouchedGastos).toEqual([
      { id: "gasto-malformed", status: "pending", error_json: null },
      { id: "gasto-purchase", status: "pending", error_json: null },
    ]);
  });

  it("returns a payroll row to pending with error_json when settle receives pending and allows reclaim", () => {
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("outbox-1", tenantId, "branch-1", "payroll_payments", "pay-1", "upsert", JSON.stringify({ amount: 1500 }), "syncing");

    store.settle("outbox-1", "pending", { reason: "Cloud push failed", code: "NETWORK" });

    const settledRow = db.prepare("SELECT status, error_json FROM sync_outbox WHERE id = 'outbox-1'").get() as any;
    expect(settledRow.status).toBe("pending");
    expect(JSON.parse(settledRow.error_json)).toEqual({ reason: "Cloud push failed", code: "NETWORK" });

    const claims = store.claim(Date.now());
    expect(claims).toHaveLength(1);
    expect(claims[0].id).toBe("outbox-1");
    expect(claims[0].result).toEqual({ reason: "Cloud push failed", code: "NETWORK" });
  });

  it("preserves permanently rejected payroll rows locally and stops reclaiming them", async () => {
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "outbox-employee",
      tenantId,
      "branch-1",
      "payroll_employees",
      "emp-1",
      "upsert",
      JSON.stringify({
        id: "emp-1",
        sucursalId: "branch-1",
        firstName: "Juan",
        lastName: "Weekly",
        role: "Caja",
        baseSalaryCents: 50000,
        frequency: "weekly",
        isActive: true,
      }),
      "pending",
    );

    const client: ServerSyncClient = {
      push: async () => ({ permanent: { reason: "Remote schema rejects weekly payroll frequency", category: "unsupported_payload", retryable: false } }),
      pull: async () => ({ cursor: "0", changes: [] }),
    };

    await new DurableSyncWorker(store, client, tenantId).push();

    const row = db.prepare("SELECT status, error_json FROM sync_outbox WHERE id = 'outbox-employee'").get() as any;
    expect(row.status).toBe("pending");
    expect(JSON.parse(row.error_json)).toEqual({
      reason: "Remote schema rejects weekly payroll frequency",
      category: "unsupported_payload",
      retryable: false,
    });
    expect(store.claim(Date.now())).toEqual([]);
  });

  it("throws when commitMutation is called", () => {
    expect(() => {
      store.commitMutation({} as any);
    }).toThrow("commitMutation not implemented for legacy sync_outbox bridge");
  });

  it("claims operational-cycle rows and reconciles them upon push", async () => {
    db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("cycle-close", tenantId, "branch-1", "cierres_operativos", "cycle-1", "upsert", JSON.stringify({ type: "orders.cycle.close", id: "cycle-1" }), "pending");

    const client: ServerSyncClient = {
      push: async () => ({ result: { synced: true, reconciled: true, audit: "remote_cycle_already_closed" } }),
      pull: async () => ({ cursor: "0", changes: [] }),
    };
    await new DurableSyncWorker(store, client, tenantId).push();

    const row = db.prepare("SELECT * FROM sync_outbox WHERE id = 'cycle-close'").get();
    expect(row).toBeUndefined();
  });

  describe("applyPull (cloud → SQLite, bidirectional)", () => {
    it("upserts pulled rows into their tables and advances the cursor atomically", () => {
      store.applyPull({
        cursor: "2026-09-15T10:00:00.000Z",
        changes: [
          { tableName: "gasto_categorias", rowId: "cat-1", deleted: false, payload: { nombre: "Servicios", activa: true, color: "#38bdf8" } },
          { tableName: "customers", rowId: "cust-1", deleted: false, payload: { name: "Ana", phone: "809" } },
          { tableName: "gastos", rowId: "exp-1", deleted: false, payload: { monto: 150, descripcion: "Luz", metodo_pago: "efectivo", fecha_gasto: "2026-09-14T00:00:00.000Z", category_id: "cat-1" } },
        ],
      });

      const cat = db.prepare("SELECT name, active FROM gasto_categorias WHERE id = 'cat-1'").get() as any;
      expect(cat).toMatchObject({ name: "Servicios", active: 1 });
      const cust = db.prepare("SELECT name FROM customers WHERE id = 'cust-1'").get() as any;
      expect(cust?.name).toBe("Ana");
      const exp = db.prepare("SELECT amount, description FROM gastos WHERE id = 'exp-1'").get() as any;
      expect(exp).toMatchObject({ amount: 150, description: "Luz" });

      expect(store.getCursor()).toBe("2026-09-15T10:00:00.000Z");
    });

    it("applies tombstones (deleted rows) from the cloud", () => {
      store.applyPull({ cursor: "c1", changes: [{ tableName: "customers", rowId: "cust-del", deleted: false, payload: { name: "Borrar" } }] });
      expect(db.prepare("SELECT 1 FROM customers WHERE id = 'cust-del'").get()).toBeDefined();

      store.applyPull({ cursor: "c2", changes: [{ tableName: "customers", rowId: "cust-del", deleted: true, payload: {} }] });
      expect(db.prepare("SELECT 1 FROM customers WHERE id = 'cust-del'").get()).toBeUndefined();
      expect(store.getCursor()).toBe("c2");
    });

    it("ignores changes for tables whose pull is not yet implemented", () => {
      store.applyPull({ cursor: "c3", changes: [{ tableName: "compras", rowId: "compra-1", deleted: false, payload: { total: 999 } }] });
      // Cursor still advances; unknown table is simply skipped without error.
      expect(store.getCursor()).toBe("c3");
    });

    it("starts with a null cursor before any pull", () => {
      expect(store.getCursor()).toBeNull();
    });
  });
});
