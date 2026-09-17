import { afterEach, describe, expect, it } from "vitest";
import { TenantStore } from "../electron/persistence/tenantStore";
import { applyCloudFacturaRows } from "../electron/persistence/cloudApply";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Facturas cloud→SQLite pull", () => {
  let tempDir: string | null = null;
  let store: TenantStore | null = null;
  const tenantId = "tenant-facturas";

  afterEach(() => {
    if (store) {
      store.close();
      store = null;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  function setup(): TenantStore {
    tempDir = mkdtempSync(join(tmpdir(), "cyberbistro-facturas-test-"));
    store = TenantStore.open({ dataRoot: tempDir, tenantId });
    return store;
  }

  const cloudInvoice = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: "fac-1",
    tenant_id: tenantId,
    sucursal_id: "branch-1",
    fiscal_mode: "internal_receipt",
    numero_factura: 42,
    mesa_numero: 5,
    cliente_nombre: "Cliente Uno",
    metodo_pago: "cash",
    estado: "pagada",
    subtotal: 1000,
    itbis: 180,
    propina: 100,
    total: 1280,
    moneda: "DOP",
    items: [{ plato_id: 1, cantidad: 2, precio_unitario: 500, subtotal: 1000 }],
    ncf: "B0100000001",
    created_at: "2026-09-14T10:00:00.000Z",
    ...over,
  });

  it("lands cloud invoices in SQLite with the full shape and feeds analytics", () => {
    const s = setup();
    const db = s.getDatabase();

    applyCloudFacturaRows(db, tenantId, [cloudInvoice()]);

    const rows = s.listInvoices();
    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    expect(row.id).toBe("fac-1");
    expect(row.numero_factura).toBe(42);
    expect(row.estado).toBe("pagada");
    expect(row.subtotal).toBe(1000);
    expect(row.itbis).toBe(180);
    expect(row.total).toBe(1280);
    // items round-trips as a JSON string in SQLite.
    expect(JSON.parse(String(row.items))).toHaveLength(1);

    const analytics = s.readAnalyticsSummary("branch-1");
    expect(analytics.totalSales).toBe(1280);
  });

  it("is idempotent and updates on re-pull (no duplicates)", () => {
    const s = setup();
    const db = s.getDatabase();

    applyCloudFacturaRows(db, tenantId, [cloudInvoice()]);
    applyCloudFacturaRows(db, tenantId, [cloudInvoice({ total: 1500, estado: "cancelada" })]);

    const rows = s.listInvoices();
    expect(rows).toHaveLength(1);
    expect((rows[0] as Record<string, unknown>).total).toBe(1500);
    expect((rows[0] as Record<string, unknown>).estado).toBe("cancelada");
  });

  it("maps a null cloud sucursal onto the default branch and stores items as JSON", () => {
    const s = setup();
    const db = s.getDatabase();

    applyCloudFacturaRows(db, tenantId, [cloudInvoice({ id: "fac-2", sucursal_id: null })]);

    const row = s.listInvoices().find((r) => (r as Record<string, unknown>).id === "fac-2") as Record<string, unknown>;
    expect(row.sucursal_id).toBe("main-process-default");
    expect(typeof row.items).toBe("string");
  });

  it("saves a local invoice directly to SQLite and enqueues sync_outbox upsert", () => {
    const s = setup();
    s.saveInvoice(cloudInvoice({ id: "fac-local-1", numero_factura: 101 }));

    const rows = s.listInvoices();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("fac-local-1");
    expect(rows[0].numero_factura).toBe(101);

    const outbox = s.readLocalOutbox();
    const outboxRow = outbox.find((o) => o.rowId === "fac-local-1");
    expect(outboxRow).toBeDefined();
    expect(outboxRow?.tableName).toBe("facturas");
    expect(outboxRow?.operation).toBe("upsert");
    expect(outboxRow?.status).toBe("pending");
  });

  it("deletes a local invoice from SQLite and enqueues sync_outbox delete", () => {
    const s = setup();
    s.saveInvoice(cloudInvoice({ id: "fac-del-1" }));
    expect(s.listInvoices()).toHaveLength(1);

    s.deleteInvoiceAndTraces("fac-del-1");
    expect(s.listInvoices()).toHaveLength(0);

    const outbox = s.readLocalOutbox();
    const deleteOutboxRow = outbox.find((o) => o.rowId === "fac-del-1" && o.operation === "delete");
    expect(deleteOutboxRow).toBeDefined();
    expect(deleteOutboxRow?.tableName).toBe("facturas");
    expect(deleteOutboxRow?.status).toBe("pending");
  });
});
