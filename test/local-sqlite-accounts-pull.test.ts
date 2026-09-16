import { afterEach, describe, expect, it } from "vitest";
import { TenantStore } from "../electron/persistence/tenantStore";
import {
  applyCloudReceivableRows,
  applyCloudPayableRows,
  applyCloudCxcPagoRows,
  applyCloudCxpPagoRows,
} from "../electron/persistence/cloudApply";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Accounts receivable/payable cloud→SQLite pull", () => {
  let tempDir: string | null = null;
  let store: TenantStore | null = null;
  const tenantId = "tenant-accounts";

  afterEach(() => {
    if (store) { store.close(); store = null; }
    if (tempDir) { rmSync(tempDir, { recursive: true, force: true }); tempDir = null; }
  });

  function setup(): TenantStore {
    tempDir = mkdtempSync(join(tmpdir(), "cyberbistro-accounts-"));
    store = TenantStore.open({ dataRoot: tempDir, tenantId });
    const db = store.getDatabase();
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-1", tenantId, "Main");
    return store;
  }

  it("maps cloud monto_pagado to local monto_pendiente and derives estado; listCuentasCobrar re-exposes monto_pagado", () => {
    const s = setup();
    const db = s.getDatabase();

    applyCloudReceivableRows(db, tenantId, [
      { id: "cxc-1", tenant_id: tenantId, sucursal_id: "branch-1", customer_id: "cust-9", monto_total: 2000, monto_pagado: 500, estado: "parcial" },
      { id: "cxc-2", tenant_id: tenantId, sucursal_id: "branch-1", customer_id: "cust-9", monto_total: 1000, monto_pagado: 1000, estado: "pagada" },
    ]);

    const raw = db.prepare("SELECT * FROM cuentas_cobrar WHERE id = 'cxc-1'").get() as Record<string, unknown>;
    expect(raw.monto_pendiente).toBe(1500);
    expect(raw.estado).toBe("parcial");
    // The missing customer was stubbed so the FK holds.
    expect(db.prepare("SELECT 1 FROM customers WHERE id = 'cust-9'").get()).toBeTruthy();

    const listed = s.listCuentasCobrar({ sucursalId: "branch-1" });
    const c1 = listed.find((r) => (r as Record<string, unknown>).id === "cxc-1") as Record<string, unknown>;
    expect(c1.monto_pagado).toBe(500);
    const c2 = listed.find((r) => (r as Record<string, unknown>).id === "cxc-2") as Record<string, unknown>;
    expect(c2.estado).toBe("pagado"); // stored masculine; the renderer helper maps it to feminine
  });

  it("applies a receivable payment only after its account exists (FK-safe) and feeds listCxcPagos", () => {
    const s = setup();
    const db = s.getDatabase();

    // Payment before its account: skipped, no FK violation.
    applyCloudCxcPagoRows(db, tenantId, [
      { id: "pago-1", tenant_id: tenantId, sucursal_id: "branch-1", cuenta_cobrar_id: "cxc-1", monto: 500, metodo_pago: "cash", fecha_pago: "2026-09-15T10:00:00Z" },
    ]);
    expect(s.listCxcPagos()).toHaveLength(0);

    // Now the account arrives, then the payment applies.
    applyCloudReceivableRows(db, tenantId, [
      { id: "cxc-1", tenant_id: tenantId, sucursal_id: "branch-1", customer_id: "cust-9", monto_total: 2000, monto_pagado: 500, estado: "parcial" },
    ]);
    applyCloudCxcPagoRows(db, tenantId, [
      { id: "pago-1", tenant_id: tenantId, sucursal_id: "branch-1", cuenta_cobrar_id: "cxc-1", monto: 500, metodo_pago: "cash", fecha_pago: "2026-09-15T10:00:00Z" },
    ]);
    const pagos = s.listCxcPagos({ sucursalId: "branch-1" });
    expect(pagos).toHaveLength(1);
    expect((pagos[0] as Record<string, unknown>).monto).toBe(500);
  });

  it("stubs a missing proveedor for a payable and applies its payment", () => {
    const s = setup();
    const db = s.getDatabase();

    applyCloudPayableRows(db, tenantId, [
      { id: "cxp-1", tenant_id: tenantId, sucursal_id: "branch-1", proveedor_id: "prov-7", monto_total: 800, monto_pagado: 300, estado: "parcial" },
    ]);
    expect(db.prepare("SELECT 1 FROM proveedores WHERE id = 'prov-7'").get()).toBeTruthy();
    expect((db.prepare("SELECT monto_pendiente FROM cuentas_pagar WHERE id='cxp-1'").get() as Record<string, unknown>).monto_pendiente).toBe(500);

    applyCloudCxpPagoRows(db, tenantId, [
      { id: "abono-1", tenant_id: tenantId, sucursal_id: "branch-1", cuenta_pagar_id: "cxp-1", monto: 300, metodo_pago: "cash", fecha_pago: "2026-09-15T11:00:00Z" },
    ]);
    expect(s.listCxpPagos()).toHaveLength(1);
  });
});
