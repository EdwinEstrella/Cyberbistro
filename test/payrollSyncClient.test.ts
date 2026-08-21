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

  it("maps repository payment, adjustment, and payroll gasto outbox rows to the remote payroll schema", async () => {
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
        },
        { onConflict: "id" },
      ],
      [
        {
          id: expenseOperation?.rowId,
          tenant_id: "tenant-1",
          descripcion: "Payroll payment 2026-08",
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
});

function createFakeSdk() {
  const from = vi.fn();
  const upsert = vi.fn(async () => ({ error: state.nextUpsertError }));
  const eq = vi.fn(async () => ({ error: state.nextDeleteError }));
  const remove = vi.fn(() => ({ eq }));
  const state: { nextUpsertError: { message: string; code?: string } | null; nextDeleteError: { message: string; code?: string } | null } = {
    nextUpsertError: null,
    nextDeleteError: null,
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
    client: { database: { from } },
    from,
    upsert,
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
  };
}

function readPostMigrationGastosColumns(): string[] {
  const baseSchema = readFileSync(path.join(process.cwd(), "sql", "cloudix_gastos.sql"), "utf8");
  const payrollMigration = readFileSync(path.join(process.cwd(), "migrations", "20260821_payroll_schema.sql"), "utf8");
  const columns = new Set<string>(extractCreateTableColumns(baseSchema, "public.gastos"));

  for (const column of extractAlterTableColumns(payrollMigration, "public.gastos")) {
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
  const match = sql.match(new RegExp(`ALTER TABLE IF EXISTS ${escapeRegExp(tableName)}([\\s\\S]*?);`, "i"));
  if (!match) {
    throw new Error(`ALTER TABLE block not found for ${tableName}`);
  }

  return [...match[1].matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi)].map((entry) => entry[1]);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
