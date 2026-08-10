import { randomUUID } from "node:crypto";

export type CashPurchaseCommand = { type: "purchase.cash.create"; purchaseId: string; supplierId: string; detailId: string; inventoryMovementId: string; expenseId: string; inventoryProductId: string; quantity: number; unitCost: number };
export type CashPurchaseRepositoryResult = { commitId: string; localStatus: "committed"; syncStatus: "pending" };
export interface CashPurchaseRepositoryStore { executeCashPurchaseCommand(input: { command: CashPurchaseCommand; commitId: string; branchId: string }): void; }

/** Main-process-only cash purchase gateway; credit and AP are deliberately absent. */
export class CashPurchaseRepository {
  constructor(private readonly input: { store: CashPurchaseRepositoryStore; branchId: string; createCommitId?: () => string }) {}
  execute(command: CashPurchaseCommand): CashPurchaseRepositoryResult {
    const commitId = this.input.createCommitId?.() ?? randomUUID();
    this.input.store.executeCashPurchaseCommand({ command, commitId, branchId: this.input.branchId });
    return { commitId, localStatus: "committed", syncStatus: "pending" };
  }
}
