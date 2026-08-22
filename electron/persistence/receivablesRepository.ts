import { randomUUID } from "node:crypto";

export type ReceivablesCommand =
  | {
      type: "receivables.create";
      id: string;
      customerId: string;
      facturaId?: string;
      totalAmount: number;
      dueDate?: string;
    }
  | {
      type: "receivables.payment.record";
      paymentId: string;
      receivableId: string;
      amount: number;
      paymentMethod: string;
    };

export type ReceivablesRepositoryResult = {
  commitId: string;
  localStatus: "committed";
  syncStatus: "pending";
};

export interface ReceivablesRepositoryStore {
  executeReceivablesCommand(input: {
    command: ReceivablesCommand;
    commitId: string;
    branchId: string;
  }): void;
}

export class ReceivablesRepository {
  constructor(
    private readonly input: {
      store: ReceivablesRepositoryStore;
      branchId: string;
      createCommitId?: () => string;
    },
  ) {}

  execute(command: ReceivablesCommand): ReceivablesRepositoryResult {
    const commitId = this.input.createCommitId?.() ?? randomUUID();
    this.input.store.executeReceivablesCommand({
      command,
      commitId,
      branchId: this.input.branchId,
    });
    return { commitId, localStatus: "committed", syncStatus: "pending" };
  }
}
