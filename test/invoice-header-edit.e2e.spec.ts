import { expect, test, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TenantStore } from "../electron/persistence/tenantStore";
import { mainWindow } from "./support/electronMainWindow";

/**
 * Invoice header edit through the real IPC surface (`facturas:update-header`).
 * Deterministic: seeds a tenant SQLite DB, drives window.electronAPI, then reopens
 * the store to assert the domain row and the sync_outbox entry.
 */

const TENANT_ID = "tenant-e2e-invoice-header";
const ITEMS = [{ nombre: "Pizza", cantidad: 2, precio_unitario: 50 }];

type Row = Record<string, unknown>;

// Same tree-kill teardown as the sales journey: a native print dialog (or stray
// Chromium children) can block a graceful app.close() on printerless runners.
async function closeApp(app: ElectronApplication): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), 10_000);
  });
  const closing = app.close().then(() => "closed" as const, () => "closed" as const);
  const result = await Promise.race([closing, timedOut]);
  clearTimeout(timer);
  if (result === "closed") return;

  const child = app.process();
  if (child.pid === undefined || child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => resolve());
    });
  } else {
    child.kill("SIGKILL");
  }
  await exited;
}

function seedInvoices(dataRoot: string): void {
  const store = TenantStore.open({ dataRoot, tenantId: TENANT_ID });
  try {
    const base = {
      tenant_id: TENANT_ID,
      sucursal_id: "branch-e2e",
      fiscal_mode: "ncf_legacy",
      metodo_pago: "efectivo",
      estado: "pagada",
      subtotal: 100,
      itbis: 18,
      propina: 0,
      total: 118,
      items: ITEMS,
      ncf_tipo: "B02 - Factura de registro unico de ingresos",
      cliente_nombre: "Cliente Uno",
      notas: null,
    };
    store.saveInvoice({ ...base, id: "inv-a", numero_factura: 1, ncf: "B0200000001" });
    store.saveInvoice({ ...base, id: "inv-b", numero_factura: 2, ncf: "B0200000002" });
  } finally {
    store.close();
  }
  withDatabase(dataRoot, (db) => db.prepare("DELETE FROM sync_outbox").run());
}

function withDatabase<T>(dataRoot: string, run: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(join(dataRoot, "tenant-stores", `${TENANT_ID}.sqlite`));
  try {
    return run(db);
  } finally {
    db.close();
  }
}

function readState(dataRoot: string): { facturas: Row[]; outbox: Row[] } {
  return withDatabase(dataRoot, (db) => ({
    facturas: db.prepare("SELECT * FROM facturas ORDER BY id").all() as Row[],
    outbox: db.prepare("SELECT * FROM sync_outbox WHERE table_name = 'facturas' ORDER BY rowid").all() as Row[],
  }));
}

async function launch(dataRoot: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: [".", `--user-data-dir=${dataRoot}`] });
  const page = await mainWindow(app);
  await expect(page.getByLabel("Correo")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => typeof window.electronAPI?.updateInvoiceHeaderLocal)).toBe("function");
  const activated = await page.evaluate((tid) => window.electronAPI!.activateTenant!(tid), TENANT_ID);
  expect(activated.ok).toBe(true);
  return { app, page };
}

