import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { PayrollRepository } from "../electron/persistence/payrollRepository";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { SQLitePayrollSyncStore } from "../electron/persistence/payrollSyncStore";
import type { DurableOperation } from "../electron/persistence/syncWorker";

describe("PayrollSyncClient", () => {
  let db: DatabaseSync;
  let repository: PayrollRepository;
  let store: SQLitePayrollSyncStore;
  let fakeSdk: ReturnType<typeof createFakeSdk>;
  let client: PayrollSyncClient;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, "tenant-1");
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-1", "tenant-1", "Main");
    repository = new PayrollRepository(db);
    store = new SQLitePayrollSyncStore(db, "tenant-1");
    fakeSdk = createFakeSdk();
    client = new PayrollSyncClient(fakeSdk.client as never);
  });

  it("maps repository employee outbox rows to nomina_empleados", async () => {
    repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "Ana",
      lastName: "Pérez",
      role: "Caja",
      baseSalaryCents: 100000,
      frequency: "monthly",
      isActive: true,
    });

    const [employeeOperation] = store.claim(Date.now());
    const response = await client.push(employeeOperation);

    expect(fakeSdk.from).toHaveBeenCalledWith("nomina_empleados");
    expect(fakeSdk.upsert).toHaveBeenCalledWith({
      id: employeeOperation.rowId,
      tenant_id: "tenant-1",
      sucursal_id: "branch-1",
      nombre_completo: "Ana Pérez",
      identificacion: employeeOperation.rowId,
      telefono: null,
      cargo: "Caja",
      salario_base_mensual: 100000,
      frecuencia_pago: "mensual",
      activo: true,
    }, { onConflict: "id" });
    expect(response.result).toMatchObject({ synced: true, remoteTable: "nomina_empleados" });
  });

  it("sends desktop payments through direct upsert on nomina_pagos", async () => {
    const employeeId = repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "Luis",
      lastName: "Martínez",
      role: "Cocina",
      baseSalaryCents: 100000,
      frequency: "monthly",
      isActive: true,
    });

    repository.createPayment("tenant-1", "branch-1", {
      employeeId,
      period: "2026-08",
      frequency: "monthly",
      paymentAmountCents: 70000,
      receiptSnapshot: "{}",
      adjustments: [{ kind: "discount", type: "uniforme", scope: "currentPayment", amountCents: 10000, note: "Reposición" }],
    });

    const operations = store.claim(Date.now()).filter((operation) => operation.tableName !== "payroll_employees");
    const adjustmentOperation = operations.find((operation) => operation.tableName === "payroll_payment_adjustments");
    const paymentOperation = operations.find((operation) => operation.tableName === "payroll_payments");
    const expenseOperation = operations.find((operation) => operation.tableName === "gastos");

    expect(adjustmentOperation).toBeTruthy();
    expect(paymentOperation).toBeTruthy();
    expect(expenseOperation).toBeTruthy();

    await client.push(adjustmentOperation as DurableOperation);
    await client.push(paymentOperation as DurableOperation);
    await client.push(expenseOperation as DurableOperation);

    expect(fakeSdk.upsert.mock.calls).toEqual([
      [
        {
          id: adjustmentOperation?.rowId,
          empleado_id: employeeId,
          tipo: "descuento",
          frecuencia: "unico",
          monto: 10000,
          motivo: "uniforme: Reposición",
        },
        { onConflict: "id" },
      ],
      [
        {
          id: paymentOperation?.rowId,
          empleado_id: employeeId,
          periodo: "2026-08",
          monto_base: 100000,
          total_bonos: 0,
          total_descuentos: 10000,
          monto_neto: 90000,
          monto_pagado: 70000,
          monto_pendiente: 20000,
          gasto_id: null,
          created_at: expect.any(String),
        },
        { onConflict: "id" },
      ],
      [
        {
          id: expenseOperation?.rowId,
          tenant_id: "tenant-1",
          descripcion: "Payroll payment 2026-08",
          sucursal_id: "branch-1",
          monto: 700,
          metodo_pago: "efectivo",
          fecha_gasto: expect.any(String),
          payroll_payment_id: paymentOperation?.rowId,
          payroll_sync_status: "pending_sync",
        },
        { onConflict: "id" },
      ],
    ]);
    expect(fakeSdk.from.mock.calls).toEqual([["nomina_ajustes"], ["nomina_pagos"], ["gastos"]]);
  });

  it("keeps payroll gastos payload aligned with the post-migration remote gastos schema", async () => {
    const employeeId = repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "Marta",
      lastName: "Lora",
      role: "Caja",
      baseSalaryCents: 80000,
      frequency: "monthly",
      isActive: true,
    });

    repository.createPayment("tenant-1", "branch-1", {
      employeeId,
      period: "2026-09",
      frequency: "monthly",
      paymentAmountCents: 80000,
      receiptSnapshot: "{}",
      adjustments: [],
    });

    const expenseOperation = store.claim(Date.now()).find((operation) => operation.tableName === "gastos");
    expect(expenseOperation).toBeTruthy();

    await client.push(expenseOperation as DurableOperation);

    const expensePayload = fakeSdk.upsert.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const remoteColumns = readPostMigrationGastosColumns();

    expect(remoteColumns).toEqual(expect.arrayContaining([
      "descripcion",
      "monto",
      "metodo_pago",
      "fecha_gasto",
      "payroll_payment_id",
      "payroll_sync_status",
    ]));
    expect(Object.keys(expensePayload).every((key) => remoteColumns.includes(key))).toBe(true);
  });

  it("keeps retryable network failures as thrown errors for worker retry handling", async () => {
    fakeSdk.nextUpsertError = { message: "Network error", code: "503" };

    repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "Ana",
      lastName: "Retry",
      role: "Caja",
      baseSalaryCents: 100000,
      frequency: "monthly",
      isActive: true,
    });

    const [employeeOperation] = store.claim(Date.now());

    await expect(client.push(employeeOperation)).rejects.toThrow("Upsert failed: Network error");
  });

  it("does not acknowledge a uniqueness conflict with another remote row", async () => {
    repository.upsertEmployee("tenant-1", "branch-1", { firstName: "Ana", lastName: "Conflict", role: "Caja",
      baseSalaryCents: 100000, frequency: "monthly", isActive: true });
    fakeSdk.nextUpsertError = { code: "23505", message: "duplicate key violates employee identity" };
    const [operation] = store.claim(Date.now());
    const response = await client.push(operation);
    expect(response.result).toBeUndefined();
    expect(response.conflict?.reason).toContain("duplicate key");
  });

  it("classifies unsupported local payloads and remote structural failures as permanent", async () => {
    repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "Wendy",
      lastName: "Weekly",
      role: "Caja",
      baseSalaryCents: 100000,
      frequency: "weekly",
      isActive: true,
    });

    const [weeklyOperation] = store.claim(Date.now());
    const unsupported = await client.push(weeklyOperation);
    expect(unsupported.permanent).toMatchObject({ category: "malformed_payload", retryable: false });

    fakeSdk.nextUpsertError = { message: "null value in column \"empleado_id\" violates not-null constraint", code: "23502" };
    repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "Ana",
      lastName: "Remote",
      role: "Caja",
      baseSalaryCents: 100000,
      frequency: "monthly",
      isActive: true,
    });

    const claimed = store.claim(Date.now());
    const monthlyOperation = claimed.find((operation) => operation.rowId !== weeklyOperation.rowId);
    const structural = await client.push(monthlyOperation as DurableOperation);

    expect(structural.permanent).toEqual({
      reason: "Remote upsert rejected for payroll_employees: null value in column \"empleado_id\" violates not-null constraint",
      category: "remote_structural_error",
      tableName: "payroll_employees",
      retryable: false,
      code: "23502",
    });
  });

  it("keeps authorization failures retryable so a refreshed renderer token can resume the outbox", async () => {
    const employeeId = repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "Ana",
      lastName: "Auth",
      role: "Caja",
      baseSalaryCents: 100000,
      frequency: "monthly",
      isActive: true,
    });
    repository.createPayment("tenant-1", "branch-1", {
      employeeId,
      period: "2026-08",
      frequency: "monthly",
      paymentAmountCents: 100000,
      receiptSnapshot: "{}",
      adjustments: [],
    });
    fakeSdk.nextUpsertError = { code: "42501", message: "Not authorized to register payroll payments" };

    const payment = store.claim(Date.now()).find((operation) => operation.tableName === "payroll_payments");
    await expect(client.push(payment as DurableOperation)).rejects.toThrow("Upsert failed: Not authorized");
  });

  it("creates the cloud cycle on open (SQLite is the single cloud creator)", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    const cycleClient = new PayrollSyncClient({ from } as never);
    const response = await cycleClient.push({
      id: "open-1", tenantId: "tenant-1", branchId: "branch-1", tableName: "cierres_operativos", rowId: "cycle-1", op: "upsert",
      payload: { type: "orders.cycle.open", id: "cycle-1", businessDay: "2026-09-15", openingCash: 1000, cycleNumber: 5, openedAt: "2026-09-15T10:00:00.000Z" },
      payloadHash: "hash", sequence: 0, deviceId: "device", status: "syncing", leaseUntil: 0, result: null,
    });
    expect(upsert).toHaveBeenCalledWith(
      { id: "cycle-1", tenant_id: "tenant-1", sucursal_id: "branch-1", business_day: "2026-09-15", cycle_number: 5, efectivo_inicial: 1000, opened_at: "2026-09-15T10:00:00.000Z", created_at: "2026-09-15T10:00:00.000Z", closed_at: null },
      { onConflict: "id" },
    );
    expect(response.result).toMatchObject({ synced: true, remoteTable: "cierres_operativos" });
  });

  it("updates closed_at on the existing cloud cycle on close (never a partial upsert → no 23502)", async () => {
    const select = vi.fn(async () => ({ data: [{ id: "cycle-1" }], error: null }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const cycleClient = new PayrollSyncClient({ from } as never);
    const response = await cycleClient.push({
      id: "close-1", tenantId: "tenant-1", branchId: "branch-1", tableName: "cierres_operativos", rowId: "cycle-1", op: "upsert",
      payload: { type: "orders.cycle.close", id: "cycle-1", closedAt: "2026-09-15T18:00:00.000Z" },
      payloadHash: "hash", sequence: 0, deviceId: "device", status: "syncing", leaseUntil: 0, result: null,
    });
    expect(update).toHaveBeenCalledWith({ closed_at: "2026-09-15T18:00:00.000Z" });
    expect(eq).toHaveBeenCalledWith("id", "cycle-1");
    expect(response.result).toMatchObject({ synced: true });
  });

  it("updates printed_at on the existing cloud cycle on mark-printed", async () => {
    const select = vi.fn(async () => ({ data: [{ id: "cycle-1" }], error: null }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const cycleClient = new PayrollSyncClient({ from } as never);
    const response = await cycleClient.push({
      id: "print-1", tenantId: "tenant-1", branchId: "branch-1", tableName: "cierres_operativos", rowId: "cycle-1", op: "upsert",
      payload: { type: "orders.cycle.mark-printed", id: "cycle-1", printedAt: "2026-09-15T18:31:00.000Z" },
      payloadHash: "hash", sequence: 0, deviceId: "device", status: "syncing", leaseUntil: 0, result: null,
    });
    expect(update).toHaveBeenCalledWith({ printed_at: "2026-09-15T18:31:00.000Z" });
    expect(eq).toHaveBeenCalledWith("id", "cycle-1");
    expect(response.result).toMatchObject({ synced: true });
  });

  it("retries the close when its cloud cycle does not exist yet (scheduler ordering, not a permanent drop)", async () => {
    const select = vi.fn(async () => ({ data: [], error: null }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const cycleClient = new PayrollSyncClient({ from } as never);
    await expect(cycleClient.push({
      id: "close-1", tenantId: "tenant-1", branchId: "branch-1", tableName: "cierres_operativos", rowId: "cycle-1", op: "upsert",
      payload: { type: "orders.cycle.close", id: "cycle-1", closedAt: "2026-09-15T18:00:00.000Z" },
      payloadHash: "hash", sequence: 0, deviceId: "device", status: "syncing", leaseUntil: 0, result: null,
    })).rejects.toThrow(/not present remotely yet/);
  });

  it("deletes the cloud cycle on discard", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const del = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: del }));
    const cycleClient = new PayrollSyncClient({ from } as never);
    const response = await cycleClient.push({
      id: "discard-1", tenantId: "tenant-1", branchId: "branch-1", tableName: "cierres_operativos", rowId: "cycle-1", op: "delete",
      payload: { type: "orders.cycle.discard", id: "cycle-1" }, payloadHash: "hash", sequence: 0, deviceId: "device", status: "syncing", leaseUntil: 0, result: null,
    });
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "cycle-1");
    expect(response.result).toMatchObject({ deleted: true });
  });
});

