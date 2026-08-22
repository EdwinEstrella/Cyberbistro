import type { PayablesCommand, PayablesRepositoryResult } from "../../../electron/persistence/payablesRepository";

export async function executePayablesCommandLocally(command: PayablesCommand): Promise<PayablesRepositoryResult> {
  const execute = typeof window !== "undefined" ? window.electronAPI?.executePayablesCommand : undefined;
  if (!execute) throw new Error("Payables local storage is unavailable");
  const result = await execute(command);
  return result.data;
}