test.describe("invoice header edit (IPC + SQLite)", () => {
  let dataRoot: string;

  test.beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), "cloudix-invoice-header-e2e-"));
    seedInvoices(dataRoot);
  });

  test.afterEach(async () => {
    // Windows may still hold the Electron profile files for a moment after the app exits.
    await rm(dataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  });

  test("edits the header, keeps items and total, and enqueues a partial outbox update", async () => {
    const { app, page } = await launch(dataRoot);
    try {
      const result = await page.evaluate((tid) =>
        window.electronAPI!.updateInvoiceHeaderLocal!({
          tenantId: tid,
          invoiceId: "inv-a",
          changes: {
            ncf: "B0100000099",
            cliente_nombre: "Empresa SRL",
            cliente_rnc: "131234567",
            notas: "Corregido",
          },
        }), TENANT_ID);
      expect(result).toEqual({ ok: true, changed: true });
    } finally {
      await closeApp(app);
    }

    const { facturas, outbox } = readState(dataRoot);
    const a = facturas.find((f) => f.id === "inv-a")!;
    expect(a).toMatchObject({
      ncf: "B0100000099",
      cliente_nombre: "Empresa SRL",
      cliente_rnc: "131234567",
      notas: "Corregido",
      total: 118,
    });
    expect(JSON.parse(String(a.items))).toEqual(ITEMS);

    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ row_id: "inv-a", operation: "update", status: "pending" });
    const payload = JSON.parse(String(outbox[0].payload_json)) as Row;
    expect(Object.keys(payload).sort()).toEqual(
      ["cliente_nombre", "cliente_rnc", "id", "ncf", "notas", "tenant_id", "updated_at"].sort(),
    );
    expect(payload).toMatchObject({ id: "inv-a", tenant_id: TENANT_ID, ncf: "B0100000099" });
  });

  test("rejects an NCF already used by another invoice and changes nothing", async () => {
    const { app, page } = await launch(dataRoot);
    try {
      const result = await page.evaluate((tid) =>
        window.electronAPI!.updateInvoiceHeaderLocal!({
          tenantId: tid,
          invoiceId: "inv-b",
          changes: { ncf: "B0200000001", cliente_nombre: "No debe aplicarse" },
        }), TENANT_ID);
      expect(result).toEqual({ ok: false, reason: "ncf_duplicate", numeroFactura: 1 });
    } finally {
      await closeApp(app);
    }

    const { facturas, outbox } = readState(dataRoot);
    const b = facturas.find((f) => f.id === "inv-b")!;
    expect(b).toMatchObject({ ncf: "B0200000002", cliente_nombre: "Cliente Uno" });
    expect(outbox).toHaveLength(0);
  });

  test("ignores forged non-header fields and rejects malformed requests", async () => {
    const { app, page } = await launch(dataRoot);
    try {
      // Only forged (non-whitelisted) fields: nothing is applied, nothing is queued.
      const forged = await page.evaluate((tid) =>
        window.electronAPI!.updateInvoiceHeaderLocal!({
          tenantId: tid,
          invoiceId: "inv-a",
          changes: { total: 1, items: [], estado: "anulada", tenant_id: "other-tenant" },
        }), TENANT_ID);
      expect(forged).toEqual({ ok: true, changed: false });

      // Forged fields mixed with a legitimate one: only the header field lands.
      const mixed = await page.evaluate((tid) =>
        window.electronAPI!.updateInvoiceHeaderLocal!({
          tenantId: tid,
          invoiceId: "inv-a",
          changes: { cliente_nombre: "Solo esto", total: 1, items: [] },
        }), TENANT_ID);
      expect(mixed).toEqual({ ok: true, changed: true });

      // Malformed requests are rejected by the IPC parser.
      await expect(page.evaluate((tid) =>
        window.electronAPI!.updateInvoiceHeaderLocal!({ tenantId: tid, invoiceId: "inv-a", changes: [] as never }),
        TENANT_ID)).rejects.toThrow(/Invalid invoice header update request/);
      await expect(page.evaluate((tid) =>
        window.electronAPI!.updateInvoiceHeaderLocal!({ tenantId: tid, invoiceId: "", changes: { notas: "x" } }),
        TENANT_ID)).rejects.toThrow(/Invalid invoice header update request/);
    } finally {
      await closeApp(app);
    }

    const { facturas, outbox } = readState(dataRoot);
    const a = facturas.find((f) => f.id === "inv-a")!;
    expect(a).toMatchObject({ cliente_nombre: "Solo esto", total: 118, estado: "pagada" });
    expect(JSON.parse(String(a.items))).toEqual(ITEMS);
    expect(outbox).toHaveLength(1);
    const payload = JSON.parse(String(outbox[0].payload_json)) as Row;
    expect(Object.keys(payload).sort()).toEqual(["cliente_nombre", "id", "tenant_id", "updated_at"].sort());
  });
});
