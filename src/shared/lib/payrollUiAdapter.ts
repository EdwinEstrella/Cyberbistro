import type { PayrollCommand, PayrollRepositoryResult } from "./payrollContracts";

export async function executePayrollCommandLocally(command: PayrollCommand): Promise<PayrollRepositoryResult> {
  const execute = window.electronAPI?.executePayrollCommand;
  if (!execute) throw new Error("Payroll local storage is unavailable");
  const result = await execute(command);
  return result.data;
}
