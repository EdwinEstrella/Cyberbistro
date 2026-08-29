import type { PayrollCommand, PayrollRepositoryResult } from "./payrollContracts";

export function isPayrollLocalStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.electronAPI?.executePayrollCommand === "function";
}

export async function executePayrollCommandLocally(command: PayrollCommand): Promise<PayrollRepositoryResult> {
  const execute = isPayrollLocalStorageAvailable() ? window.electronAPI!.executePayrollCommand : undefined;
  if (!execute) throw new Error("Payroll local storage is unavailable");
  const result = await execute(command);
  return result.data;
}
