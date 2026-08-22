import { afterEach, describe, expect, it } from "vitest";
import { TenantStore } from "../electron/persistence/tenantStore";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("C8: Analytics, Reports & Final SQLite Parity Test", () => {
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

  function setupStore(): TenantStore {
    tempDir = mkdtempSync(join(tmpdir(), "cyberbistro-analytics-test-"));
    store = TenantStore.open({ dataRoot: tempDir, tenantId: "tenant-parity" });
    const db = store.getDatabase();
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-1", "tenant-parity", "Main");
    db.prepare("INSERT INTO customers (id, tenant_id, name) VALUES (?, ?, ?)").run("cust-1", "tenant-parity", "Customer 1");
    db.prepare("INSERT INTO proveedores (id, tenant_id, name) VALUES (?, ?, ?)").run("prov-1", "tenant-parity", "Supplier 1");
    return store;
  }

  it("computes accurate cross-module analytics directly from SQLite without IndexedDB", () => {
    const s = setupStore();
    const db = s.getDatabase();

    // 1. Invoices
    db.prepare("INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status) VALUES (?, ?, ?, ?, ?, ?)")
      .run("fac-1", "tenant-parity", "branch-1", "internal_receipt", 1250.50, "committed");
    db.prepare("INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status) VALUES (?, ?, ?, ?, ?, ?)")
      .run("fac-2", "tenant-parity", "branch-1", "ncf_legacy", 749.50, "committed");

    // 2. Expenses (Cash purchase expense & payroll expense)
    db.prepare("INSERT INTO compras (id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("comp-1", "tenant-parity", "branch-1", "prov-1", "cash", 500, "committed");
    db.prepare("INSERT INTO gastos (id, tenant_id, sucursal_id, compra_id, expense_type, payment_method, amount, local_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("gasto-1", "tenant-parity", "branch-1", "comp-1", "purchase", "cash", 500, "committed");

    // 3. Receivables & Payables
    db.prepare("INSERT INTO cuentas_cobrar (id, tenant_id, sucursal_id, customer_id, monto_total, monto_pendiente, estado) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("cxc-1", "tenant-parity", "branch-1", "cust-1", 2000, 1500, "parcial");
    db.prepare("INSERT INTO cuentas_pagar (id, tenant_id, sucursal_id, proveedor_id, monto_total, monto_pendiente, estado) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("cxp-1", "tenant-parity", "branch-1", "prov-1", 1000, 800, "parcial");

    // 4. Payroll employees
    db.prepare("INSERT INTO payroll_employees (id, tenant_id, sucursal_id, first_name, last_name, role, base_salary_cents, frequency, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("emp-1", "tenant-parity", "branch-1", "Carlos", "Perez", "Chef", 3000000, "monthly", 1);

    // 5. Open Orders
    db.prepare("INSERT INTO mesas_estado (id, tenant_id, sucursal_id, table_number, state) VALUES (?, ?, ?, ?, ?)")
      .run("mesa-1", "tenant-parity", "branch-1", 1, "occupied");
    db.prepare("INSERT INTO comandas (id, tenant_id, sucursal_id, mesa_id, mesa_numero, state) VALUES (?, ?, ?, ?, ?, ?)")
      .run("comanda-1", "tenant-parity", "branch-1", "mesa-1", 1, "preparing");

    const analytics = s.readAnalyticsSummary("branch-1");

    expect(analytics.totalSales).toBe(2000.00);
    expect(analytics.totalExpenses).toBe(500.00);
    expect(analytics.openOrdersCount).toBe(1);
    expect(analytics.totalReceivables).toBe(1500.00);
    expect(analytics.totalPayables).toBe(800.00);
    expect(analytics.activePayrollEmployees).toBe(1);
  });
});
