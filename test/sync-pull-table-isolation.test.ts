import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TenantStore } from "../electron/persistence/tenantStore";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import type { PullBatch } from "../electron/persistence/syncWorker";

const TENANT = "tenant-isolation";

describe("cloud pull - per-table isolation", () => {
  let tempDir: string | null = null;
  let tenantStore: TenantStore | null = null;

  afterEach(() => {
    tenantStore?.close();
    tenantStore = null;
    if (tempDir) {
      try { rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* Windows keeps SQLite handles briefly. */ }
      tempDir = null;
    }
  });

  function setup() {
    tempDir = mkdtempSync(join(tmpdir(), "cyberbistro-pull-isolation-"));
    tenantStore = TenantStore.open({ dataRoot: tempDir, tenantId: TENANT });
    const db = tenantStore.getDatabase();
    return { db, sync: new SQLitePayrollSyncStore(db, TENANT), tenantStore };
  }

  const customer = (id: string, name: string) => ({
    tableName: "customers", rowId: id, deleted: false,
    payload: { id, tenant_id: TENANT, name, updated_at: "2026-10-01T00:00:00Z" },
  });
  const factura = (ncf: string) => ({
    tableName: "facturas", rowId: "fac-1", deleted: false,
    payload: {
      id: "fac-1", tenant_id: TENANT, sucursal_id: "branch-1", fiscal_mode: "internal_receipt", numero_factura: 1,
      estado: "pagada", subtotal: 100, itbis: 18, propina: 0, total: 118, moneda: "DOP", items: [], ncf,
      created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z",
    },
  });
  const batch = (changes: PullBatch["changes"]): PullBatch => ({ cursor: "c", changes, snapshotTables: ["customers", "facturas"] });

  it("applies healthy tables, records the failing one, preserves its snapshot, and clears the error on recovery", () => {
    const { db, sync, tenantStore: ts } = setup();

    sync.applyPull(batch([customer("c1", "Uno"), customer("c2", "Dos"), factura("B0100000001")]));
    expect(db.prepare("SELECT ncf FROM facturas WHERE id='fac-1'").get()).toEqual({ ncf: "B0100000001" });
    const snapshotBefore = db.prepare("SELECT cursor FROM sync_state WHERE key=?").get(`${TENANT}:snapshot:customers`);
    expect(JSON.parse((snapshotBefore as { cursor: string }).cursor).sort()).toEqual(["c1", "c2"]);

    // Make every customers write fail, as a constraint violation on real data would.
    db.exec(`
      CREATE TRIGGER boom_ins BEFORE INSERT ON customers BEGIN SELECT RAISE(ABORT, 'boom customers'); END;
      CREATE TRIGGER boom_upd BEFORE UPDATE ON customers BEGIN SELECT RAISE(ABORT, 'boom customers'); END;
    `);

    // Snapshot omits c2: with a healthy table that would delete it.
    const changes = [customer("c1", "Uno editado"), customer("c3", "Tres"), factura("B0100000999")];
    expect(() => sync.applyPull(batch(changes))).not.toThrow();

    // The healthy table landed despite the failure.
    expect(db.prepare("SELECT ncf FROM facturas WHERE id='fac-1'").get()).toEqual({ ncf: "B0100000999" });
    // The failing table is untouched: no new rows, no edit, no false delete.
    expect(db.prepare("SELECT id, name FROM customers ORDER BY id").all()).toEqual([
      { id: "c1", name: "Uno" },
      { id: "c2", name: "Dos" },
    ]);
    const snapshotAfter = db.prepare("SELECT cursor FROM sync_state WHERE key=?").get(`${TENANT}:snapshot:customers`) as { cursor: string };
    expect(JSON.parse(snapshotAfter.cursor).sort()).toEqual(["c1", "c2"]);
    // The global pull row reflects that the pull ran.
    expect(db.prepare("SELECT 1 FROM sync_state WHERE key=?").get(`${TENANT}:pull`)).toBeTruthy();

    const report = ts.getSyncDiagnosticReport();
    const customersState = report.pullState.perTable.find((t) => t.table === "customers");
    expect(customersState?.lastError).toMatchObject({ message: expect.stringContaining("boom customers"), rowId: "c1" });
    expect(report.pullState.perTable.find((t) => t.table === "facturas")?.lastError).toBeNull();
    expect(report.pullState.global).not.toBeNull();

    // Recovery: the same batch applies and the error disappears.
    db.exec("DROP TRIGGER boom_ins; DROP TRIGGER boom_upd;");
    sync.applyPull(batch(changes));
    expect(db.prepare("SELECT id, name FROM customers ORDER BY id").all()).toEqual([
      { id: "c1", name: "Uno editado" },
      { id: "c3", name: "Tres" },
    ]);
    const recovered = ts.getSyncDiagnosticReport();
    expect(recovered.pullState.perTable.every((t) => t.lastError === null)).toBe(true);
    expect(db.prepare("SELECT count(*) n FROM sync_pull_errors").get()).toEqual({ n: 0 });
  });
});
