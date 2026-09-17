import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TenantStore } from "../electron/persistence/tenantStore";

describe("TenantStore invoice numbering", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("advances atomically from the highest synchronized invoice", () => {
    const root = mkdtempSync(join(tmpdir(), "cloudix-invoice-number-"));
    roots.push(root);
    const store = TenantStore.open({ dataRoot: root, tenantId: "tenant-a" });
    const db = store.getDatabase();
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-a", "tenant-a", "Main");
    db.prepare("INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status, numero_factura) VALUES (?, ?, ?, 'internal_receipt', 1, 'committed', ?)")
      .run("invoice-5755", "tenant-a", "branch-a", 5755);

    expect(store.reserveInvoiceNumbers(2)).toEqual([5756, 5757]);
    expect(store.reserveInvoiceNumbers(1)).toEqual([5758]);
    store.close();
  });

  it("deletes an invoice and its local fiscal traces", () => {
    const root = mkdtempSync(join(tmpdir(), "cloudix-invoice-delete-"));
    roots.push(root);
    const store = TenantStore.open({ dataRoot: root, tenantId: "tenant-a" });
    const db = store.getDatabase();
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-a", "tenant-a", "Main");
    db.prepare("INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status, numero_factura) VALUES (?, ?, ?, 'internal_receipt', 1, 'committed', 1)")
      .run("invoice-1", "tenant-a", "branch-a");
    db.prepare("INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status) VALUES ('ecf-1', 'tenant-a', 'branch-a', 'invoice-1', 'E32', 'pending_sync')").run();
    db.prepare("INSERT INTO fiscal_outbox (id, tenant_id, sucursal_id, factura_id, status) VALUES ('outbox-1', 'tenant-a', 'branch-a', 'invoice-1', 'pending')").run();

    store.deleteInvoiceAndTraces("invoice-1");

    expect(db.prepare("SELECT count(*) AS total FROM facturas").get()?.total).toBe(0);
    expect(db.prepare("SELECT count(*) AS total FROM ecf_documents").get()?.total).toBe(0);
    expect(db.prepare("SELECT count(*) AS total FROM fiscal_outbox").get()?.total).toBe(0);
    store.close();
  });
});
