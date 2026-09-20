import { expect, test, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { TenantStore } from "../electron/persistence/tenantStore";

// Layer 1 (deterministic): verifies that Cuentas por Cobrar writes land in the
// local SQLite tables AND enqueue a pending row in `sync_outbox` (which is the
// "push" intent the sync engine later uploads). No real backend or login is
// required — the seeded tenant is activated directly through the IPC bridge, so
// this spec runs offline and in CI. The real cloud round-trip is Layer 2 and
// lives in the `cloud` Playwright project.
test.describe("Cuentas por Cobrar — SQLite write + outbox push (deterministic)", () => {
  let userDataDirectory: string;
  let app: ElectronApplication;
  let page: Page;
  const tenantId = "tenant-e2e-cxc";

  test.beforeEach(async () => {
    userDataDirectory = await mkdtemp(join(tmpdir(), "cloudix-cxc-e2e-"));
    // Create the tenant SQLite database (and its schema) so activateTenant can
    // open an existing store.
    const seed = TenantStore.open({ dataRoot: userDataDirectory, tenantId });
    seed.close();

    app = await electron.launch({ args: [".", `--user-data-dir=${userDataDirectory}`] });
    page = await app.firstWindow();
    await expect(page.getByLabel("Correo")).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => typeof window.electronAPI?.executeReceivablesCommand === "function"))
      .toBe(true);

    // Receivables commands run against the ACTIVE tenant store. Activate the
    // seeded tenant directly (no login) to keep the test deterministic/offline.
    await page.evaluate((tid) => window.electronAPI!.activateTenant!(tid), tenantId);
  });

  test.afterEach(async () => {
    if (app) await app.close();
    if (userDataDirectory) await rm(userDataDirectory, { recursive: true, force: true });
  });

  const openDb = () => TenantStore.open({ dataRoot: userDataDirectory, tenantId });

  test("creates a receivable, records a partial then final payment, and queues every write in the outbox", async () => {
    const customerId = randomUUID();
    const receivableId = randomUUID();

    // CREATE
    const createRes = await page.evaluate(
      ({ id, cid }) =>
        window.electronAPI!.executeReceivablesCommand!({
          type: "receivables.create",
          id,
          customerId: cid,
          totalAmount: 1000,
          observacion: "E2E CxC",
        }),
      { id: receivableId, cid: customerId }
    );
    expect(createRes.ok).toBe(true);

    // Verify SQLite row + outbox push queued
    {
      const store = openDb();
      const db = store.getDatabase();
      const cxc = db
        .prepare("SELECT monto_total, monto_pendiente, estado FROM cuentas_cobrar WHERE id = ? AND tenant_id = ?")
        .get(receivableId, tenantId) as any;
      expect(cxc).toBeTruthy();
      expect(cxc.monto_total).toBe(1000);
      expect(cxc.monto_pendiente).toBe(1000);
      expect(cxc.estado).toBe("pendiente");

      const outbox = db
        .prepare("SELECT operation, status FROM sync_outbox WHERE table_name = 'cuentas_cobrar' AND row_id = ?")
        .get(receivableId) as any;
      expect(outbox).toBeTruthy();
      expect(outbox.operation).toBe("upsert");
      expect(outbox.status).toBe("pending"); // <-- push queued
      store.close();
    }

    // PARTIAL PAYMENT (400 of 1000) -> estado parcial, pendiente 600
    const payment1Id = randomUUID();
    const pay1 = await page.evaluate(
      ({ paymentId, rid }) =>
        window.electronAPI!.executeReceivablesCommand!({
          type: "receivables.payment.record",
          paymentId,
          receivableId: rid,
          amount: 400,
          paymentMethod: "cash",
        }),
      { paymentId: payment1Id, rid: receivableId }
    );
    expect(pay1.ok).toBe(true);

    {
      const store = openDb();
      const db = store.getDatabase();
      const cxc = db.prepare("SELECT monto_pendiente, estado FROM cuentas_cobrar WHERE id = ?").get(receivableId) as any;
      expect(cxc.monto_pendiente).toBe(600);
      expect(cxc.estado).toBe("parcial");

      const pago = db.prepare("SELECT monto FROM cxc_pagos WHERE id = ?").get(payment1Id) as any;
      expect(pago.monto).toBe(400);

      const outbox = db
        .prepare("SELECT status FROM sync_outbox WHERE table_name = 'cxc_pagos' AND row_id = ?")
        .get(payment1Id) as any;
      expect(outbox.status).toBe("pending");
      store.close();
    }

    // FINAL PAYMENT (remaining 600) -> estado pagado, pendiente 0
    const payment2Id = randomUUID();
    const pay2 = await page.evaluate(
      ({ paymentId, rid }) =>
        window.electronAPI!.executeReceivablesCommand!({
          type: "receivables.payment.record",
          paymentId,
          receivableId: rid,
          amount: 600,
          paymentMethod: "card",
        }),
      { paymentId: payment2Id, rid: receivableId }
    );
    expect(pay2.ok).toBe(true);

    {
      const store = openDb();
      const db = store.getDatabase();
      const cxc = db.prepare("SELECT monto_pendiente, estado FROM cuentas_cobrar WHERE id = ?").get(receivableId) as any;
      expect(cxc.monto_pendiente).toBe(0);
      expect(cxc.estado).toBe("pagado");
      store.close();
    }
  });

  test("rejects overpayment and payment against a missing receivable without partial writes", async () => {
    const receivableId = randomUUID();
    const customerId = randomUUID();
    const createRes = await page.evaluate(
      ({ id, cid }) =>
        window.electronAPI!.executeReceivablesCommand!({
          type: "receivables.create",
          id,
          customerId: cid,
          totalAmount: 500,
        }),
      { id: receivableId, cid: customerId }
    );
    expect(createRes.ok).toBe(true);

    // Overpayment (600 > 500 pending) must throw
    await expect(
      page.evaluate(
        ({ rid }) =>
          window.electronAPI!.executeReceivablesCommand!({
            type: "receivables.payment.record",
            paymentId: "cxc-pay-over",
            receivableId: rid,
            amount: 600,
            paymentMethod: "cash",
          }),
        { rid: receivableId }
      )
    ).rejects.toThrow();

    // Payment against a non-existent receivable must throw
    await expect(
      page.evaluate(() =>
        window.electronAPI!.executeReceivablesCommand!({
          type: "receivables.payment.record",
          paymentId: "cxc-pay-missing",
          receivableId: "does-not-exist",
          amount: 10,
          paymentMethod: "cash",
        })
      )
    ).rejects.toThrow();

    // The failed payments must have rolled back atomically: no cxc_pagos rows and
    // the receivable is untouched.
    const store = openDb();
    const db = store.getDatabase();
    const count = db.prepare("SELECT COUNT(*) AS n FROM cxc_pagos WHERE cuenta_cobrar_id = ?").get(receivableId) as any;
    expect(count.n).toBe(0);
    const cxc = db.prepare("SELECT monto_pendiente, estado FROM cuentas_cobrar WHERE id = ?").get(receivableId) as any;
    expect(cxc.monto_pendiente).toBe(500);
    expect(cxc.estado).toBe("pendiente");
    store.close();
  });
});
