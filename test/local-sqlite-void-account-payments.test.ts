import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { TenantStore } from "../electron/persistence/tenantStore";
import { ReceivablesRepository } from "../electron/persistence/receivablesRepository";
import { PayablesRepository } from "../electron/persistence/payablesRepository";

describe("voiding account payments in local SQLite", () => {
  let tempDir: string | null = null;
  let store: TenantStore | null = null;

  afterEach(() => {
    store?.close();
    store = null;
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  function setup() {
    tempDir = mkdtempSync(join(tmpdir(), "cyberbistro-void-pay-test-"));
    store = TenantStore.open({ dataRoot: tempDir, tenantId: "tenant-1" });
    const db = store.getDatabase();
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-1", "tenant-1", "Main");
    db.prepare("INSERT INTO customers (id, tenant_id, name) VALUES (?, ?, ?)").run("cust-1", "tenant-1", "Client A");
    db.prepare("INSERT INTO proveedores (id, tenant_id, name) VALUES (?, ?, ?)").run("prov-1", "tenant-1", "Supplier A");
    return {
      db,
      receivables: new ReceivablesRepository({ store, branchId: "branch-1" }),
      payables: new PayablesRepository({ store, branchId: "branch-1" }),
    };
  }

  const expense = (id: string, description = "Abono Cuenta Pagar - Ref ID: cxp-1") => ({ id, description, categoryId: null });

  function outbox(db: ReturnType<typeof setup>["db"], operation: string) {
    return db.prepare("SELECT table_name, row_id FROM sync_outbox WHERE operation = ? ORDER BY rowid").all(operation) as Array<{ table_name: string; row_id: string }>;
  }

  describe("receivables", () => {
    it("restores the balance and estado when a payment is voided, and queues a cloud delete", () => {
      const { db, receivables } = setup();
      receivables.execute({ type: "receivables.create", id: "cxc-1", customerId: "cust-1", totalAmount: 1000 });
      receivables.execute({ type: "receivables.payment.record", paymentId: "p1", receivableId: "cxc-1", amount: 400, paymentMethod: "cash" });
      receivables.execute({ type: "receivables.payment.record", paymentId: "p2", receivableId: "cxc-1", amount: 600, paymentMethod: "cash" });
      expect((db.prepare("SELECT estado FROM cuentas_cobrar WHERE id = 'cxc-1'").get() as any).estado).toBe("pagado");

      receivables.execute({ type: "receivables.payment.void", paymentId: "p2" });
      let cxc = db.prepare("SELECT monto_pendiente, estado FROM cuentas_cobrar WHERE id = 'cxc-1'").get() as any;
      expect(cxc).toEqual({ monto_pendiente: 600, estado: "parcial" });
      expect(db.prepare("SELECT id FROM cxc_pagos").all()).toEqual([{ id: "p1" }]);

      receivables.execute({ type: "receivables.payment.void", paymentId: "p1" });
      cxc = db.prepare("SELECT monto_pendiente, estado FROM cuentas_cobrar WHERE id = 'cxc-1'").get() as any;
      expect(cxc).toEqual({ monto_pendiente: 1000, estado: "pendiente" });

      expect(outbox(db, "delete")).toEqual([
        { table_name: "cxc_pagos", row_id: "p2" },
        { table_name: "cxc_pagos", row_id: "p1" },
      ]);
    });

    it("rejects an unknown payment and leaves the data untouched", () => {
      const { db, receivables } = setup();
      receivables.execute({ type: "receivables.create", id: "cxc-1", customerId: "cust-1", totalAmount: 500 });
      expect(() => receivables.execute({ type: "receivables.payment.void", paymentId: "missing" })).toThrow(/no existe/);
      expect(db.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE operation = 'delete'").get()).toEqual({ n: 0 });
    });
  });

  describe("payables", () => {
    function payableWithPayment(payables: PayablesRepository, paymentId = "pp1", amount = 400, extra: Record<string, unknown> = {}) {
      payables.execute({ type: "payables.create", id: "cxp-1", supplierId: "prov-1", totalAmount: 1000 });
      return payables.execute({
        type: "payables.payment.record", paymentId, payableId: "cxp-1", amount, paymentMethod: "cash",
        cycleId: "cycle-1", fechaPago: "2026-10-10T10:00:00.000Z", expense: expense(`exp-${paymentId}`), ...extra,
      });
    }

    it("restores balance and estado through partial and pending transitions", () => {
      const { db, payables } = setup();
      payableWithPayment(payables, "pp1", 400);
      payables.execute({ type: "payables.payment.record", paymentId: "pp2", payableId: "cxp-1", amount: 600, paymentMethod: "cash", cycleId: "cycle-1", expense: expense("exp-pp2") });
      expect((db.prepare("SELECT estado FROM cuentas_pagar WHERE id = 'cxp-1'").get() as any).estado).toBe("pagado");

      payables.execute({ type: "payables.payment.void", paymentId: "pp2" });
      expect(db.prepare("SELECT monto_pendiente, estado FROM cuentas_pagar WHERE id = 'cxp-1'").get()).toEqual({ monto_pendiente: 600, estado: "parcial" });

      payables.execute({ type: "payables.payment.void", paymentId: "pp1" });
      expect(db.prepare("SELECT monto_pendiente, estado FROM cuentas_pagar WHERE id = 'cxp-1'").get()).toEqual({ monto_pendiente: 1000, estado: "pendiente" });
    });

    it("removes the linked expense and queues deletes for the payment and the expense", () => {
      const { db, payables } = setup();
      payableWithPayment(payables);
      expect((db.prepare("SELECT cxp_pago_id FROM gastos WHERE id = 'exp-pp1'").get() as any).cxp_pago_id).toBe("pp1");

      const result = payables.execute({ type: "payables.payment.void", paymentId: "pp1" });
      expect(result.expenseRemoved).toBe(true);
      expect(db.prepare("SELECT COUNT(*) AS n FROM gastos").get()).toEqual({ n: 0 });
      expect(db.prepare("SELECT COUNT(*) AS n FROM cxp_pagos").get()).toEqual({ n: 0 });
      expect(outbox(db, "delete")).toEqual([
        { table_name: "cxp_pagos", row_id: "pp1" },
        { table_name: "gastos", row_id: "exp-pp1" },
      ]);
    });

    it("only removes the expense linked to the voided payment when amounts are equal", () => {
      const { db, payables } = setup();
      payableWithPayment(payables, "pp1", 100);
      payables.execute({ type: "payables.payment.record", paymentId: "pp2", payableId: "cxp-1", amount: 100, paymentMethod: "cash", cycleId: "cycle-1", expense: expense("exp-pp2") });
      payables.execute({ type: "payables.payment.void", paymentId: "pp2" });
      expect(db.prepare("SELECT id FROM gastos").all()).toEqual([{ id: "exp-pp1" }]);
    });

    it("matches the expense of a legacy payment by description, amount, cycle and closest date", () => {
      const { db, payables } = setup();
      payableWithPayment(payables, "pp1", 250);
      // Simulate pre-link data: drop the explicit link and add a decoy per mismatch.
      db.prepare("UPDATE gastos SET cxp_pago_id = NULL").run();
      const insertDecoy = db.prepare(`
        INSERT INTO gastos (id, tenant_id, sucursal_id, cycle_id, expense_type, payment_method, amount, description, expense_date)
        VALUES (?, 'tenant-1', 'branch-1', ?, 'operational', 'cash', ?, ?, ?)
      `);
      insertDecoy.run("far", "cycle-1", 250, "Abono Cuenta Pagar - Ref ID: cxp-1", "2026-09-01T10:00:00.000Z");
      insertDecoy.run("other-amount", "cycle-1", 251, "Abono Cuenta Pagar - Ref ID: cxp-1", "2026-10-10T10:00:00.000Z");
      insertDecoy.run("other-cycle", "cycle-2", 250, "Abono Cuenta Pagar - Ref ID: cxp-1", "2026-10-10T10:00:00.000Z");
      insertDecoy.run("other-account", "cycle-1", 250, "Abono Cuenta Pagar - Ref ID: zzzz", "2026-10-10T10:00:00.000Z");

      const result = payables.execute({ type: "payables.payment.void", paymentId: "pp1" });
      expect(result.expenseRemoved).toBe(true);
      const left = (db.prepare("SELECT id FROM gastos ORDER BY id").all() as Array<{ id: string }>).map((r) => r.id);
      expect(left).toEqual(["far", "other-account", "other-amount", "other-cycle"]);
      expect(outbox(db, "delete")).toContainEqual({ table_name: "gastos", row_id: "exp-pp1" });
    });

    it("never takes an expense already linked to another payment", () => {
      const { db, payables } = setup();
      payableWithPayment(payables, "pp1", 100);
      // pp2 has no expense of its own; the only look-alike belongs to pp1.
      payables.execute({ type: "payables.payment.record", paymentId: "pp2", payableId: "cxp-1", amount: 100, paymentMethod: "cash", cycleId: "cycle-1" });
      const result = payables.execute({ type: "payables.payment.void", paymentId: "pp2" });
      expect(result.expenseRemoved).toBe(false);
      expect(db.prepare("SELECT id FROM gastos").all()).toEqual([{ id: "exp-pp1" }]);
      expect(db.prepare("SELECT COUNT(*) AS n FROM cxp_pagos").get()).toEqual({ n: 1 });
    });

    it("clears the purchase fiscal payment date and pushes the fiscal row", () => {
      const { db, payables } = setup();
      db.prepare("INSERT INTO compras (id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status) VALUES ('c1', 'tenant-1', 'branch-1', 'prov-1', 'cash', 1000, 'committed')").run();
      db.prepare("INSERT INTO compra_fiscal (id, tenant_id, compra_id, ncf, fecha_pago) VALUES ('f1', 'tenant-1', 'c1', 'B0100000001', '2026-10-10')").run();
      payables.execute({ type: "payables.create", id: "cxp-1", supplierId: "prov-1", compraId: "c1", totalAmount: 1000 });
      payables.execute({ type: "payables.payment.record", paymentId: "pp1", payableId: "cxp-1", amount: 1000, paymentMethod: "cash", expense: expense("exp-pp1") });

      payables.execute({ type: "payables.payment.void", paymentId: "pp1" });
      expect((db.prepare("SELECT fecha_pago FROM compra_fiscal WHERE id = 'f1'").get() as any).fecha_pago).toBeNull();
      const pushed = db.prepare("SELECT payload_json FROM sync_outbox WHERE table_name = 'compra_fiscal' AND operation = 'upsert'").get() as { payload_json: string };
      expect(JSON.parse(pushed.payload_json)).toMatchObject({ id: "f1", compra_id: "c1", fecha_pago: null });
    });

    it("rejects an unknown payment without side effects", () => {
      const { db, payables } = setup();
      payableWithPayment(payables);
      expect(() => payables.execute({ type: "payables.payment.void", paymentId: "missing" })).toThrow(/no existe/);
      expect(db.prepare("SELECT monto_pendiente FROM cuentas_pagar WHERE id = 'cxp-1'").get()).toEqual({ monto_pendiente: 600 });
      expect(outbox(db, "delete")).toEqual([]);
    });

    it("adds the cxp_pago_id link column to databases created before it existed", () => {
      const { db } = setup();
      db.exec("DROP INDEX idx_gastos_cxp_pago; ALTER TABLE gastos DROP COLUMN cxp_pago_id;");
      expect((db.prepare("PRAGMA table_info(gastos)").all() as Array<{ name: string }>).map((c) => c.name)).not.toContain("cxp_pago_id");
      initializeTenantSchema(db, "tenant-1");
      expect((db.prepare("PRAGMA table_info(gastos)").all() as Array<{ name: string }>).map((c) => c.name)).toContain("cxp_pago_id");
    });
  });
});
