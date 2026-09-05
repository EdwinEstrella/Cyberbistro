import { randomUUID } from "node:crypto";

export type ExpenseCommand =
  | {
      type: "expense.create";
      id: string;
      categoryId?: string | null;
      cycleId?: string | null;
      description: string;
      supplier?: string | null;
      amount: number;
      paymentMethod?: string | null;
      expenseDate?: string;
      notes?: string | null;
    }
  | {
      type: "expense.delete";
      id: string;
    }
  | {
      type: "expense.category.create";
      id: string;
      name: string;
      description?: string | null;
      color?: string;
    }
  | {
      type: "expense.category.delete";
      id: string;
    };

export type ExpenseRepositoryResult = {
  commitId: string;
  localStatus: "committed";
  syncStatus: "pending";
};

export interface ExpenseRepositoryStore {
  executeExpenseCommand(input: {
    command: ExpenseCommand;
    commitId: string;
    branchId: string;
  }): void;
}

export class ExpenseRepository {
  constructor(
    private readonly input: {
      store: ExpenseRepositoryStore;
      branchId: string;
      createCommitId?: () => string;
    },
  ) {}

  execute(command: ExpenseCommand): ExpenseRepositoryResult {
    const commitId = this.input.createCommitId?.() ?? randomUUID();
    this.input.store.executeExpenseCommand({
      command,
      commitId,
      branchId: this.input.branchId,
    });
    return { commitId, localStatus: "committed", syncStatus: "pending" };
  }
}
