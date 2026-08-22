import { randomUUID } from "node:crypto";

export type PayablesCommand =
  | {
      type: "payables.create";
      id: string;
      supplierId: string;
      compraId?: string;
      totalAmount: number;
      dueDate?: string;
    }
  | {
      type: "payables.payment.record";
      paymentId: string;
      payableId: string;
      amount: number;
      paymentMethod: string;
    };

export type PayablesRepositoryResult = {
  commitId: string;
  localStatus: "committed";
  syncStatus: "pending";
};

export interface PayablesRepositoryStore {
  executePayablesCommand(input: {
    command: PayablesCommand;
    commitId: string;
    branchId: string;
  }): void;
}

export class PayablesRepository {
  constructor(
    private readonly input: {
      store: PayablesRepositoryStore;
      branchId: string;
      createCommitId?: () => string;
    },
  ) {}

  execute(command: PayablesCommand): PayablesRepositoryResult {
    const commitId = this.input.createCommitId?.() ?? randomUUID();
    this.input.store.executePayablesCommand({
      command,
      commitId,
      branchId: this.input.branchId,
    });
    return { commitId, localStatus: "committed", syncStatus: "pending" };
  }
}
