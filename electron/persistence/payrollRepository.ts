import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

export interface PayrollEmployeeRow {
  id: string;
  tenant_id: string;
  sucursal_id: string;
  first_name: string;
  last_name: string;
  role: string;
  base_salary: number;
  frequency: "weekly" | "biweekly" | "monthly";
  is_active: number;
}

export interface PayrollPaymentPayload {
  employee_id: string;
  period: string;
  frequency: string;
  base_amount: number;
  amount_paid: number;
  pending_amount: number;
  receipt_snapshot: string;
  adjustments: Array<{
    kind: string;
    type: string;
    amount: number;
    note: string;
    applyMode: string;
  }>;
}

export class PayrollRepository {
  constructor(private db: DatabaseSync) {}

  public getEmployees(tenantId: string, sucursalId: string): PayrollEmployeeRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM payroll_employees
      WHERE tenant_id = ? AND sucursal_id = ?
      ORDER BY first_name, last_name
    `);
    return stmt.all(tenantId, sucursalId) as unknown as PayrollEmployeeRow[];
  }

  public upsertEmployee(tenantId: string, sucursalId: string, employee: Partial<PayrollEmployeeRow> & { id?: string }): string {
    const id = employee.id || randomUUID();
    const isNew = !employee.id;

    if (isNew) {
      const stmt = this.db.prepare(`
        INSERT INTO payroll_employees (id, tenant_id, sucursal_id, first_name, last_name, role, base_salary, frequency, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        tenantId,
        sucursalId,
        employee.first_name,
        employee.last_name,
        employee.role,
        employee.base_salary,
        employee.frequency,
        employee.is_active ?? 1
      );
    } else {
      const stmt = this.db.prepare(`
        UPDATE payroll_employees
        SET first_name = ?, last_name = ?, role = ?, base_salary = ?, frequency = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ? AND sucursal_id = ?
      `);
      stmt.run(
        employee.first_name,
        employee.last_name,
        employee.role,
        employee.base_salary,
        employee.frequency,
        employee.is_active,
        id,
        tenantId,
        sucursalId
      );
    }
    return id;
  }

  public disableEmployee(tenantId: string, sucursalId: string, employeeId: string): void {
    const stmt = this.db.prepare(`
      UPDATE payroll_employees SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND sucursal_id = ?
    `);
    stmt.run(employeeId, tenantId, sucursalId);
  }

  public createPayment(tenantId: string, sucursalId: string, payload: PayrollPaymentPayload): string {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const paymentId = randomUUID();
      
      const stmtPayment = this.db.prepare(`
        INSERT INTO payroll_payments (id, tenant_id, sucursal_id, employee_id, period, frequency, base_amount, amount_paid, pending_amount, receipt_snapshot)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmtPayment.run(
        paymentId,
        tenantId,
        sucursalId,
        payload.employee_id,
        payload.period,
        payload.frequency,
        payload.base_amount,
        payload.amount_paid,
        payload.pending_amount,
        payload.receipt_snapshot
      );

      const stmtAdj = this.db.prepare(`
        INSERT INTO payroll_payment_adjustments (id, tenant_id, payment_id, kind, type, amount, note, apply_mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const adj of payload.adjustments) {
        stmtAdj.run(
          randomUUID(),
          tenantId,
          paymentId,
          adj.kind,
          adj.type,
          adj.amount,
          adj.note || null,
          adj.applyMode
        );
      }

      this.db.exec("COMMIT;");
      return paymentId;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }
}
