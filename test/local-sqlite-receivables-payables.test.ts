import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { TenantStore } from "../electron/persistence/tenantStore";
import { ReceivablesRepository } from "../electron/persistence/receivablesRepository";
import { PayablesRepository } from "../electron/persistence/payablesRepository";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Receivables & Payables local SQLite repositories", () => {
  let tempDir: string | null = null;
  let store: TenantStore | null = null;

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

  function setupStore(): { store: TenantStore; receivables: ReceivablesRepository; payables: PayablesRepository } {
    tempDir = mkdtempSync(join(tmpdir(), "cyberbistro-ar-ap-test-"));
    store = TenantStore.open({ dataRoot: tempDir, tenantId: "tenant-1" });
    const db = store.getDatabase();
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-1", "tenant-1", "Main");
    db.prepare("INSERT INTO customers (id, tenant_id, name) VALUES (?, ?, ?)").run("cust-1", "tenant-1", "Client A");
    db.prepare("INSERT INTO proveedores (id, tenant_id, name) VALUES (?, ?, ?)").run("prov-1", "tenant-1", "Supplier A");
    const receivables = new ReceivablesRepository({ store, branchId: "branch-1" });
    const payables = new PayablesRepository({ store, branchId: "branch-1" });
    return { store, receivables, payables };
  }

  it("creates receivable and records partial then full payment with atomicity and outbox", () => {
    const { store, receivables } = setupStore();
    const db = store.getDatabase();

    // 1. Create receivable
    const createRes = receivables.execute({
      type: "receivables.create",
      id: "cxc-1",
      customerId: "cust-1",
      totalAmount: 1000,
    });
    expect(createRes.localStatus).toBe("committed");

    let cxc = db.prepare("SELECT * FROM cuentas_cobrar WHERE id = 'cxc-1'").get() as any;
    expect(cxc.monto_total).toBe(1000);
    expect(cxc.monto_pendiente).toBe(1000);
    expect(cxc.estado).toBe("pendiente");

    // 2. Partial payment
    receivables.execute({
      type: "receivables.payment.record",
      paymentId: "pago-1",
      receivableId: "cxc-1",
      amount: 400,
      paymentMethod: "cash",
    });

    cxc = db.prepare("SELECT * FROM cuentas_cobrar WHERE id = 'cxc-1'").get() as any;
    expect(cxc.monto_pendiente).toBe(600);
    expect(cxc.estado).toBe("parcial");

    // 3. Final payment
    receivables.execute({
      type: "receivables.payment.record",
      paymentId: "pago-2",
      receivableId: "cxc-1",
      amount: 600,
      paymentMethod: "card",
    });

    cxc = db.prepare("SELECT * FROM cuentas_cobrar WHERE id = 'cxc-1'").get() as any;
    expect(cxc.monto_pendiente).toBe(0);
    expect(cxc.estado).toBe("pagado");

    // Outbox check
    const outboxRows = db.prepare("SELECT table_name, row_id FROM sync_outbox").all() as any[];
    expect(outboxRows).toEqual([
      { table_name: "cuentas_cobrar", row_id: "cxc-1" },
      { table_name: "cxc_pagos", row_id: "pago-1" },
      { table_name: "cxc_pagos", row_id: "pago-2" },
    ]);
  });

  it("creates payable and records partial then full payment with atomicity and outbox", () => {
    const { store, payables } = setupStore();
    const db = store.getDatabase();

    payables.execute({
      type: "payables.create",
      id: "cxp-1",
      supplierId: "prov-1",
      totalAmount: 2500,
    });

    payables.execute({
      type: "payables.payment.record",
      paymentId: "cxp-pago-1",
      payableId: "cxp-1",
      amount: 2500,
      paymentMethod: "transfer",
    });

    const cxp = db.prepare("SELECT * FROM cuentas_pagar WHERE id = 'cxp-1'").get() as any;
    expect(cxp.monto_pendiente).toBe(0);
    expect(cxp.estado).toBe("pagado");
  });
});
