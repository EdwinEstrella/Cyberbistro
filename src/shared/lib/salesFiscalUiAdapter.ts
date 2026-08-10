import type { SalesFiscalCommand, SalesFiscalRepositoryResult } from "../../../electron/persistence/salesFiscalRepository";

export type FiscalPendingPresentation = { label: string; status: "pending_sync" };

export async function createLocalFiscalSale(command: SalesFiscalCommand): Promise<SalesFiscalRepositoryResult> {
  const execute = window.electronAPI?.executeSalesFiscalCommand;
  if (!execute) throw new Error("Sales fiscal local storage is unavailable");
  return (await execute(command)).data;
}

export function getFiscalPendingPresentation(fiscalMode: SalesFiscalCommand["fiscalMode"]): FiscalPendingPresentation {
  const label = fiscalMode === "internal_receipt"
    ? "Recibo local pendiente de sincronización"
    : fiscalMode === "ncf_legacy"
      ? "NCF local pendiente de sincronización"
      : "e-CF local pendiente de sincronización";
  return { label, status: "pending_sync" };
}