function createFakeSdk() {
  const from = vi.fn();
  const upsert = vi.fn(async () => ({ error: state.nextUpsertError }));
  const eq = vi.fn(async () => ({ error: state.nextDeleteError }));
  const remove = vi.fn(() => ({ eq }));
  const rpc = vi.fn(async () => ({ error: state.nextRpcError }));
  const state: { nextUpsertError: { message: string; code?: string } | null; nextDeleteError: { message: string; code?: string } | null; nextRpcError: { message: string; code?: string } | null } = {
    nextUpsertError: null,
    nextDeleteError: null,
    nextRpcError: null,
  };

  from.mockImplementation(() => ({
    upsert: async (...args: unknown[]) => {
      const result = await upsert(...args);
      state.nextUpsertError = null;
      return result;
    },
    delete: () => ({
      eq: async (...args: unknown[]) => {
        const result = await eq(...args);
        state.nextDeleteError = null;
        return result;
      },
    }),
  }));

  return {
    client: { from, rpc },
    from,
    upsert,
    rpc,
    delete: remove,
    eq,
    get nextUpsertError() {
      return state.nextUpsertError;
    },
    set nextUpsertError(value) {
      state.nextUpsertError = value;
    },
    get nextDeleteError() {
      return state.nextDeleteError;
    },
    set nextDeleteError(value) {
      state.nextDeleteError = value;
    },
    get nextRpcError() {
      return state.nextRpcError;
    },
    set nextRpcError(value) {
      state.nextRpcError = value;
    },
  };
}

