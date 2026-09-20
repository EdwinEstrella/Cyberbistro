import { expect, test, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { TenantStore } from "../electron/persistence/tenantStore";

// Layer 1 (deterministic): Cuentas por Pagar writes land in local SQLite and
// enqueue pending `sync_outbox` rows (the "push" intent). A payables settlement
// is money leaving the drawer, so a payment carrying `expense` must ALSO write a
// `gastos` operational row atomically. No real backend or login required — the
// seeded tenant is activated through the IPC bridge, so this runs in CI. The
// real cloud round-trip is Layer 2 (in the `cloud` project).
test.describe("Cuentas por Pagar — SQLite write + outbox push (deterministic)", () => {
  let userDataDirectory: string;
  let app: ElectronApplication;
  let page: Page;
  const tenantId = "tenant-e2e-cxp";

  test.beforeEach(async () => {
    userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-cxp-e2e-"));
    const seed = TenantStore.open({ dataRoot: userDataDirectory, tenantId });
    seed.close();

    app = await electron.launch({ args: [".", `--user-data-dir=${userDataDirectory}`] });
    page = await app.firstWindow();
    await expect(page.getByLabel("Correo")).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => typeof window.electronAPI?.executePayablesCommand === "function"))
      .toBe(true);

    await page.evaluate((tid) => window.electronAPI!.activateTenant!(tid), tenantId);
  });

  test.afterEach(async () => {
    if (app) await app.close();
    if (userDataDirectory) await rm(userDataDirectory, { recursive: true, force: true });
  });

  const openDb = () => TenantStore.open({ dataRoot: userDataDirectory, tenantId });

  test("creates a payable, settles it with payments that atomically write expenses, and queues every write in the outbox", async () => {
    const supplierId = randomUUID();
    const payableId = randomUUID();

    // CREATE
    const createRes = await page.evaluate(
      ({ id, sid }) =>
        window.electronAPI!.executePayablesCommand!({
          type: "payables.create",
          id,
          supplierId: sid,
          totalAmount: 1000,
          observacion: "E2E CxP",
        }),
      { id: payableId, sid: supplierId }
    );
    expect(createRes.ok).toBe(true);

    {
      const store = openDb();
      const db = store.getDatabase();
      const cxp = db
        .prepare("SELECT monto_total, monto_pendiente, estado FROM cuentas_pagar WHERE id = ? AND tenant_id = ?")
        .get(payableId, tenantId) as any;
      expect(cxp).toBeTruthy();
      expect(cxp.monto_total).toBe(1000);
      expect(cxp.monto_pendiente).toBe(1000);
      expect(cxp.estado).toBe("pendiente");

      const outbox = db
        .prepare("SELECT operation, status FROM sync_outbox WHERE table_name = 'cuentas_pagar' AND row_id = ?")
        .get(payableId) as any;
      expect(outbox).toBeTruthy();
      expect(outbox.operation).toBe("upsert");
      expect(outbox.status).toBe("pending");
      store.close();
    }

    // PARTIAL PAYMENT (400) WITH atomic expense -> parcial, pendiente 600
    const payment1Id = randomUUID();
    const expense1Id = randomUUID();
    const categoryId = randomUUID();
    const pay1 = await page.evaluate(
      ({ paymentId, pid, expId, catId }) =>
        window.electronAPI!.executePayablesCommand!({
          type: "payables.payment.record",
          paymentId,
          payableId: pid,
          amount: 400,
          paymentMethod: "cash",
          expense: {
            id: expId,
            categoryId: catId,
            description: "Abono a proveedor E2E",
          },
        }),
      { paymentId: payment1Id, pid: payableId, expId: expense1Id, catId: categoryId }
    );
    expect(pay1.ok).toBe(true);

    {
      const store = openDb();
      const db = store.getDatabase();
      const cxp = db.prepare("SELECT monto_pendiente, estado FROM cuentas_pagar WHERE id = ?").get(payableId) as any;
      expect(cxp.monto_pendiente).toBe(600);
      expect(cxp.estado).toBe("parcial");

      const pago = db.prepare("SELECT monto FROM cxp_pagos WHERE id = ?").get(payment1Id) as any;
      expect(pago.monto).toBe(400);

      // The atomic operational expense
      const gasto = db
        .prepare("SELECT expense_type, payment_method, amount, local_status FROM gastos WHERE id = ?")
        .get(expense1Id) as any;
      expect(gasto).toBeTruthy();
      expect(gasto.expense_type).toBe("operational");
      expect(gasto.payment_method).toBe("cash");
      expect(gasto.amount).toBe(400);
      expect(gasto.local_status).toBe("pending_sync");

      // Both the payment and the expense must be queued for push
      const outboxPago = db
        .prepare("SELECT status FROM sync_outbox WHERE table_name = 'cxp_pagos' AND row_id = ?")
        .get(payment1Id) as any;
      expect(outboxPago.status).toBe("pending");
      const outboxGasto = db
        .prepare("SELECT status FROM sync_outbox WHERE table_name = 'gastos' AND row_id = ?")
        .get(expense1Id) as any;
      expect(outboxGasto.status).toBe("pending");
      store.close();
    }

    // FINAL PAYMENT (600, no expense) -> pagado, pendiente 0
    const payment2Id = randomUUID();
    const pay2 = await page.evaluate(
      ({ paymentId, pid }) =>
        window.electronAPI!.executePayablesCommand!({
          type: "payables.payment.record",
          paymentId,
          payableId: pid,
          amount: 600,
          paymentMethod: "transfer",
        }),
      { paymentId: payment2Id, pid: payableId }
    );
    expect(pay2.ok).toBe(true);

    {
      const store = openDb();
      const db = store.getDatabase();
      const cxp = db.prepare("SELECT monto_pendiente, estado FROM cuentas_pagar WHERE id = ?").get(payableId) as any;
      expect(cxp.monto_pendiente).toBe(0);
      expect(cxp.estado).toBe("pagado");
      store.close();
    }
  });

  test("rejects overpayment and payment against a missing payable without partial writes", async () => {
    const payableId = randomUUID();
    const supplierId = randomUUID();
    const createRes = await page.evaluate(
      ({ id, sid }) =>
        window.electronAPI!.executePayablesCommand!({
          type: "payables.create",
          id,
          supplierId: sid,
          totalAmount: 500,
        }),
      { id: payableId, sid: supplierId }
    );
    expect(createRes.ok).toBe(true);

    // Overpayment (600 > 500) with an expense must throw AND roll back the expense too
    const orphanExpenseId = randomUUID();
    await expect(
      page.evaluate(
        ({ pid, expId }) =>
          window.electronAPI!.executePayablesCommand!({
            type: "payables.payment.record",
            paymentId: "cxp-pay-over",
            payableId: pid,
            amount: 600,
            paymentMethod: "cash",
            expense: { id: expId, description: "should roll back" },
          }),
        { pid: payableId, expId: orphanExpenseId }
      )
    ).rejects.toThrow();

    // Payment against a non-existent payable must throw
    await expect(
      page.evaluate(() =>
        window.electronAPI!.executePayablesCommand!({
          type: "payables.payment.record",
          paymentId: "cxp-pay-missing",
          payableId: "does-not-exist",
          amount: 10,
          paymentMethod: "cash",
        })
      )
    ).rejects.toThrow();

    // Atomic rollback: no payment, no orphan expense, payable untouched.
    const store = openDb();
    const db = store.getDatabase();
    const pagos = db.prepare("SELECT COUNT(*) AS n FROM cxp_pagos WHERE cuenta_pagar_id = ?").get(payableId) as any;
    expect(pagos.n).toBe(0);
    const gasto = db.prepare("SELECT COUNT(*) AS n FROM gastos WHERE id = ?").get(orphanExpenseId) as any;
    expect(gasto.n).toBe(0);
    const cxp = db.prepare("SELECT monto_pendiente, estado FROM cuentas_pagar WHERE id = ?").get(payableId) as any;
    expect(cxp.monto_pendiente).toBe(500);
    expect(cxp.estado).toBe("pendiente");
    store.close();
  });
});
