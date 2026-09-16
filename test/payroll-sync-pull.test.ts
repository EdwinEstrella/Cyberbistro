import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import { DurableSyncWorker } from "../electron/persistence/syncWorker";
import { PayrollRepository } from "../electron/persistence/payrollRepository";
const TENANT = "tenant-1";
type Row = Record<string, any>;
function makeCloud(data: Record<string, Row[]>, cap = 500) {
  const queries: Array<{ table: string; column: string; value: string }> = [];
  const failures = new Set<string>();
  const client = { from(table: string) {
    let afterId = "", limit = cap, tenant: string | null = null;
    const builder: any = {
      select: () => builder,
      eq: (column: string, value: string) => { queries.push({ table, column, value }); tenant = value; return builder; },
      order: () => builder,
      limit: (value: number) => { limit = Math.min(cap, value); return builder; },
      gt: (column: string, value: string) => { expect(column).toBe("id"); afterId = value; return builder; },
      then: (resolve: (result: unknown) => void) => resolve({
        data: (data[table] ?? []).filter(row => row.id > afterId && (row.tenant_id ?? row.nomina_empleados?.tenant_id) === tenant)
          .sort((a, b) => a.id < b.id ? -1 : 1).slice(0, limit),
        error: failures.has(table) ? { message: "offline" } : null,
      }),
    };
    return builder;
  }};
  return { client: client as never, queries, failures };
}
function employee(overrides: Row = {}): Row {
  return { id: "emp-1", tenant_id: TENANT, sucursal_id: "branch-1", nombre_completo: "Ana Perez", cargo: "Caja",
    salario_base_mensual: 100000, frecuencia_pago: "mensual", activo: true, created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z", ...overrides };
}
function payment(overrides: Row = {}): Row {
  return { id: "pay-1", empleado_id: "emp-1", periodo: "2026-09", monto_base: 100000,
    total_bonos: 1000, total_descuentos: 500, monto_neto: 100500, monto_pagado: 60000,
    monto_pendiente: 40500, created_at: "2026-09-01T12:00:00Z", nomina_empleados: { tenant_id: TENANT, sucursal_id: "branch-1" }, ...overrides };
}
describe("bidirectional SQLite cloud imports", () => {
  let db: DatabaseSync, store: SQLitePayrollSyncStore;
  beforeEach(() => { db = new DatabaseSync(":memory:"); initializeTenantSchema(db, TENANT); store = new SQLitePayrollSyncStore(db, TENANT); });
  afterEach(() => db.close());
  const pull = async (cloud: ReturnType<typeof makeCloud>) => new DurableSyncWorker(store, new PayrollSyncClient(cloud.client), TENANT).pull();
  it("downloads all 1201 rows despite equal dates, an old cursor, and a server cap of 200", async () => {
    store.applyPull({ cursor: "2099-01-01", changes: [] });
    const cloud = makeCloud({ customers: Array.from({ length: 1201 }, (_, i) => ({ id: `cust-${String(i).padStart(5, "0")}`,
      tenant_id: TENANT, name: `Customer ${i}`, updated_at: "2026-01-01" })) }, 200);
    expect(await pull(cloud)).toBe(1201);
    expect(db.prepare("SELECT count(*) n FROM customers").get()).toEqual({ n: 1201 });
    expect(cloud.queries).toContainEqual({ table: "nomina_pagos", column: "nomina_empleados.tenant_id", value: TENANT });
    expect(await pull(cloud)).toBe(1201);
    expect(db.prepare("SELECT count(*) n FROM sync_outbox").get()).toEqual({ n: 0 });
  });
  it("imports payroll cents, expense links and adjustments without enqueueing, and counts remote payments in calculations", async () => {
    const cloud = makeCloud({ nomina_empleados: [employee()], nomina_pagos: [payment()],
      nomina_ajustes: [{ id: "adj-1", empleado_id: "emp-1", monto: 1000, tipo: "bono", frecuencia: "unico", motivo: "Propina", nomina_empleados: { tenant_id: TENANT } }],
      gastos: [{ id: "exp-1", tenant_id: TENANT, sucursal_id: "branch-1", monto: "600.00", payroll_payment_id: "pay-1" }] });
    expect(await pull(cloud)).toBe(4);
    const repo = new PayrollRepository(db);
    expect(repo.getEmployees(TENANT, "branch-1")[0]).toMatchObject({ firstName: "Ana", lastName: "Perez", baseSalaryCents: 100000 });
    expect(repo.getPayments(TENANT, "branch-1")[0]).toMatchObject({ id: "pay-1", amountPaidCents: 60000, pendingCents: 40500 });
    expect(repo.getPaymentContext(TENANT, "branch-1", { employeeId: "emp-1", period: "2026-09", frequency: "monthly", adjustments: [] })).toMatchObject({ alreadyPaidCents: 60000 });
    expect(db.prepare("SELECT amount, amount_cents, payroll_payment_id FROM gastos").get()).toEqual({ amount: 600, amount_cents: 60000, payroll_payment_id: "pay-1" });
    expect(JSON.parse((db.prepare("SELECT payload_json FROM payroll_cloud_adjustments").get() as any).payload_json)).toMatchObject({ motivo: "Propina" });
    expect(store.claim(Date.now())).toEqual([]);
  });
  it("protects pending local edits and deletes until the outbox is settled", async () => {
    const cloud = makeCloud({ nomina_empleados: [employee()], customers: [{ id: "cust-1", tenant_id: TENANT, name: "Ana" }] });
    await pull(cloud);
    new PayrollRepository(db).upsertEmployee(TENANT, "branch-1", { id: "emp-1", firstName: "Local", lastName: "Edit", role: "Caja", baseSalaryCents: 110000, frequency: "monthly", isActive: true });
    db.prepare("DELETE FROM customers WHERE id='cust-1'").run();
    db.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status) VALUES ('delete-1', ?, 'branch-1', 'customers', 'cust-1', 'delete', '{}', 'pending')").run(TENANT);
    await pull(cloud);
    expect(db.prepare("SELECT first_name FROM payroll_employees").get()).toEqual({ first_name: "Local" });
    expect(db.prepare("SELECT * FROM customers").all()).toEqual([]);
    for (const op of store.claim(Date.now())) store.settle(op.id, "synced", {});
    await pull(cloud);
    expect(db.prepare("SELECT first_name FROM payroll_employees").get()).toEqual({ first_name: "Ana" });
  });
  it("reconciles remote deletes and preserves never-downloaded legacy local rows", async () => {
    const data: Record<string, Row[]> = { nomina_empleados: [employee()], nomina_pagos: [payment()], customers: [{ id: "cust-1", tenant_id: TENANT, name: "Ana" }] };
    const cloud = makeCloud(data);
    await pull(cloud);
    db.prepare("INSERT INTO customers (id, tenant_id, name) VALUES ('legacy-local', ?, 'Local')").run(TENANT);
    data.nomina_pagos = []; data.nomina_empleados = []; data.customers = [];
    await pull(cloud);
    expect(db.prepare("SELECT * FROM payroll_payments").all()).toEqual([]);
    expect(db.prepare("SELECT * FROM payroll_employees").all()).toEqual([]);
    expect(db.prepare("SELECT id FROM customers").all()).toEqual([{ id: "legacy-local" }]);
  });
  it("does not apply partial HTTP snapshots on failure", async () => {
    const cloud = makeCloud({ nomina_empleados: [employee()] }); cloud.failures.add("gastos");
    await expect(pull(cloud)).rejects.toThrow("Pull failed for gastos");
    expect(store.getCursor()).toBeNull();
    expect(db.prepare("SELECT * FROM payroll_employees").all()).toEqual([]);
  });
  it("rolls back rows and cursor if payroll mapping fails", async () => {
    const cloud = makeCloud({ nomina_empleados: [employee()], nomina_pagos: [payment({ monto_pagado: -1 })] });
    await expect(pull(cloud)).rejects.toThrow("Invalid cloud payroll amount");
    expect(db.prepare("SELECT * FROM payroll_employees").all()).toEqual([]);
    expect(store.getCursor()).toBeNull();
  });
  it("isolates employee child rows by tenant", async () => {
    const cloud = makeCloud({ nomina_empleados: [employee()], nomina_pagos: [payment({ nomina_empleados: { tenant_id: "other" } })] });
    await pull(cloud);
    expect(db.prepare("SELECT * FROM payroll_payments").all()).toEqual([]);
  });
  it("preserves original local receipt snapshots and dates on a round trip", async () => {
    const cloud = makeCloud({ nomina_empleados: [employee()], nomina_pagos: [payment()] });
    await pull(cloud);
    db.prepare("UPDATE payroll_payments SET receipt_snapshot=?, created_at=? WHERE id='pay-1'").run('{"original":true}', "2026-08-31T12:00:00Z");
    await pull(cloud);
    expect(new PayrollRepository(db).getPayments(TENANT, "branch-1")[0]).toMatchObject({ receiptSnapshot: '{"original":true}', createdAt: "2026-08-31T12:00:00Z" });
  });
  it("does not clear permanent failures on store restart", () => {
    db.prepare("INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status, error_json) VALUES ('bad-1', ?, 'branch-1', 'payroll_employees', 'emp-1', 'upsert', '{}', 'pending', ?)").run(TENANT, JSON.stringify({ retryable: false, reason: "conflict" }));
    store = new SQLitePayrollSyncStore(db, TENANT);
    expect(store.claim(Date.now())).toEqual([]);
  });
});
