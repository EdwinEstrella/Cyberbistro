import {
  calculatePayrollPaymentContext,
  getCurrentPaymentAdjustmentTotals,
  type PayrollPaymentHistory,
} from "./payrollCalculation";
import type {
  PayrollCreatePaymentRequest,
  PayrollEmployee,
  PayrollFrequency,
  PayrollPaymentContext,
} from "./payrollContracts";

type PayrollEmployeeRemoteError = {
  code?: string;
  message: string;
};

type PayrollPaymentQuery = {
  eq(column: string, value: string): PayrollPaymentQuery;
  order(column: string, options: { ascending: boolean }): PromiseLike<{
    data: PayrollPaymentRemoteRow[] | null;
    error: PayrollEmployeeRemoteError | null;
  }>;
};

type PayrollPaymentRemoteRow = {
  empleado_id: string;
  periodo: string;
  monto_base: number;
  total_bonos: number;
  total_descuentos: number;
  monto_pagado: number;
  created_at: string | null;
};

type PayrollEmployeeCloudClient = {
  database: {
    from(table: string): {
      upsert(
        payload: Record<string, unknown>,
        options: { onConflict: string },
      ): PromiseLike<{ error: PayrollEmployeeRemoteError | null }>;
    };
  };
};

type PayrollEmployeeUpdateClient = {
  database: {
    from(table: string): {
      update(payload: Record<string, unknown>): {
        eq(column: string, value: string): PromiseLike<{ error: PayrollEmployeeRemoteError | null }>;
      };
    };
  };
};

type PayrollPaymentContextCloudClient = {
  database: {
    from(table: string): {
      select(columns: string): PayrollPaymentQuery;
      insert(payload: Record<string, unknown>[]): PromiseLike<{ error: PayrollEmployeeRemoteError | null }>;
    };
  };
};

type PayrollPaymentCloudClient = {
  database: {
    rpc(
      functionName: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: PayrollPaymentRpcRow[] | null; error: PayrollEmployeeRemoteError | null }>;
  };
};

type PayrollPaymentRpcRow = {
  payment_id: string;
  period_salary_cents: number;
  due_cents: number;
  amount_paid_cents: number;
  pending_cents: number;
  paid_total_cents: number;
};

export class PayrollCloudSyncError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "PayrollCloudSyncError";
  }
}

function mapPayrollFrequencyForCloud(frequency: PayrollFrequency): "mensual" | "quincenal" {
  switch (frequency) {
    case "monthly":
      return "mensual";
    case "biweekly":
      return "quincenal";
    case "weekly":
      throw new PayrollCloudSyncError(
        "Weekly payroll frequency is not supported by the remote payroll service.",
        "PAYROLL_FREQUENCY_NOT_SUPPORTED",
      );
  }
}

export function mapPayrollFrequencyFromCloud(frequency: unknown): PayrollFrequency {
  switch (frequency) {
    case "mensual":
      return "monthly";
    case "quincenal":
      return "biweekly";
    default:
      return "monthly";
  }
}

export function mapPayrollEmployeeForCloud(
  employee: PayrollEmployee,
  tenantId: string,
  sucursalId: string,
): Record<string, unknown> {
  return {
    id: employee.id,
    tenant_id: tenantId,
    sucursal_id: sucursalId,
    nombre_completo: `${employee.firstName} ${employee.lastName}`.trim(),
    identificacion: employee.id,
    telefono: null,
    cargo: employee.role || "Personal",
    salario_base_mensual: employee.baseSalaryCents,
    frecuencia_pago: mapPayrollFrequencyForCloud(employee.frequency),
    activo: employee.isActive,
  };
}

export async function syncPayrollEmployeeToCloud(
  client: PayrollEmployeeCloudClient,
  employee: PayrollEmployee,
  tenantId: string,
  sucursalId: string,
): Promise<void> {
  const { error } = await client.database.from("nomina_empleados").upsert(
    mapPayrollEmployeeForCloud(employee, tenantId, sucursalId),
    { onConflict: "id" },
  );

  if (error) {
    const code = error.code ?? "PAYROLL_CLOUD_UPSERT_FAILED";
    throw new PayrollCloudSyncError(
      `Payroll employee cloud sync failed (${code}): ${error.message}`,
      code,
    );
  }
}

export async function deactivatePayrollEmployeeInCloud(
  client: PayrollEmployeeUpdateClient,
  employeeId: string,
): Promise<void> {
  const { error } = await client.database
    .from("nomina_empleados")
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq("id", employeeId);

  if (error) {
    const code = error.code ?? "PAYROLL_CLOUD_DEACTIVATION_FAILED";
    throw new PayrollCloudSyncError(
      `Payroll employee deactivation failed (${code}): ${error.message}`,
      code,
    );
  }
}

export async function getPayrollPaymentContextFromCloud(
  client: PayrollPaymentContextCloudClient,
  employee: PayrollEmployee,
  request: Pick<PayrollCreatePaymentRequest, "employeeId" | "period" | "frequency" | "adjustments">,
): Promise<PayrollPaymentContext> {
  const { data, error } = await client.database
    .from("nomina_pagos")
    .select("empleado_id, periodo, monto_base, total_bonos, total_descuentos, monto_pagado, created_at")
    .eq("empleado_id", request.employeeId)
    .eq("periodo", request.period)
    .order("created_at", { ascending: true });

  if (error) {
    const code = error.code ?? "PAYROLL_CLOUD_CONTEXT_FAILED";
    throw new PayrollCloudSyncError(`Payroll payment context query failed (${code}): ${error.message}`, code);
  }

  return calculatePayrollPaymentContext(employee, request, (data ?? []).map(mapPaymentHistory));
}

export async function createPayrollPaymentInCloud(
  client: PayrollPaymentCloudClient,
  payload: PayrollCreatePaymentRequest,
): Promise<PayrollPaymentContext> {
  const currentTotals = getCurrentPaymentAdjustmentTotals(payload.adjustments);
  const { data, error } = await client.database.rpc("register_nomina_pago", {
    p_empleado_id: payload.employeeId,
    p_periodo: payload.period,
    p_monto_pagado: payload.paymentAmountCents,
    p_total_bonos: currentTotals.bonusesCents,
    p_total_descuentos: currentTotals.discountsCents,
  });

  if (error) {
    const code = error.code ?? "PAYROLL_CLOUD_PAYMENT_REGISTER_FAILED";
    throw new PayrollCloudSyncError(`Payroll payment registration failed (${code}): ${error.message}`, code);
  }

  const result = data?.[0];
  if (!result) {
    throw new PayrollCloudSyncError(
      "Payroll payment registration returned no result.",
      "PAYROLL_CLOUD_PAYMENT_EMPTY_RESULT",
    );
  }

  return {
    employeeId: payload.employeeId,
    period: payload.period,
    frequency: payload.frequency,
    baseSalaryCents: result.period_salary_cents,
    periodSalaryCents: result.period_salary_cents,
    adjustmentDeltaCents: result.due_cents - result.period_salary_cents,
    dueCents: result.due_cents,
    alreadyPaidCents: result.paid_total_cents,
    pendingCents: result.pending_cents,
  };
}

function mapPaymentHistory(row: PayrollPaymentRemoteRow): PayrollPaymentHistory {
  return {
    employeeId: row.empleado_id,
    period: row.periodo,
    baseSalaryCents: Number(row.monto_base),
    periodSalaryCents: Number(row.monto_base),
    adjustmentsDeltaCents: Number(row.total_bonos) - Number(row.total_descuentos),
    amountPaidCents: Number(row.monto_pagado),
    createdAt: row.created_at ?? "",
  };
}
