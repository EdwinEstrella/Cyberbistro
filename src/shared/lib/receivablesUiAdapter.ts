import type { ReceivablesCommand, ReceivablesRepositoryResult } from "../../../electron/persistence/receivablesRepository";

export async function executeReceivablesCommandLocally(command: ReceivablesCommand): Promise<ReceivablesRepositoryResult> {
  const execute = typeof window !== "undefined" ? window.electronAPI?.executeReceivablesCommand : undefined;
  if (!execute) throw new Error("Receivables local storage is unavailable");
  const result = await execute(command);
  return result.data;
}
