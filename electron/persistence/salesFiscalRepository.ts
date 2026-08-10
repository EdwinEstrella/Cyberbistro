import { randomUUID } from "node:crypto";

export type SalesFiscalCommand = {
  type: "sales.fiscal.create";
  invoiceId: string;
  fiscalIntentId: string;
  fiscalMode: "internal_receipt" | "ncf_legacy" | "dgii_ecf";
  documentType: string;
  total: number;
};

export type SalesFiscalRepositoryResult = { commitId: string; localStatus: "committed"; syncStatus: "pending" };

export interface SalesFiscalRepositoryStore {
  executeSalesFiscalCommand(input: { command: SalesFiscalCommand; commitId: string; branchId: string }): void;
}

/** Main-process-only fiscal command gateway; local pending state is never external acceptance. */
export class SalesFiscalRepository {
  constructor(private readonly input: { store: SalesFiscalRepositoryStore; branchId: string; createCommitId?: () => string }) {}

  execute(command: SalesFiscalCommand): SalesFiscalRepositoryResult {
    const commitId = this.input.createCommitId?.() ?? randomUUID();
    this.input.store.executeSalesFiscalCommand({ command, commitId, branchId: this.input.branchId });
    return { commitId, localStatus: "committed", syncStatus: "pending" };
  }
}
