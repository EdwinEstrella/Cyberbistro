import type { DatabaseSync } from "node:sqlite";

type Row = Record<string, unknown>;

function cents(value: unknown): number {
  const amount = Number(value);
  if (value == null || !Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid cloud payroll amount");
  return amount;
}

function frequency(value: unknown): string {
  if (value === "mensual") return "monthly";
  if (value === "quincenal") return "biweekly";
  if (value === "semanal") return "weekly";
  throw new Error("Invalid cloud payroll frequency");
}

/** Caller owns the transaction. These imports must never enqueue a cloud write. */
export function applyCloudPayrollEmployees(db: DatabaseSync, tenantId: string, rows: Row[]): void {
  const stmt = db.prepare(`
    INSERT INTO payroll_employees (id, tenant_id, sucursal_id, first_name, last_name, role,
      base_salary_cents, frequency, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET sucursal_id=excluded.sucursal_id, first_name=excluded.first_name,
      last_name=excluded.last_name, role=excluded.role, base_salary_cents=excluded.base_salary_cents,
      frequency=excluded.frequency, is_active=excluded.is_active, updated_at=excluded.updated_at
    WHERE payroll_employees.tenant_id=excluded.tenant_id
  `);
  for (const row of rows) {
    if (row.tenant_id !== tenantId || !row.sucursal_id || !row.nombre_completo) throw new Error("Invalid cloud payroll employee");
    const [firstName, ...lastName] = String(row.nombre_completo).trim().split(/\s+/);
    db.prepare("INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES (?, ?, 'Principal')")
      .run(String(row.sucursal_id), tenantId);
    stmt.run(String(row.id), tenantId, String(row.sucursal_id), firstName, lastName.join(" "),
      String(row.cargo ?? "Personal"), cents(row.salario_base_mensual), frequency(row.frecuencia_pago),
      row.activo === false ? 0 : 1, String(row.created_at ?? new Date().toISOString()),
      String(row.updated_at ?? row.created_at ?? new Date().toISOString()));
  }
}

export function applyCloudPayrollPayments(db: DatabaseSync, tenantId: string, rows: Row[]): void {
  const employee = db.prepare("SELECT sucursal_id, frequency, base_salary_cents FROM payroll_employees WHERE id=? AND tenant_id=?");
  const stmt = db.prepare(`
    INSERT INTO payroll_payments (id, tenant_id, sucursal_id, employee_id, period, frequency,
      base_salary_cents, period_salary_cents, adjustments_delta_cents, total_due_cents,
      amount_paid_cents, pending_cents, receipt_snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
    ON CONFLICT(id) DO UPDATE SET period=excluded.period, period_salary_cents=excluded.period_salary_cents,
      adjustments_delta_cents=excluded.adjustments_delta_cents, total_due_cents=excluded.total_due_cents,
      amount_paid_cents=excluded.amount_paid_cents, pending_cents=excluded.pending_cents
    WHERE payroll_payments.tenant_id=excluded.tenant_id
  `);
  for (const row of rows) {
    const parent = employee.get(String(row.empleado_id), tenantId) as { sucursal_id: string; frequency: string; base_salary_cents: number } | undefined;
    if (!parent || !row.periodo || !row.created_at) throw new Error("Cloud payroll payment is missing its employee, period or date");
    stmt.run(String(row.id), tenantId, parent.sucursal_id, String(row.empleado_id), String(row.periodo),
      parent.frequency, parent.base_salary_cents, cents(row.monto_base), cents(row.total_bonos) - cents(row.total_descuentos),
      cents(row.monto_neto), cents(row.monto_pagado), cents(row.monto_pendiente), String(row.created_at));
  }
}

export function applyCloudPayrollAdjustments(db: DatabaseSync, tenantId: string, rows: Row[]): void {
  const stmt = db.prepare(`INSERT INTO payroll_cloud_adjustments (id, tenant_id, employee_id, payload_json)
    VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json
    WHERE payroll_cloud_adjustments.tenant_id=excluded.tenant_id`);
  for (const row of rows) {
    if (!db.prepare("SELECT 1 FROM payroll_employees WHERE id=? AND tenant_id=?").get(String(row.empleado_id), tenantId)) {
      throw new Error("Cloud payroll adjustment is missing its employee");
    }
    cents(row.monto);
    stmt.run(String(row.id), tenantId, String(row.empleado_id), JSON.stringify(row));
  }
}
