import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  PayrollCreatePaymentRequest,
  PayrollEmployee,
  PayrollEmployeeDraft,
  PayrollFrequency,
  PayrollPaymentAdjustment,
  PayrollPaymentContext,
  PayrollPaymentContextRequest,
} from "../../src/shared/lib/payrollContracts";

type PayrollEmployeeRow = {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  base_salary_cents: number;
  frequency: PayrollFrequency;
  is_active: number;
};

type TotalsRow = {
  paid_cents: number;
  immediate_bonus_cents: number;
  immediate_discount_cents: number;
};

type PaymentSnapshotRow = {
  base_salary_cents: number;
  period_salary_cents: number;
};

const FREQUENCY_DIVISOR: Record<PayrollFrequency, number> = {
  weekly: 4,
  biweekly: 2,
  monthly: 1,
};

export class PayrollRepository {
  constructor(private readonly db: DatabaseSync) {}

  public getEmployees(tenantId: string, sucursalId: string): PayrollEmployee[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, first_name, last_name, role, base_salary_cents, frequency, is_active
          FROM payroll_employees
          WHERE tenant_id = ? AND sucursal_id = ?
          ORDER BY first_name, last_name
        `,
      )
      .all(tenantId, sucursalId) as PayrollEmployeeRow[];

    return rows.map(mapEmployeeRow);
  }

  private ensureTenantAndBranch(tenantId: string, sucursalId: string): void {
    this.db.prepare("INSERT OR IGNORE INTO tenant_identity (id) VALUES (?)").run(tenantId);
    this.db.prepare("INSERT OR IGNORE INTO tenants (id) VALUES (?)").run(tenantId);
    this.db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, ?)").run(sucursalId, tenantId, "Principal");
  }

  public upsertEmployee(tenantId: string, sucursalId: string, employee: PayrollEmployeeDraft): string {
    const id = employee.id ?? randomUUID();

    this.db.exec("BEGIN IMMEDIATE;");

    try {
      this.ensureTenantAndBranch(tenantId, sucursalId);

      if (employee.id) {
        const result = this.db
          .prepare(
            `
              UPDATE payroll_employees
              SET first_name = ?, last_name = ?, role = ?, base_salary_cents = ?, frequency = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND tenant_id = ? AND sucursal_id = ?
            `,
          )
          .run(
            employee.firstName,
            employee.lastName,
            employee.role,
            employee.baseSalaryCents,
            employee.frequency,
            Number(employee.isActive),
            id,
            tenantId,
            sucursalId,
          );

        if ((result.changes ?? 0) === 0) {
          throw new Error("Employee not found");
        }
      } else {
        this.db
          .prepare(
            `
              INSERT INTO payroll_employees (
                id, tenant_id, sucursal_id, first_name, last_name, role, base_salary_cents, frequency, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .run(
            id,
            tenantId,
            sucursalId,
            employee.firstName,
            employee.lastName,
            employee.role,
            employee.baseSalaryCents,
            employee.frequency,
            Number(employee.isActive),
          );
      }

      this.insertOutboxRow({
        id: randomUUID(),
        tenantId,
        branchId: sucursalId,
        tableName: "payroll_employees",
        rowId: id,
        payload: {
          id,
          sucursalId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          role: employee.role,
          baseSalaryCents: employee.baseSalaryCents,
          frequency: employee.frequency,
          isActive: employee.isActive,
        },
      });

      this.db.exec("COMMIT;");
      return id;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  public disableEmployee(tenantId: string, sucursalId: string, employeeId: string): void {
    this.db.exec("BEGIN IMMEDIATE;");

    try {
      this.ensureTenantAndBranch(tenantId, sucursalId);
      const result = this.db
        .prepare(
          `
            UPDATE payroll_employees
            SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND tenant_id = ? AND sucursal_id = ?
          `,
        )
        .run(employeeId, tenantId, sucursalId);

      if ((result.changes ?? 0) === 0) {
        throw new Error("Employee not found");
      }

      const employee = this.getEmployeeOrThrow(tenantId, sucursalId, employeeId);
      this.insertOutboxRow({
        id: randomUUID(),
        tenantId,
        branchId: sucursalId,
        tableName: "payroll_employees",
        rowId: employeeId,
        payload: {
          id: employeeId,
          sucursalId,
          firstName: employee.first_name,
          lastName: employee.last_name,
          role: employee.role,
          baseSalaryCents: employee.base_salary_cents,
          frequency: employee.frequency,
          isActive: false,
        },
      });

      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  public getPaymentContext(
    tenantId: string,
    sucursalId: string,
    payload: PayrollPaymentContextRequest,
  ): PayrollPaymentContext {
    const employee = this.getEmployeeOrThrow(tenantId, sucursalId, payload.employeeId);
    ensureFrequencyMatches(employee.frequency, payload.frequency);

    const existingPaymentSnapshot = this.getFirstPaymentSnapshot(tenantId, sucursalId, payload.employeeId, payload.period);
    const baseSalaryCents = existingPaymentSnapshot?.base_salary_cents ?? employee.base_salary_cents;
    const periodSalaryCents = existingPaymentSnapshot?.period_salary_cents
      ?? calculatePeriodSalaryCents(employee.base_salary_cents, employee.frequency);
    const existingTotals = this.getExistingTotals(tenantId, sucursalId, payload.employeeId, payload.period);
    const currentAdjustmentDeltaCents = sumImmediateAdjustmentDelta(payload.adjustments);
    const dueCents = Math.max(periodSalaryCents + existingTotals.immediate_bonus_cents - existingTotals.immediate_discount_cents + currentAdjustmentDeltaCents, 0);
    const pendingCents = Math.max(dueCents - existingTotals.paid_cents, 0);

    return {
      employeeId: payload.employeeId,
      period: payload.period,
      frequency: payload.frequency,
      baseSalaryCents,
      periodSalaryCents,
      adjustmentDeltaCents: existingTotals.immediate_bonus_cents - existingTotals.immediate_discount_cents + currentAdjustmentDeltaCents,
      dueCents,
      alreadyPaidCents: existingTotals.paid_cents,
      pendingCents,
    };
  }

  public createPayment(
    tenantId: string,
    sucursalId: string,
    payload: PayrollCreatePaymentRequest,
  ): { paymentId: string; expenseId: string; context: PayrollPaymentContext } {
    this.db.exec("BEGIN IMMEDIATE;");

    try {
      this.ensureTenantAndBranch(tenantId, sucursalId);
      const context = this.getPaymentContext(tenantId, sucursalId, payload);
      if (payload.paymentAmountCents > context.pendingCents) {
        throw new Error("Overpayment not allowed");
      }

      const paymentId = randomUUID();
      const expenseId = randomUUID();
      const adjustmentDeltaCents = sumImmediateAdjustmentDelta(payload.adjustments);
      const pendingCents = context.pendingCents - payload.paymentAmountCents;
      const expenseDescription = `Payroll payment ${payload.period}`;
      const expenseRecordedAt = new Date().toISOString();

      this.db
        .prepare(
          `
            INSERT INTO payroll_payments (
              id,
              tenant_id,
              sucursal_id,
              employee_id,
              period,
              frequency,
              base_salary_cents,
              period_salary_cents,
              adjustments_delta_cents,
              total_due_cents,
              amount_paid_cents,
              pending_cents,
              receipt_snapshot
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          paymentId,
          tenantId,
          sucursalId,
          payload.employeeId,
          payload.period,
          payload.frequency,
          context.baseSalaryCents,
          context.periodSalaryCents,
          adjustmentDeltaCents,
          context.dueCents,
          payload.paymentAmountCents,
          pendingCents,
          payload.receiptSnapshot,
        );

      const insertAdjustment = this.db.prepare(
        `
          INSERT INTO payroll_payment_adjustments (
            id, tenant_id, sucursal_id, payment_id, period, kind, type, scope, amount_cents, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      );

      for (const adjustment of payload.adjustments) {
        const adjustmentId = randomUUID();
        insertAdjustment.run(
          adjustmentId,
          tenantId,
          sucursalId,
          paymentId,
          payload.period,
          adjustment.kind,
          adjustment.type,
          adjustment.scope,
          adjustment.amountCents,
          adjustment.note,
        );

        this.insertOutboxRow({
          id: `${paymentId}:adjustment:${adjustmentId}`,
          tenantId,
          branchId: sucursalId,
          tableName: "payroll_payment_adjustments",
          rowId: adjustmentId,
          payload: {
            id: adjustmentId,
            paymentId,
            employeeId: payload.employeeId,
            period: payload.period,
            ...adjustment,
          },
        });
      }

      this.db
        .prepare(
          `
            INSERT INTO gastos (
              id,
              tenant_id,
              sucursal_id,
              compra_id,
              payroll_payment_id,
              expense_type,
              payment_method,
              amount,
              amount_cents,
              local_status,
              description
            ) VALUES (?, ?, ?, NULL, ?, 'payroll', 'cash', NULL, ?, 'pending_sync', ?)
          `,
        )
        .run(expenseId, tenantId, sucursalId, paymentId, payload.paymentAmountCents, expenseDescription);

      this.insertOutboxRow({
        id: `${paymentId}:payment`,
        tenantId,
        branchId: sucursalId,
        tableName: "payroll_payments",
        rowId: paymentId,
        payload: {
          id: paymentId,
          employeeId: payload.employeeId,
          period: payload.period,
          frequency: payload.frequency,
          baseSalaryCents: context.baseSalaryCents,
          periodSalaryCents: context.periodSalaryCents,
          adjustmentsDeltaCents: adjustmentDeltaCents,
          totalDueCents: context.dueCents,
          paymentAmountCents: payload.paymentAmountCents,
          pendingCents,
        },
      });

      this.insertOutboxRow({
        id: `${paymentId}:expense`,
        tenantId,
        branchId: sucursalId,
        tableName: "gastos",
        rowId: expenseId,
        payload: {
          id: expenseId,
          payrollPaymentId: paymentId,
          expenseType: "payroll",
          description: expenseDescription,
          recordedAt: expenseRecordedAt,
          paymentMethod: "cash",
          amountCents: payload.paymentAmountCents,
          localStatus: "pending_sync",
        },
      });

      this.db.exec("COMMIT;");

      return {
        paymentId,
        expenseId,
        context: {
          ...context,
          adjustmentDeltaCents: context.adjustmentDeltaCents,
          alreadyPaidCents: context.alreadyPaidCents + payload.paymentAmountCents,
          pendingCents,
        },
      };
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  private getEmployeeOrThrow(tenantId: string, sucursalId: string, employeeId: string) {
    const employee = this.db
      .prepare(
        `
          SELECT id, first_name, last_name, role, base_salary_cents, frequency, is_active
          FROM payroll_employees
          WHERE id = ? AND tenant_id = ? AND sucursal_id = ?
        `,
      )
      .get(employeeId, tenantId, sucursalId) as PayrollEmployeeRow | undefined;

    if (!employee) {
      throw new Error("Employee not found");
    }

    return employee;
  }

  private getExistingTotals(tenantId: string, sucursalId: string, employeeId: string, period: string): TotalsRow {
    return this.db
      .prepare(
        `
          SELECT
            COALESCE((
              SELECT SUM(amount_paid_cents)
              FROM payroll_payments
              WHERE tenant_id = ? AND sucursal_id = ? AND employee_id = ? AND period = ?
            ), 0) AS paid_cents,
            COALESCE((
              SELECT SUM(a.amount_cents)
              FROM payroll_payment_adjustments a
              INNER JOIN payroll_payments p ON p.id = a.payment_id
              WHERE p.tenant_id = ? AND p.sucursal_id = ? AND p.employee_id = ? AND p.period = ? AND a.scope = 'currentPayment' AND a.kind = 'bonus'
            ), 0) AS immediate_bonus_cents,
            COALESCE((
              SELECT SUM(a.amount_cents)
              FROM payroll_payment_adjustments a
              INNER JOIN payroll_payments p ON p.id = a.payment_id
              WHERE p.tenant_id = ? AND p.sucursal_id = ? AND p.employee_id = ? AND p.period = ? AND a.scope = 'currentPayment' AND a.kind = 'discount'
            ), 0) AS immediate_discount_cents
        `,
      )
      .get(
        tenantId,
        sucursalId,
        employeeId,
        period,
        tenantId,
        sucursalId,
        employeeId,
        period,
        tenantId,
        sucursalId,
        employeeId,
        period,
      ) as TotalsRow;
  }

  private getFirstPaymentSnapshot(
    tenantId: string,
    sucursalId: string,
    employeeId: string,
    period: string,
  ): PaymentSnapshotRow | undefined {
    return this.db
      .prepare(
        `
          SELECT base_salary_cents, period_salary_cents
          FROM payroll_payments
          WHERE tenant_id = ? AND sucursal_id = ? AND employee_id = ? AND period = ?
          ORDER BY created_at ASC, rowid ASC
          LIMIT 1
        `,
      )
      .get(tenantId, sucursalId, employeeId, period) as PaymentSnapshotRow | undefined;
  }

  private insertOutboxRow(input: {
    id: string;
    tenantId: string;
    branchId: string;
    tableName: string;
    rowId: string;
    payload: unknown;
  }): void {
    this.db
      .prepare(
        `
          INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
          VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')
        `,
      )
      .run(input.id, input.tenantId, input.branchId, input.tableName, input.rowId, JSON.stringify(input.payload));
  }
}

function mapEmployeeRow(row: PayrollEmployeeRow): PayrollEmployee {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    baseSalaryCents: row.base_salary_cents,
    frequency: row.frequency,
    isActive: row.is_active === 1,
  };
}

function calculatePeriodSalaryCents(baseSalaryCents: number, frequency: PayrollFrequency): number {
  const divisor = FREQUENCY_DIVISOR[frequency];
  return Math.round(baseSalaryCents / divisor);
}

function ensureFrequencyMatches(employeeFrequency: PayrollFrequency, payloadFrequency: PayrollFrequency): void {
  if (employeeFrequency !== payloadFrequency) {
    throw new Error("Employee frequency mismatch");
  }
}

function sumImmediateAdjustmentDelta(adjustments: PayrollPaymentAdjustment[]): number {
  return adjustments.reduce((total, adjustment) => {
    if (adjustment.scope !== "currentPayment") return total;
    return total + (adjustment.kind === "bonus" ? adjustment.amountCents : -adjustment.amountCents);
  }, 0);
}
