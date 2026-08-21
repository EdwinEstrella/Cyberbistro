import type { PayrollEmployee, PayrollPaymentRequest } from "./payrollContracts";

export type PayrollCommand =
  | { type: "GET_EMPLOYEES"; tenantId: string; sucursalId: string }
  | { type: "UPSERT_EMPLOYEE"; tenantId: string; sucursalId: string; employee: Partial<PayrollEmployee> & { id?: string } }
  | { type: "DISABLE_EMPLOYEE"; tenantId: string; sucursalId: string; employeeId: string }
  | { type: "CREATE_PAYMENT"; tenantId: string; sucursalId: string; payload: PayrollPaymentRequest };

export type PayrollRepositoryResult =
  | { type: "EMPLOYEES_LIST"; employees: PayrollEmployee[] }
  | { type: "ID_RETURNED"; id: string }
  | { type: "SUCCESS" };

export async function executePayrollCommandLocally(command: PayrollCommand): Promise<PayrollRepositoryResult> {
  const execute = (window as any).electronAPI?.executePayrollCommand;
  if (!execute) throw new Error("Payroll local storage is unavailable");
  const result = await execute(command);
  return result.data;
}
