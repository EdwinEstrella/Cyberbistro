import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { TenantStore } from "../electron/persistence/tenantStore";
import { ReceivablesRepository } from "../electron/persistence/receivablesRepository";
import { PayrollSyncClient, resolveRemoteBranchId } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker } from "../electron/persistence/syncWorker";
import { ExpenseRepository } from "../electron/persistence/expenseRepository";
import { applyCloudCompraRows } from "../electron/persistence/cloudApply";

const TENANT = "tenant-branch-sentinel";
const SENTINEL = "main-process-default";
const REAL_BRANCH = "bbd7297a-8f29-4b43-b813-3920fc7be932";

function op(branchId: string | null) {
  return { branchId } as any;
}

describe("resolveRemoteBranchId", () => {
  it("prefers the payload's real sucursal over the main-process sentinel", () => {
    expect(resolveRemoteBranchId(op(SENTINEL), { sucursalId: REAL_BRANCH })).toBe(REAL_BRANCH);
    expect(resolveRemoteBranchId(op(SENTINEL), { sucursal_id: REAL_BRANCH })).toBe(REAL_BRANCH);
  });

  it("never returns the sentinel — falls back to null", () => {
    expect(resolveRemoteBranchId(op(SENTINEL), {})).toBeNull();
    expect(resolveRemoteBranchId(op(SENTINEL), { sucursalId: SENTINEL })).toBeNull();
    expect(resolveRemoteBranchId(op(null), { sucursalId: "  " })).toBeNull();
  });

  it("uses the operation branch when it is a real id and the payload has none", () => {
    expect(resolveRemoteBranchId(op(REAL_BRANCH), {})).toBe(REAL_BRANCH);
  });
});

describe("cxc payment push with the main-process branch sentinel", () => {
  let db: DatabaseSync;
  let store: TenantStore;
  let repo: ReceivablesRepository;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    const instance = Object.create(TenantStore.prototype);
    (instance as any).database = db;
    (instance as any).databasePath = ":memory:";
    (instance as any).tenantId = TENANT;
    store = instance as TenantStore;
    // Same wiring as electron/main.ts.
    repo = new ReceivablesRepository({ store, branchId: SENTINEL });
  });

  afterEach(() => {
    db.close();
  });

  async function pushAndCapture(): Promise<Record<string, any[]>> {
    const upserts: Record<string, any[]> = {};
    const cloudClient = {
      from: vi.fn((table: string) => ({
        upsert: vi.fn((payload: any) => {
          (upserts[table] ??= []).push(...(Array.isArray(payload) ? payload : [payload]));
          return { error: null };
        }),
        delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      })),
    };
    const worker = new DurableSyncWorker(new SQLitePayrollSyncStore(db, TENANT), new PayrollSyncClient(cloudClient as any), TENANT);
    const { conflicted } = await worker.push();
    expect(conflicted).toBe(0);
    return upserts;
  }

  it("sends the renderer's real sucursal, never the sentinel", async () => {
    repo.execute({ type: "receivables.create", id: "cxc-1", customerId: "cust-1", totalAmount: 545, sucursalId: REAL_BRANCH });
    repo.execute({
      type: "receivables.payment.record",
      paymentId: "pago-1",
      receivableId: "cxc-1",
      amount: 545,
      paymentMethod: "efectivo",
      sucursalId: REAL_BRANCH,
    });

    const upserts = await pushAndCapture();
    expect(upserts.cuentas_cobrar?.[0]?.sucursal_id).toBe(REAL_BRANCH);
    expect(upserts.cxc_pagos?.[0]?.sucursal_id).toBe(REAL_BRANCH);
  });

  it("sends null (valid for the nullable uuid column) when no real sucursal is known", async () => {
    repo.execute({ type: "receivables.create", id: "cxc-2", customerId: "cust-1", totalAmount: 450 });
    repo.execute({ type: "receivables.payment.record", paymentId: "pago-2", receivableId: "cxc-2", amount: 450, paymentMethod: "efectivo" });

    const upserts = await pushAndCapture();
    expect(upserts.cxc_pagos?.[0]?.sucursal_id).toBeNull();
    expect(JSON.stringify(upserts)).not.toContain(SENTINEL);
  });

  it("never sends the sentinel as sucursal_id for a general expense", async () => {
    const expenses = new ExpenseRepository({ store, branchId: SENTINEL });
    expenses.execute({
      type: "expense.create",
      id: "gasto-1",
      branchId: SENTINEL,
      description: "Gas",
      amount: 100,
      paymentMethod: "cash",
    } as any);

    const upserts = await pushAndCapture();
    expect(upserts.gastos?.[0]?.sucursal_id).toBeNull();
    expect(JSON.stringify(upserts)).not.toContain(SENTINEL);
  });
});

describe("cloud compra pull over a local compra with the sentinel branch", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    db.prepare("INSERT OR IGNORE INTO tenants (id) VALUES (?)").run(TENANT);
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, 'Principal')").run(SENTINEL, TENANT);
    db.prepare("INSERT INTO proveedores (id, tenant_id, name) VALUES ('prov-1', ?, 'Proveedor')").run(TENANT);
    db.prepare(
      "INSERT INTO compras (id, tenant_id, sucursal_id, proveedor_id, payment_method, total, local_status) VALUES ('compra-1', ?, ?, 'prov-1', 'cash', 50, 'committed')"
    ).run(TENANT, SENTINEL);
    db.prepare(
      "INSERT INTO gastos (id, tenant_id, sucursal_id, compra_id, expense_type, payment_method, amount, local_status) VALUES ('gasto-c1', ?, ?, 'compra-1', 'purchase', 'cash', 50, 'committed')"
    ).run(TENANT, SENTINEL);
  });

  afterEach(() => {
    db.close();
  });

  it("applies the cloud row without re-homing the compra away from its child rows", () => {
    expect(() =>
      applyCloudCompraRows(db, TENANT, [{ id: "compra-1", sucursal_id: REAL_BRANCH, proveedor_id: "prov-1", total: 75 }])
    ).not.toThrow();
    const row = db.prepare("SELECT sucursal_id, total FROM compras WHERE id = 'compra-1'").get() as any;
    expect(row.sucursal_id).toBe(SENTINEL);
    expect(row.total).toBe(75);
  });
});
