import type { PayrollEmployee, PayrollFrequency } from "./payrollContracts";

type PayrollEmployeeRemoteError = {
  code?: string;
  message: string;
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
