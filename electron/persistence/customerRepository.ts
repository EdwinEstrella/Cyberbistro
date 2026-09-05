import { randomUUID } from "node:crypto";

export type CustomerCommand =
  | {
      type: "customer.upsert";
      id: string;
      name: string;
      phone?: string | null;
      email?: string | null;
      documentId?: string | null;
      address?: string | null;
      notes?: string | null;
    }
  | {
      type: "customer.delete";
      id: string;
    };

export type CustomerRepositoryResult = {
  commitId: string;
  localStatus: "committed";
  syncStatus: "pending";
};

export interface CustomerRepositoryStore {
  executeCustomerCommand(input: {
    command: CustomerCommand;
    commitId: string;
    branchId: string;
  }): void;
}

export class CustomerRepository {
  constructor(
    private readonly input: {
      store: CustomerRepositoryStore;
      branchId: string;
      createCommitId?: () => string;
    },
  ) {}

  execute(command: CustomerCommand): CustomerRepositoryResult {
    const commitId = this.input.createCommitId?.() ?? randomUUID();
    this.input.store.executeCustomerCommand({
      command,
      commitId,
      branchId: this.input.branchId,
    });
    return { commitId, localStatus: "committed", syncStatus: "pending" };
  }
}
