import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { PayrollRepository } from "../electron/persistence/payrollRepository";
import {
  PAYROLL_REPOSITORY_EXECUTE_CHANNEL,
  registerPayrollRepositoryIpc,
  type PayrollRepositoryIpcMain,
} from "../electron/persistence/ipc";

describe("local sqlite payroll", () => {
  let db: DatabaseSync;
  let repository: PayrollRepository;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, "tenant-1");
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-1", "tenant-1", "Main");
    db.prepare("INSERT INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run("branch-2", "tenant-1", "Secondary");
    repository = new PayrollRepository(db);
  });

  it("accepts the canonical camelCase IPC command", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const ipcMain: PayrollRepositoryIpcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
    };

    const executed: unknown[] = [];
    registerPayrollRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getAuthorizationContext: () => ({ tenantId: "tenant-1", allowedBranchIds: ["branch-1"] }),
      executeCommand: async (command) => {
        executed.push(command);
        return command;
      },
    });

    const handler = handlers.get(PAYROLL_REPOSITORY_EXECUTE_CHANNEL);
    const command = {
      type: "payroll.createPayment",
      tenantId: "tenant-1",
      sucursalId: "branch-1",
      payload: {
        employeeId: "emp-1",
        period: "2026-08",
        frequency: "monthly",
        paymentAmountCents: 50000,
        receiptSnapshot: "{}",
        adjustments: [{ kind: "discount", type: "loan", scope: "currentPayment", amountCents: 1000, note: "Advance" }],
      },
    } as const;

    await expect(handler?.({ senderId: 7 }, command)).resolves.toEqual({ ok: true, data: command });
    expect(executed).toEqual([command]);
  });

  it("rejects tenant and branch claims that are not in the main-process authorization context before execution", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const ipcMain: PayrollRepositoryIpcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
    };
    const executed: unknown[] = [];
    registerPayrollRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getAuthorizationContext: () => ({ tenantId: "tenant-1", allowedBranchIds: ["branch-1"] }),
      executeCommand: async (command) => {
        executed.push(command);
        return command;
      },
    });

    const handler = handlers.get(PAYROLL_REPOSITORY_EXECUTE_CHANNEL);
    await expect(handler?.({ senderId: 7 }, { type: "payroll.getEmployees", tenantId: "tenant-2", sucursalId: "branch-1" }))
      .rejects.toThrow("Payroll tenant mismatch");
    await expect(handler?.({ senderId: 7 }, { type: "payroll.getEmployees", tenantId: "tenant-1", sucursalId: "branch-2" }))
      .rejects.toThrow("Payroll branch access denied");
    expect(executed).toEqual([]);
  });

  it("fails closed when the main process has not resolved an authenticated authorization context", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const ipcMain: PayrollRepositoryIpcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
    };
    registerPayrollRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getAuthorizationContext: () => null,
      executeCommand: async (command) => command,
    });

    await expect(handlers.get(PAYROLL_REPOSITORY_EXECUTE_CHANNEL)?.({ senderId: 7 }, {
      type: "payroll.getEmployees", tenantId: "tenant-1", sucursalId: "branch-1",
    })).rejects.toThrow("Payroll authorization context is unavailable");
  });

  it("emits payroll_employees outbox rows for employee upsert and disable", () => {
    const employeeId = repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "Ana",
      lastName: "Pérez",
      role: "Caja",
      baseSalaryCents: 100000,
      frequency: "monthly",
      isActive: true,
    });

    repository.disableEmployee("tenant-1", "branch-1", employeeId);

    const outbox = db.prepare(`
      SELECT table_name, row_id, payload_json, status
      FROM sync_outbox
      WHERE table_name = 'payroll_employees'
      ORDER BY rowid ASC
    `).all() as Array<{ table_name: string; row_id: string; payload_json: string; status: string }>;

    expect(outbox).toHaveLength(2);
    expect(outbox.map((row) => ({ table_name: row.table_name, row_id: row.row_id, status: row.status }))).toEqual([
      { table_name: "payroll_employees", row_id: employeeId, status: "pending" },
      { table_name: "payroll_employees", row_id: employeeId, status: "pending" },
    ]);
    expect(outbox.map((row) => JSON.parse(row.payload_json))).toEqual([
      expect.objectContaining({
        id: employeeId,
        sucursalId: "branch-1",
        firstName: "Ana",
        lastName: "Pérez",
        role: "Caja",
        baseSalaryCents: 100000,
        frequency: "monthly",
        isActive: true,
      }),
      expect.objectContaining({
        id: employeeId,
        sucursalId: "branch-1",
        firstName: "Ana",
        lastName: "Pérez",
        role: "Caja",
        baseSalaryCents: 100000,
        frequency: "monthly",
        isActive: false,
      }),
    ]);
  });

  it("rejects unexpected nested adjustment payloads and missing discount notes", async () => {
    const handlers = new Map<string, (event: { senderId: number }, payload?: unknown) => unknown>();
    const ipcMain: PayrollRepositoryIpcMain = {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
    };

    registerPayrollRepositoryIpc({
      ipcMain,
      isTrustedSender: (event) => event.senderId === 7,
      getAuthorizationContext: () => ({ tenantId: "tenant-1", allowedBranchIds: ["branch-1"] }),
      executeCommand: async (command) => command,
    });

    const handler = handlers.get(PAYROLL_REPOSITORY_EXECUTE_CHANNEL);
    const nestedAdjustment = {
      type: "payroll.createPayment",
      tenantId: "tenant-1",
      sucursalId: "branch-1",
      payload: {
        employeeId: "emp-1",
        period: "2026-08",
        frequency: "monthly",
        paymentAmountCents: 50000,
        receiptSnapshot: "{}",
        adjustments: [{ kind: "bonus", type: "target", scope: "currentPayment", amountCents: 1000, note: "ok", extra: { nested: true } }],
      },
    };
    await expect(handler?.({ senderId: 7 }, nestedAdjustment)).rejects.toThrow("Invalid payroll command");

    const missingDiscountNote = {
      type: "payroll.createPayment",
      tenantId: "tenant-1",
      sucursalId: "branch-1",
      payload: {
        employeeId: "emp-1",
        period: "2026-08",
        frequency: "monthly",
        paymentAmountCents: 50000,
        receiptSnapshot: "{}",
        adjustments: [{ kind: "discount", type: "loan", scope: "currentPayment", amountCents: 1000, note: "" }],
      },
    };
    await expect(handler?.({ senderId: 7 }, missingDiscountNote)).rejects.toThrow("Invalid payroll command");
  });

  it("creates the payment, adjustments, payroll expense, and outbox rows atomically", () => {
    const employeeId = repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "Ana",
      lastName: "Pérez",
      role: "Caja",
      baseSalaryCents: 100000,
      frequency: "monthly",
      isActive: true,
    });

    const result = repository.createPayment("tenant-1", "branch-1", {
      employeeId,
      period: "2026-08",
      frequency: "monthly",
      paymentAmountCents: 70000,
      receiptSnapshot: "{}",
      adjustments: [{ kind: "discount", type: "uniforme", scope: "currentPayment", amountCents: 10000, note: "Reposición" }],
    });

    const payment = db.prepare("SELECT amount_paid_cents, total_due_cents, pending_cents FROM payroll_payments WHERE id = ?").get(result.paymentId) as Record<string, number>;
    expect(payment).toEqual({ amount_paid_cents: 70000, total_due_cents: 90000, pending_cents: 20000 });

    const adjustment = db.prepare("SELECT kind, scope, amount_cents, note FROM payroll_payment_adjustments WHERE payment_id = ?").get(result.paymentId) as Record<string, unknown>;
    expect(adjustment).toEqual({ kind: "discount", scope: "currentPayment", amount_cents: 10000, note: "Reposición" });

    const expense = db.prepare("SELECT compra_id, payroll_payment_id, expense_type, amount, amount_cents, local_status FROM gastos WHERE id = ?").get(result.expenseId) as Record<string, unknown>;
    expect(expense).toEqual({ compra_id: null, payroll_payment_id: result.paymentId, expense_type: "payroll", amount: null, amount_cents: 70000, local_status: "pending_sync" });

    const outbox = db.prepare("SELECT table_name, operation, status FROM sync_outbox ORDER BY rowid ASC").all() as Array<Record<string, string>>;
    expect(outbox).toEqual([
      { table_name: "payroll_employees", operation: "upsert", status: "pending" },
      { table_name: "payroll_payment_adjustments", operation: "upsert", status: "pending" },
      { table_name: "payroll_payments", operation: "upsert", status: "pending" },
      { table_name: "gastos", operation: "upsert", status: "pending" },
    ]);
  });

  it("rolls every payroll row back when an outbox write fails mid-transaction", () => {
    const employeeId = repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "Luis",
      lastName: "Martínez",
      role: "Cocina",
      baseSalaryCents: 80000,
      frequency: "monthly",
      isActive: true,
    });

    db.exec(`
      CREATE TRIGGER fail_payroll_expense_outbox
      BEFORE INSERT ON sync_outbox
      WHEN NEW.table_name = 'gastos'
      BEGIN
        SELECT RAISE(ABORT, 'forced outbox failure');
      END;
    `);

    expect(() => {
      repository.createPayment("tenant-1", "branch-1", {
        employeeId,
        period: "2026-08",
        frequency: "monthly",
        paymentAmountCents: 40000,
        receiptSnapshot: "{}",
        adjustments: [{ kind: "bonus", type: "meta", scope: "currentPayment", amountCents: 5000, note: "" }],
      });
    }).toThrow("forced outbox failure");

    expect(db.prepare("SELECT COUNT(*) AS count FROM payroll_payments").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM payroll_payment_adjustments").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM gastos WHERE expense_type = 'payroll'").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT table_name FROM sync_outbox").get()).toEqual({ table_name: "payroll_employees" });
  });

  it("scopes cumulative overpayment checks by tenant and sucursal", () => {
    const employeeId = repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "María",
      lastName: "Lora",
      role: "Admin",
      baseSalaryCents: 100000,
      frequency: "monthly",
      isActive: true,
    });

    db.prepare(`
      INSERT INTO payroll_payments (
        id, tenant_id, sucursal_id, employee_id, period, frequency, base_salary_cents, period_salary_cents,
        adjustments_delta_cents, total_due_cents, amount_paid_cents, pending_cents, receipt_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("rogue-branch-payment", "tenant-1", "branch-2", employeeId, "2026-08", "monthly", 100000, 100000, 0, 100000, 90000, 10000, "{}");

    expect(() => {
      repository.createPayment("tenant-1", "branch-1", {
        employeeId,
        period: "2026-08",
        frequency: "monthly",
        paymentAmountCents: 30000,
        receiptSnapshot: "{}",
        adjustments: [],
      });
    }).not.toThrow();

    expect(() => {
      repository.createPayment("tenant-1", "branch-1", {
        employeeId,
        period: "2026-08",
        frequency: "monthly",
        paymentAmountCents: 80000,
        receiptSnapshot: "{}",
        adjustments: [],
      });
    }).toThrow("Overpayment not allowed");
  });

  it("anchors same-period due and pending to the first payment salary snapshot after a salary edit", () => {
    const employeeId = repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "Elena",
      lastName: "Suárez",
      role: "Bar",
      baseSalaryCents: 100000,
      frequency: "monthly",
      isActive: true,
    });

    repository.createPayment("tenant-1", "branch-1", {
      employeeId,
      period: "2026-08",
      frequency: "monthly",
      paymentAmountCents: 40000,
      receiptSnapshot: "{}",
      adjustments: [],
    });

    repository.upsertEmployee("tenant-1", "branch-1", {
      id: employeeId,
      firstName: "Elena",
      lastName: "Suárez",
      role: "Bar",
      baseSalaryCents: 200000,
      frequency: "monthly",
      isActive: true,
    });

    const samePeriodContext = repository.getPaymentContext("tenant-1", "branch-1", {
      employeeId,
      period: "2026-08",
      frequency: "monthly",
      adjustments: [],
    });

    expect(samePeriodContext).toMatchObject({
      baseSalaryCents: 100000,
      periodSalaryCents: 100000,
      dueCents: 100000,
      alreadyPaidCents: 40000,
      pendingCents: 60000,
    });

    expect(() => {
      repository.createPayment("tenant-1", "branch-1", {
        employeeId,
        period: "2026-08",
        frequency: "monthly",
        paymentAmountCents: 60001,
        receiptSnapshot: "{}",
        adjustments: [],
      });
    }).toThrow("Overpayment not allowed");

    const nextPeriodContext = repository.getPaymentContext("tenant-1", "branch-1", {
      employeeId,
      period: "2026-09",
      frequency: "monthly",
      adjustments: [],
    });

    expect(nextPeriodContext).toMatchObject({
      baseSalaryCents: 200000,
      periodSalaryCents: 200000,
      dueCents: 200000,
      alreadyPaidCents: 0,
      pendingCents: 200000,
    });
  });

  it("lists historical payments with employee metadata via getPayments", () => {
    const employeeId = repository.upsertEmployee("tenant-1", "branch-1", {
      firstName: "Maria",
      lastName: "Rodriguez",
      role: "Gerente",
      baseSalaryCents: 6000000,
      frequency: "monthly",
      isActive: true,
    });

    const payment = repository.createPayment("tenant-1", "branch-1", {
      employeeId,
      period: "2026-08",
      frequency: "monthly",
      paymentAmountCents: 6000000,
      receiptSnapshot: JSON.stringify({ note: "Pago completo" }),
      adjustments: [],
    });

    const history = repository.getPayments("tenant-1", "branch-1");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: payment.paymentId,
      employeeId,
      employeeName: "Maria Rodriguez",
      employeeRole: "Gerente",
      period: "2026-08",
      amountPaidCents: 6000000,
    });

    const filteredHistory = repository.getPayments("tenant-1", "branch-1", employeeId);
    expect(filteredHistory).toHaveLength(1);
    expect(filteredHistory[0].id).toBe(payment.paymentId);
  });
});