function readPostMigrationGastosColumns(): string[] {
  const baseSchema = readFileSync(path.join(process.cwd(), "sql", "cloudix_gastos.sql"), "utf8");
  const payrollMigration = readFileSync(path.join(process.cwd(), "supabase", "migrations", "20260829160000_add-payroll-schema.sql"), "utf8");
  const branchMigration = readFileSync(path.join(process.cwd(), "supabase", "migrations", "20260524180000_add-sucursal-to-operational-tables.sql"), "utf8");
  const columns = new Set<string>(extractCreateTableColumns(baseSchema, "public.gastos"));

  for (const column of [...extractAlterTableColumns(branchMigration, "public.gastos"), ...extractAlterTableColumns(payrollMigration, "public.gastos")]) {
    columns.add(column);
  }

  return [...columns];
}

function extractCreateTableColumns(sql: string, tableName: string): string[] {
  const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${escapeRegExp(tableName)} \\(([\\s\\S]*?)\\n\\);`, "i"));
  if (!match) {
    throw new Error(`CREATE TABLE block not found for ${tableName}`);
  }

  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("CONSTRAINT"))
    .map((line) => line.replace(/,$/, "").split(/\s+/)[0]);
}

function extractAlterTableColumns(sql: string, tableName: string): string[] {
  const match = sql.match(new RegExp(`ALTER TABLE (?:IF EXISTS )?${escapeRegExp(tableName)}([\\s\\S]*?);`, "i"));
  if (!match) {
    throw new Error(`ALTER TABLE block not found for ${tableName}`);
  }

  return [...match[1].matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi)].map((entry) => entry[1]);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
